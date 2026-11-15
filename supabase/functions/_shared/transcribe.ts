/* eslint-disable @typescript-eslint/no-explicit-any -- respostas JSON das APIs sem tipos */
// Transcrição de áudio (mensagens de voz do WhatsApp, ogg/opus).
// 1º Whisper no Groq (rápido); reserva: Gemini com o áudio embutido.

const MAX_BYTES = 15 * 1024 * 1024;

export function audioExt(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  if (m.includes("mp4") || m.includes("m4a") || m.includes("aac")) return "m4a";
  if (m.includes("webm")) return "webm";
  if (m.includes("wav")) return "wav";
  return "ogg";
}

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:.*?;base64,/, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function groqWhisper(key: string, bytes: Uint8Array, mime: string): Promise<string> {
  const form = new FormData();
  const type = mime.split(";")[0] || "audio/ogg";
  form.append("file", new Blob([bytes], { type }), `audio.${audioExt(mime)}`);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "pt");
  form.append("response_format", "json");
  form.append("temperature", "0");
  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Groq Whisper ${res.status}: ${body.slice(0, 200)}`);
  return String(JSON.parse(body)?.text ?? "").trim();
}

async function geminiAudio(key: string, bytes: Uint8Array, mime: string): Promise<string> {
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [
        { text: "Transcreva este áudio em português do Brasil, exatamente como foi falado. Responda só com a transcrição, sem comentários. Se não houver fala, responda vazio." },
        { inline_data: { mime_type: mime.split(";")[0] || "audio/ogg", data: bytesToBase64(bytes) } },
      ] }],
      generationConfig: { temperature: 0 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Gemini áudio ${res.status}: ${body.slice(0, 200)}`);
  const data = JSON.parse(body);
  return (data?.candidates?.[0]?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim();
}

/** Transcreve. Devolve "" quando não há fala; lança se nenhum provedor conseguir. */
export async function transcribeAudio(bytes: Uint8Array, mime: string): Promise<{ text: string; provider: string }> {
  if (!bytes.length) throw new Error("Áudio vazio.");
  if (bytes.length > MAX_BYTES) throw new Error("Áudio grande demais para transcrever.");
  const errors: string[] = [];
  const groq = Deno.env.get("GROQ_API_KEY");
  if (groq) {
    try { return { text: await groqWhisper(groq, bytes, mime), provider: "groq-whisper" }; }
    catch (e) { errors.push((e as Error).message); }
  }
  const gem = Deno.env.get("GEMINI_API_KEY");
  if (gem) {
    try { return { text: await geminiAudio(gem, bytes, mime), provider: "gemini" }; }
    catch (e) { errors.push((e as Error).message); }
  }
  throw new Error(errors.join(" | ") || "Nenhuma chave de IA para transcrever.");
}

/** Transcreve e grava na mensagem do CRM. Nunca lança (falha fica registrada). */
export async function transcribeMessage(admin: any, messageId: string, bytes: Uint8Array, mime: string) {
  try {
    const { text } = await transcribeAudio(bytes, mime);
    await admin.from("crm_messages").update({ transcript: text || null, transcript_status: text ? "done" : "empty" }).eq("id", messageId);
    return text;
  } catch (e) {
    console.error("[transcribe]", messageId, (e as Error).message);
    await admin.from("crm_messages").update({ transcript_status: "failed" }).eq("id", messageId);
    return null;
  }
}

/** Baixa o áudio de uma mensagem já gravada (bucket privado ou URL pública antiga). */
export async function loadMessageAudio(admin: any, msg: { media_path: string | null; media_url: string | null; media_mime: string | null }) {
  let url: string | null = msg.media_url;
  if (msg.media_path) {
    const { data } = await admin.storage.from("crm_media").createSignedUrl(msg.media_path, 300);
    url = data?.signedUrl ?? null;
  }
  if (!url) throw new Error("Áudio sem arquivo.");
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Não foi possível baixar o áudio (${res.status}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, mime: msg.media_mime || res.headers.get("content-type") || "audio/ogg" };
}
