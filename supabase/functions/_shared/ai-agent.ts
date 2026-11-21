/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST sem tipos gerados */
// Executor do agente de IA do CRM: carrega a conversa, pede a decisão ao modelo,
// registra em crm_ai_runs e age (rascunho, envio no piloto automático ou passagem).
import {
  applyGuards, buildSystemPrompt, checkContext, typingDelayMs, DECISION_SCHEMA, defaultHandoffMessage, hoursText, isOpenNow, parseDecision, toTurns,
  type AgentDecision, type BusinessHours, type ServiceOrderInfo, type TranscriptMessage,
} from "./ai-agent-core.ts";
import { sendDispatchNotices } from "./dispatch.ts";
import { evolution, loadWhatsAppConfig, whatsappNumber } from "./evolution.ts";
import { generateJson, type ChatTurn } from "./llm.ts";
import { stockForConversation } from "./stock.ts";
import { stockQueryText } from "./stock-core.ts";
import { loadMessageAudio, transcribeMessage } from "./transcribe.ts";

export interface AiSettings {
  store_id: string;
  mode: "off" | "draft" | "autopilot";
  knowledge: string | null;
  persona: string | null;
  model: string | null;
  business_hours: BusinessHours | null;
  max_replies_per_day: number;
  max_turns: number;
  handoff_message: string | null;
  enabled_channels: string[];
  /** IA consulta o estoque e os preços de venda (padrão: sim) */
  stock_lookup?: boolean | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loadServiceOrders(admin: any, storeId: string, contact: any): Promise<ServiceOrderInfo[]> {
  const filters: string[] = [];
  if (contact.customer_id) filters.push(`customer_id.eq.${contact.customer_id}`);
  const digits = String(contact.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 10) filters.push(`customer_phone.ilike.*${digits.slice(-8, -4)}*${digits.slice(-4)}*`);
  if (!filters.length) return [];
  const { data } = await admin.from("service_orders")
    .select("order_number, device_brand, device_model, status, customer_id, customer_phone")
    .eq("store_id", storeId).or(filters.join(",")).neq("status", "cancelled")
    .order("created_at", { ascending: false }).limit(5);
  return (data ?? []).map((o: any) => ({ number: o.order_number, device: [o.device_brand, o.device_model].filter(Boolean).join(" "), status: o.status }));
}

/** Monta instruções + conversa e pede a decisão ao modelo (sem gravar nada). */
export async function decide(args: {
  settings: AiSettings; storeName: string;
  contact: { name: string | null; customer_id?: string | null; ai_summary?: string | null; notes?: string | null } | null;
  messages: TranscriptMessage[]; serviceOrders: ServiceOrderInfo[]; aiRepliesSoFar: number;
  examples?: { question: string | null; answer: string; has_price?: boolean }[];
  contextWarnings?: string[];
  /** Varia a frase de passagem entre conversas */
  seed?: string;
  stock?: string[] | null;
}) {
  const now = new Date();
  const openNow = isOpenNow(args.settings.business_hours, now);
  const system = buildSystemPrompt({
    storeName: args.storeName, knowledge: args.settings.knowledge, persona: args.settings.persona,
    contactName: args.contact?.name ?? null, isCustomer: Boolean(args.contact?.customer_id), now, openNow,
    hoursText: hoursText(args.settings.business_hours), serviceOrders: args.serviceOrders, handoffMessage: args.settings.handoff_message,
    examples: args.examples, memory: args.contact?.ai_summary ?? null, teamNotes: args.contact?.notes ?? null,
    contextWarnings: args.contextWarnings, stock: args.stock,
  });
  const turns: ChatTurn[] = toTurns(args.messages);
  if (!turns.length) throw new Error("Conversa sem mensagens do cliente.");
  const llm = await generateJson({ system, turns, schema: DECISION_SCHEMA, model: args.settings.model });
  const lastInbound = [...args.messages].reverse().find((m) => m.direction === "in") ?? null;
  const decision = applyGuards(parseDecision(llm.text), { aiRepliesSoFar: args.aiRepliesSoFar, maxTurns: args.settings.max_turns, lastInbound });
  if (decision.decision === "handoff" && !decision.reply) {
    decision.reply = args.settings.handoff_message?.trim() || defaultHandoffMessage(decision.customer_name ?? args.contact?.name ?? null, openNow, args.seed ?? args.contact?.name ?? "");
  }
  return { decision, llm, openNow, turns };
}

async function gate(admin: any, opts: { conversationId: string; forceDraft?: boolean }): Promise<{ skip: string } | { conv: any; contact: any; s: AiSettings }> {
  const { data: conv } = await admin.from("crm_conversations")
    .select("id, store_id, channel, handler, status, contact_id, external_thread_id, last_message_direction, contact:crm_contacts(id, name, phone, customer_id, ignored, ai_summary, notes)")
    .eq("id", opts.conversationId).maybeSingle();
  if (!conv) return { skip: "conversa não encontrada" };
  const contact: any = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;
  const { data: settings } = await admin.from("crm_ai_settings").select("*").eq("store_id", conv.store_id).maybeSingle();
  if (!settings) return { skip: "sem configuração" };
  const s = settings as AiSettings;
  if (!opts.forceDraft) {
    if (s.mode === "off") return { skip: "IA desligada" };
    if (conv.handler !== "ai") return { skip: "conversa com humano" };
    if (!s.enabled_channels?.includes(conv.channel)) return { skip: "canal sem IA" };
    if (conv.last_message_direction !== "in") return { skip: "já respondida" };
  }
  if (contact?.ignored) return { skip: "não é cliente" };
  return { conv, contact, s };
}

/** Exemplos aprovados da biblioteca parecidos com as últimas mensagens do cliente. Nunca lança. */
export async function similarExamples(admin: any, storeId: string, messages: TranscriptMessage[]) {
  const recent = messages.filter((m) => m.direction === "in").slice(-3)
    .map((m) => (m.kind === "audio" ? m.transcript : m.body) ?? "").join(" ").replace(/\[[^\]]*\]/g, " ").trim();
  if (recent.length < 4) return [];
  const { data, error } = await admin.rpc("crm_ai_similar_examples", { p_store_id: storeId, p_text: recent.slice(-500), p_limit: 5 });
  if (error) { console.error("[ai-agent] exemplos:", error.message); return []; }
  return (data ?? []) as { id: string; question: string | null; answer: string; has_price: boolean }[];
}

export type RunResult =
  | { status: "skipped"; reason: string }
  | { status: "done"; decision: AgentDecision; mode: "draft" | "autopilot"; run_id: string | null }
  | { status: "error"; error: string };

/**
 * Roda o agente numa conversa.
 * - debounceMs: espera a pessoa terminar de digitar (mensagens picadas); se chegar outra, esta execução desiste.
 * - forceDraft: pedido manual ("Sugerir resposta"): ignora o estado da IA na conversa e nunca envia sozinho.
 */
export async function runAgent(admin: any, opts: { conversationId: string; triggerMessageId?: string | null; debounceMs?: number; forceDraft?: boolean }): Promise<RunResult> {
  try {
    // checa antes (IA desligada não espera nada) e de novo depois da espera (alguém pode ter respondido)
    let g = await gate(admin, opts);
    if ("skip" in g) return { status: "skipped", reason: g.skip };
    if (opts.debounceMs) {
      await sleep(opts.debounceMs);
      g = await gate(admin, opts);
      if ("skip" in g) return { status: "skipped", reason: g.skip };
    }
    const { conv, contact, s } = g;

    // mensagens picadas: só a execução da última mensagem continua
    if (opts.triggerMessageId) {
      const { data: last } = await admin.from("crm_messages").select("id").eq("conversation_id", conv.id).eq("direction", "in")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last && last.id !== opts.triggerMessageId) return { status: "skipped", reason: "chegou mensagem mais nova" };
    }

    let mode: "draft" | "autopilot" = opts.forceDraft ? "draft" : s.mode === "autopilot" ? "autopilot" : "draft";

    // limite diário por conversa
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: runsToday } = await admin.from("crm_ai_runs").select("id", { count: "exact", head: true })
      .eq("conversation_id", conv.id).gt("created_at", since).in("decision", ["reply", "handoff"]);
    const overDaily = (runsToday ?? 0) >= (s.max_replies_per_day || 30);

    const [{ data: msgs }, { count: aiCount }, { data: store }, serviceOrders, { count: totalCount }] = await Promise.all([
      admin.from("crm_messages").select("id, direction, sender_kind, kind, body, created_at, inserted_at, transcript, transcript_status, media_path, media_url, media_mime")
        .eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(30),
      admin.from("crm_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id).eq("sender_kind", "ai"),
      admin.from("stores").select("name").eq("id", conv.store_id).maybeSingle(),
      loadServiceOrders(admin, conv.store_id, contact ?? {}),
      admin.from("crm_messages").select("id", { count: "exact", head: true }).eq("conversation_id", conv.id),
    ]);
    const messages = ((msgs ?? []) as (TranscriptMessage & { id: string; transcript_status: string | null; media_path: string | null; media_url: string | null; media_mime: string | null })[]).reverse();

    // áudios recentes do cliente ainda sem transcrição (ex.: chegaram antes deste recurso): transcreve agora
    const pending = messages.filter((m) => m.kind === "audio" && m.direction === "in" && !m.transcript_status && (m.media_path || m.media_url)).slice(-3);
    for (const m of pending) {
      try {
        const { bytes, mime } = await loadMessageAudio(admin, m);
        m.transcript = await transcribeMessage(admin, m.id, bytes, mime);
      } catch (e) {
        console.error("[ai-agent] transcrever:", (e as Error).message);
      }
    }

    // trava de contexto: sem contexto suficiente a IA não envia sozinha (e "ok/obrigado" nem precisa de resposta)
    const context = checkContext(messages, { hasOlder: (totalCount ?? 0) > messages.length });
    if (!opts.forceDraft && context.skip) return { status: "skipped", reason: context.skip };
    if (mode === "autopilot" && context.draftOnly.length) mode = "draft";

    const t0 = Date.now();
    const storeName = store?.name ?? "loja";
    const [examples, stock] = await Promise.all([
      similarExamples(admin, conv.store_id, messages),
      s.stock_lookup === false ? Promise.resolve(null) : stockForConversation(admin, conv.store_id, storeName, stockQueryText(messages, contact?.ai_summary)),
    ]);
    let result;
    try {
      result = await decide({
        settings: s, storeName, contact, messages, serviceOrders, examples, contextWarnings: context.warnings, stock: stock?.lines ?? null, seed: conv.id,
        aiRepliesSoFar: overDaily ? Number.MAX_SAFE_INTEGER : aiCount ?? 0,
      });
    } catch (e) {
      await admin.from("crm_ai_runs").insert({
        store_id: conv.store_id, conversation_id: conv.id, trigger_message_id: opts.triggerMessageId ?? null,
        decision: "error", error: (e as Error).message.slice(0, 1000), latency_ms: Date.now() - t0,
      });
      return { status: "error", error: (e as Error).message };
    }
    const d = result.decision;

    const { data: run } = await admin.from("crm_ai_runs").insert({
      store_id: conv.store_id, conversation_id: conv.id, trigger_message_id: opts.triggerMessageId ?? null,
      decision: d.decision, model: result.llm.model, latency_ms: result.llm.latencyMs,
      input: { mode, context_draft_only: context.draftOnly, stock_items: stock?.count ?? null, memory: Boolean(contact?.ai_summary), turns: result.turns.length, service_orders: serviceOrders.length, open_now: result.openNow, manual: Boolean(opts.forceDraft), examples: examples.map((e) => e.id) },
      output: d,
    }).select("id").single();
    const runId: string | null = run?.id ?? null;

    if (d.decision === "ignore") {
      // não parece cliente: a IA sai da conversa e deixa um aviso para a equipe
      await admin.from("crm_conversations").update({ handler: "human" }).eq("id", conv.id);
      await admin.from("crm_activities").insert({
        store_id: conv.store_id, contact_id: conv.contact_id, conversation_id: conv.id, actor_kind: "ai", type: "ai_not_customer",
        payload: { reason: d.reason },
      });
      return { status: "done", decision: d, mode, run_id: runId };
    }

    if (d.decision === "handoff") {
      const { error } = await admin.rpc("crm_ai_handoff", {
        p_conversation_id: conv.id, p_title: d.title || [d.interest === "repair" ? "Conserto" : null, d.device_model].filter(Boolean).join(" ") || contact?.name,
        p_summary: d.summary, p_score: d.score, p_interest: d.interest, p_reason: d.reason,
      });
      if (error) console.error("[ai-agent] handoff:", error.message);
    }

    // a mensagem (resposta ou frase de transição)
    if (d.reply) {
      // sugestões antigas ainda pendentes perdem a validade
      await admin.from("crm_ai_suggestions").update({ status: "discarded", decided_at: new Date().toISOString() })
        .eq("conversation_id", conv.id).eq("status", "pending");
      if (mode === "draft") {
        await admin.from("crm_ai_suggestions").insert({
          store_id: conv.store_id, conversation_id: conv.id, run_id: runId, kind: d.decision === "handoff" ? "handoff" : "reply", body: d.reply,
        });
      } else {
        await sendAsAi(admin, conv, contact, d.reply);
      }
    }
    // a passagem já entrou na fila de distribuição (gatilho no banco): avisa a pessoa da vez agora
    if (d.decision === "handoff") await sendDispatchNotices(admin);
    return { status: "done", decision: d, mode, run_id: runId };
  } catch (e) {
    console.error("[ai-agent]", (e as Error).message);
    return { status: "error", error: (e as Error).message };
  }
}

/** Envia pelo WhatsApp como IA e grava no CRM (usado no piloto automático). */
export async function sendAsAi(admin: any, conv: any, contact: any, text: string) {
  if (conv.channel !== "whatsapp") throw new Error("Piloto automático só no WhatsApp.");
  const cfg = await loadWhatsAppConfig(admin, conv.store_id);
  if (!cfg?.is_active) throw new Error("WhatsApp não conectado.");
  const number = whatsappNumber(contact?.phone ?? null, conv.external_thread_id);
  // "digitando…" pelo tempo que uma pessoa levaria para escrever
  const { externalId } = await evolution(cfg).sendText(number, text, { delayMs: typingDelayMs(text) });
  await admin.rpc("crm_ingest_message", {
    p_store_id: conv.store_id, p_channel: "whatsapp", p_direction: "out", p_sender_kind: "ai", p_kind: "text", p_body: text,
    p_phone: contact?.phone, p_external_id: externalId, p_status: "sent", p_create_contact: false,
  });
  return externalId;
}
