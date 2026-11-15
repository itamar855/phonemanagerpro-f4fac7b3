/* eslint-disable @typescript-eslint/no-explicit-any -- respostas JSON das APIs de IA sem tipos */
// Camada única de IA do CRM. Hoje: Gemini (chave GEMINI_API_KEY), com Groq de reserva.
// Trocar de provedor = mexer só aqui.

export interface ChatTurn { role: "user" | "model"; text: string }
export interface LlmResult { text: string; model: string; latencyMs: number; fallbackErrors?: string[] }

// Testados em 15/11/2026 com a chave da loja (ação "models" + simulador):
// 3.1-flash-lite respondeu em ~1,5 s; 3.8-flash dava 503 (sobrecarga) e flash-latest 429 (cota).
export const DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite";
const FALLBACK_GEMINI_MODELS = ["gemini-flash-lite-latest", "gemini-3.5-flash"];
const GROQ_MODEL = "openai/gpt-oss-120b";

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fn(ctrl.signal); } finally { clearTimeout(t); }
}

async function gemini(model: string, key: string, system: string, turns: ChatTurn[], schema: unknown, signal: AbortSignal) {
  const call = (thinking: boolean) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      generationConfig: {
        temperature: 0.3, response_mime_type: "application/json", response_schema: schema,
        // atendimento é conversa curta: pensar pouco deixa a resposta rápida
        ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
      },
    }),
    signal,
  });
  let res = await call(true);
  if (res.status === 400) {
    const peek = await res.clone().text();
    if (/thinking/i.test(peek)) res = await call(false); // modelo sem esse ajuste
  }
  const body = await res.text();
  if (!res.ok) throw Object.assign(new Error(`Gemini ${model} ${res.status}: ${body.slice(0, 300)}`), { status: res.status });
  const data = JSON.parse(body);
  const text = (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
  if (!text) throw new Error(`Gemini ${model}: resposta vazia (${data?.candidates?.[0]?.finishReason ?? "sem motivo"})`);
  return text;
}

async function groq(key: string, system: string, turns: ChatTurn[], signal: AbortSignal) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: GROQ_MODEL,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, ...turns.map((t) => ({ role: t.role === "model" ? "assistant" : "user", content: t.text }))],
    }),
    signal,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
  return String(JSON.parse(body)?.choices?.[0]?.message?.content ?? "");
}

/** Pede uma resposta em JSON. Tenta o modelo configurado, depois o reserva do Gemini, depois o Groq. */
export async function generateJson(opts: { system: string; turns: ChatTurn[]; schema: unknown; model?: string | null; timeoutMs?: number }): Promise<LlmResult> {
  const t0 = Date.now();
  const timeout = opts.timeoutMs ?? 20_000;
  const errors: string[] = [];
  const gKey = Deno.env.get("GEMINI_API_KEY");
  if (gKey) {
    const models = [...new Set([opts.model || DEFAULT_GEMINI_MODEL, ...FALLBACK_GEMINI_MODELS])];
    for (const m of models) {
      try {
        const text = await withTimeout(timeout, (s) => gemini(m, gKey, opts.system, opts.turns, opts.schema, s));
        return { text, model: m, latencyMs: Date.now() - t0, fallbackErrors: errors.length ? errors : undefined };
      } catch (e) {
        const msg = (e as Error).name === "AbortError" ? `${m}: demorou mais de ${timeout / 1000}s` : (e as Error).message;
        errors.push(msg.slice(0, 300));
      }
    }
  }
  const qKey = Deno.env.get("GROQ_API_KEY");
  if (qKey) {
    try {
      const text = await withTimeout(timeout, (s) => groq(qKey, opts.system, opts.turns, s));
      return { text, model: `groq:${GROQ_MODEL}`, latencyMs: Date.now() - t0, fallbackErrors: errors.length ? errors : undefined };
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  throw new Error(errors.length ? errors.join(" | ") : "Nenhuma chave de IA configurada (GEMINI_API_KEY ou GROQ_API_KEY).");
}
