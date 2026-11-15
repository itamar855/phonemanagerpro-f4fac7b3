import { crmDb, invokeFn, throwIf } from "./db";
import type { CrmAiDecision, CrmAiRun, CrmAiSettings, CrmAiSuggestion } from "../lib/types";

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
  return invokeFn<{ decision: CrmAiDecision; model: string; latency_ms: number; open_now: boolean | null }>("crm-ai-agent", {
    action: "simulate", store_id: args.storeId, messages: args.messages, overrides: args.overrides, contact_name: args.contactName ?? null,
  });
}

export function suggestReply(conversationId: string) {
  return invokeFn<{ status: string; reason?: string; decision?: CrmAiDecision }>("crm-ai-agent", { action: "suggest", conversation_id: conversationId });
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

export async function listAiRuns(storeId: string | null, limit = 40): Promise<CrmAiRun[]> {
  let q = crmDb.from("crm_ai_runs").select("*, conversation:crm_conversations(id, contact:crm_contacts(name))")
    .order("created_at", { ascending: false }).limit(limit);
  if (storeId) q = q.eq("store_id", storeId);
  const { data, error } = await q;
  throwIf(error);
  return (data ?? []) as CrmAiRun[];
}
