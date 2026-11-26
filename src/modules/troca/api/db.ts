// Única porta do simulador de troca para o Supabase.
// As tabelas tradein_* não estão no types.ts gerado; o cast fica concentrado aqui.
import { supabase } from "@/integrations/supabase/client";
import type { AnswerLine, EvalStatus, TradeEvaluation, TradeModel, TradeRule, TradeSettings } from "../lib/types";
import type { PriceRow } from "../lib/priceList";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

const num = (v: unknown) => Number(v) || 0;

export async function fetchStores(): Promise<{ id: string; name: string }[]> {
  const { data, error } = await db.from("stores").select("id, name").order("name");
  throwIf(error);
  return (data ?? []).map((s: { id: string; name: string | null }) => ({ id: s.id, name: s.name ?? "Loja" }));
}

export async function fetchSettings(storeId: string): Promise<TradeSettings> {
  const { data, error } = await db.from("tradein_settings").select("store_id, negotiation_pct, round_to").eq("store_id", storeId).maybeSingle();
  throwIf(error);
  // loja sem linha ainda (não deveria acontecer: a migration cria) → padrão
  return data
    ? { store_id: data.store_id, negotiation_pct: num(data.negotiation_pct), round_to: num(data.round_to) || 10 }
    : { store_id: storeId, negotiation_pct: 10, round_to: 10 };
}

export async function saveSettings(s: TradeSettings): Promise<void> {
  const { error } = await db.from("tradein_settings").upsert(s, { onConflict: "store_id" });
  throwIf(error);
}

export async function fetchModels(storeId: string): Promise<TradeModel[]> {
  const { data, error } = await db
    .from("tradein_models")
    .select("id, store_id, brand, model, storage, base_price, active")
    .eq("store_id", storeId)
    .order("brand").order("model").order("base_price");
  throwIf(error);
  return (data ?? []).map((m: TradeModel) => ({ ...m, base_price: num(m.base_price) }));
}

export async function insertModels(storeId: string, rows: PriceRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await db.from("tradein_models").insert(rows.map((r) => ({ ...r, store_id: storeId })));
  throwIf(error);
}

export async function updateModel(id: string, patch: Partial<Pick<TradeModel, "brand" | "model" | "storage" | "base_price" | "active">>): Promise<void> {
  const { error } = await db.from("tradein_models").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteModel(id: string): Promise<void> {
  const { error } = await db.from("tradein_models").delete().eq("id", id);
  throwIf(error);
}

export async function fetchRules(storeId: string): Promise<TradeRule[]> {
  const { data, error } = await db
    .from("tradein_rules")
    .select("id, store_id, question, label, kind, amount, position, active")
    .eq("store_id", storeId)
    .order("question").order("position");
  throwIf(error);
  return (data ?? []).map((r: TradeRule) => ({ ...r, amount: num(r.amount) }));
}

export async function insertRule(rule: Omit<TradeRule, "id">): Promise<void> {
  const { error } = await db.from("tradein_rules").insert(rule);
  throwIf(error);
}

export async function updateRule(id: string, patch: Partial<Pick<TradeRule, "label" | "kind" | "amount" | "active">>): Promise<void> {
  const { error } = await db.from("tradein_rules").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteRule(id: string): Promise<void> {
  const { error } = await db.from("tradein_rules").delete().eq("id", id);
  throwIf(error);
}

export interface NewEvaluation {
  store_id: string;
  model_id: string | null;
  brand: string;
  model: string;
  storage: string;
  base_price: number;
  answers: AnswerLine[];
  discount_total: number;
  offer_min: number;
  offer_max: number;
  blocked: boolean;
  status: EvalStatus;
  agreed_value: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  imei: string | null;
  notes: string | null;
}

const EVAL_COLS = "id, store_id, created_by, customer_name, customer_phone, customer_email, model_id, brand, model, storage, imei, base_price, answers, discount_total, offer_min, offer_max, blocked, status, agreed_value, notes, sale_id, created_at";

function toEvaluation(e: TradeEvaluation): TradeEvaluation {
  return {
    ...e,
    base_price: num(e.base_price),
    discount_total: num(e.discount_total),
    offer_min: num(e.offer_min),
    offer_max: num(e.offer_max),
    agreed_value: e.agreed_value === null ? null : num(e.agreed_value),
    answers: Array.isArray(e.answers) ? e.answers : [],
  };
}

export async function createEvaluation(ev: NewEvaluation): Promise<TradeEvaluation> {
  const { data, error } = await db.from("tradein_evaluations").insert(ev).select(EVAL_COLS).single();
  throwIf(error);
  return toEvaluation(data);
}

export async function updateEvaluation(
  id: string,
  patch: Partial<Pick<TradeEvaluation, "status" | "agreed_value" | "customer_name" | "customer_phone" | "customer_email" | "imei" | "notes">>,
): Promise<TradeEvaluation> {
  const { data, error } = await db.from("tradein_evaluations").update(patch).eq("id", id).select(EVAL_COLS).single();
  throwIf(error);
  return toEvaluation(data);
}

export async function deleteEvaluation(id: string): Promise<void> {
  const { error } = await db.from("tradein_evaluations").delete().eq("id", id);
  throwIf(error);
}

export async function fetchEvaluations(storeId: string, limit = 150): Promise<TradeEvaluation[]> {
  const { data, error } = await db
    .from("tradein_evaluations")
    .select(EVAL_COLS)
    .eq("store_id", storeId)
    .order("created_at", { ascending: false })
    .limit(limit);
  throwIf(error);
  return (data ?? []).map(toEvaluation);
}

/** Nome de quem avaliou (profiles), para o histórico. */
export async function fetchNames(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return new Map();
  const { data } = await db.from("profiles").select("user_id, display_name").in("user_id", ids);
  return new Map((data ?? []).map((p: { user_id: string; display_name: string | null }) => [p.user_id, p.display_name || "Usuário"]));
}
