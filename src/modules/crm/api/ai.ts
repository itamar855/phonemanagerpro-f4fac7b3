import { crmDb, invokeFn, throwIf } from "./db";
import type { CrmAiDecision, CrmAiRun, CrmAiSettings, CrmAiSuggestion } from "../lib/types";
import { appendRule } from "../lib/teach";

export async function getAiSettings(storeId: string): Promise<CrmAiSettings | null> {
  const { data, error } = await crmDb.from("crm_ai_settings").select("*").eq("store_id", storeId).maybeSingle();
  throwIf(error);
  return (data ?? null) as CrmAiSettings | null;
}

export async function saveAiSettings(storeId: string, userId: string, patch: Partial<Omit<CrmAiSettings, "store_id">>) {
  const { error } = await crmDb.from("crm_ai_settings").upsert({ store_id: storeId, ...patch, updated_by: userId, updated_at: new Date().toISOString() });
  throwIf(error);
}

export interface SimMessage { from: "cliente" | "loja"; text: string }

export function simulateAi(args: { storeId: string; messages: SimMessage[]; overrides: Partial<CrmAiSettings>; contactName?: string }) {
  return invokeFn<{ decision: CrmAiDecision; model: string; latency_ms: number; open_now: boolean | null; stock_used?: string[] | null }>("crm-ai-agent", {
    action: "simulate", store_id: args.storeId, messages: args.messages, overrides: args.overrides, contact_name: args.contactName ?? null,
  });
}

export function suggestReply(conversationId: string) {
  return invokeFn<{ status: string; reason?: string; decision?: CrmAiDecision }>("crm-ai-agent", { action: "suggest", conversation_id: conversationId });
}

export function transcribeMessage(messageId: string) {
  return invokeFn<{ transcript: string }>("crm-ai-agent", { action: "transcribe", message_id: messageId });
}

export async function pendingSuggestion(conversationId: string): Promise<CrmAiSuggestion | null> {
  const { data, error } = await crmDb.from("crm_ai_suggestions").select("*").eq("conversation_id", conversationId).eq("status", "pending")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  throwIf(error);
  return (data ?? null) as CrmAiSuggestion | null;
}

export async function discardSuggestion(id: string, userId: string) {
  const { error } = await crmDb.from("crm_ai_suggestions").update({ status: "discarded", decided_by: userId, decided_at: new Date().toISOString() }).eq("id", id);
  throwIf(error);
}

/** Envia a sugestão (com ou sem edição). Pelo servidor: grava como mensagem da IA aprovada por quem enviou. */
export function sendSuggestion(args: { conversationId: string; suggestionId: string; body: string }) {
  return invokeFn<{ sent: boolean; warning?: string }>("crm-send", {
    conversation_id: args.conversationId, kind: "text", body: args.body, ai_suggestion_id: args.suggestionId,
  });
}

export async function setConversationHandler(conversationId: string, handler: "ai" | "human") {
  const { error } = await crmDb.rpc("crm_set_conversation_handler", { p_conversation_id: conversationId, p_handler: handler });
  throwIf(error);
}

// ------------------------------------------------------------ aprendizado

export interface AiExample {
  id: string;
  store_id: string;
  kind: "qa" | "fact";
  topic: string | null;
  question: string | null;
  answer: string;
  source: "history" | "correction" | "manual";
  status: "pending" | "approved" | "rejected";
  has_price: boolean;
  created_at: string;
}

export interface AiLearningJob {
  id: string;
  store_id: string;
  status: "running" | "done" | "failed" | "cancelled";
  months: number;
  cursor: number;
  total: number;
  processed: number;
  skipped: number;
  examples: number;
  facts: number;
  knowledge_draft: string | null;
  error: string | null;
  heartbeat_at: string;
  created_at: string;
  finished_at: string | null;
}

export interface AiStats {
  sent_as_is: number; sent_edited: number; discarded: number; pending: number;
  handoffs: number; handoff_won: number; library: number; to_review: number;
}

export async function aiStats(storeId: string): Promise<AiStats> {
  const { data, error } = await crmDb.rpc("crm_ai_stats", { p_store_id: storeId, p_days: 30 });
  throwIf(error);
  return data as AiStats;
}

export async function listExamples(storeId: string, status: AiExample["status"]): Promise<AiExample[]> {
  const { data, error } = await crmDb.from("crm_ai_examples").select("*").eq("store_id", storeId).eq("kind", "qa").eq("status", status)
    .order("created_at", { ascending: false }).limit(200);
  throwIf(error);
  return (data ?? []) as AiExample[];
}

export async function updateExample(id: string, userId: string, patch: Partial<Pick<AiExample, "status" | "answer" | "question">>) {
  const { error } = await crmDb.from("crm_ai_examples").update({ ...patch, decided_by: userId, decided_at: new Date().toISOString() }).eq("id", id);
  throwIf(error);
}

export async function approveExamples(ids: string[], userId: string) {
  if (!ids.length) return;
  const { error } = await crmDb.from("crm_ai_examples").update({ status: "approved", decided_by: userId, decided_at: new Date().toISOString() }).in("id", ids);
  throwIf(error);
}

export async function createExample(storeId: string, userId: string, question: string, answer: string) {
  const { error } = await crmDb.from("crm_ai_examples").insert({
    store_id: storeId, kind: "qa", question, answer, source: "manual", status: "approved", decided_by: userId, decided_at: new Date().toISOString(),
  });
  throwIf(error);
}

/**
 * "Ensinar" direto na conversa: a resposta corrigida vira exemplo aprovado (a IA usa em casos parecidos)
 * e, se vier uma regra, ela entra no "O que a IA sabe sobre a loja". Só gerência (RLS).
 */
export async function teachAi(args: { storeId: string; userId: string; conversationId: string; question: string; answer: string; rule?: string }) {
  const { error } = await crmDb.from("crm_ai_examples").insert({
    store_id: args.storeId, kind: "qa", question: args.question.trim() || null, answer: args.answer.trim(), source: "correction", status: "approved",
    conversation_ref: args.conversationId, decided_by: args.userId, decided_at: new Date().toISOString(),
  });
  throwIf(error);
  if (args.rule?.trim()) {
    const current = await getAiSettings(args.storeId);
    const knowledge = appendRule(current?.knowledge ?? null, args.rule);
    if (knowledge !== (current?.knowledge ?? "").replace(/\s+$/, "")) await saveAiSettings(args.storeId, args.userId, { knowledge });
  }
}

export async function latestLearningJob(storeId: string): Promise<AiLearningJob | null> {
  const { data, error } = await crmDb.from("crm_ai_learning_jobs")
    .select("id, store_id, status, months, cursor, total, processed, skipped, examples, facts, knowledge_draft, error, heartbeat_at, created_at, finished_at")
    .eq("store_id", storeId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  throwIf(error);
  return (data ?? null) as AiLearningJob | null;
}

export const startLearning = (storeId: string, months: number) =>
  invokeFn<{ job_id: string; total: number }>("crm-ai-learn", { action: "start", store_id: storeId, months });
export const resumeLearning = (jobId: string) => invokeFn("crm-ai-learn", { action: "resume", job_id: jobId });
export const cancelLearning = (jobId: string) => invokeFn("crm-ai-learn", { action: "cancel", job_id: jobId });

export async function listAiRuns(storeId: string | null, limit = 40): Promise<CrmAiRun[]> {
  let q = crmDb.from("crm_ai_runs").select("*, conversation:crm_conversations(id, contact:crm_contacts(name))")
    .order("created_at", { ascending: false }).limit(limit);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  throwIf(error);
  return (data ?? []) as CrmAiRun[];
}
