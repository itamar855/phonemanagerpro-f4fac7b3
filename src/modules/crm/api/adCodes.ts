import { crmDb, throwIf } from "./db";
import { phoneKey } from "../lib/phone";
import type { AdCode } from "../lib/adCodes";

export async function listAdCodes(storeId: string): Promise<AdCode[]> {
  const { data, error } = await crmDb.from("crm_ad_codes").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
  throwIf(error);
  return (data ?? []) as AdCode[];
}

export async function createAdCode(a: {
  storeId: string; userId: string; code: string; level: AdCode["level"]; campaign: string; adset?: string | null; ad?: string | null;
  campaignId?: string | null; adsetId?: string | null; adId?: string | null;
}) {
  const { error } = await crmDb.from("crm_ad_codes").insert({
    store_id: a.storeId, code: a.code.toUpperCase(), level: a.level, campaign_name: a.campaign, adset_name: a.adset || null, ad_name: a.ad || null,
    campaign_id: a.campaignId || null, adset_id: a.adsetId || null, ad_id: a.adId || null, created_by: a.userId,
  });
  if (error?.message?.includes("duplicate")) throw new Error("Esse código já existe. Use outro.");
  if (error?.message?.includes("check")) throw new Error("Código inválido: comece com letra, até 6 letras/números.");
  throwIf(error);
}

export async function setAdCodeActive(id: string, active: boolean) {
  const { error } = await crmDb.from("crm_ad_codes").update({ active }).eq("id", id);
  throwIf(error);
}

// ------------------------------------------------------------ investimento

export async function addSpend(a: { storeId: string; userId: string; campaign: string; start: string; end: string; amount: number }) {
  const { error } = await crmDb.from("crm_campaign_spend").insert({
    store_id: a.storeId, campaign: a.campaign, period_start: a.start, period_end: a.end, amount: a.amount, created_by: a.userId,
  });
  throwIf(error);
}

export async function spendReport(storeId: string | null, from: Date, to: Date): Promise<Map<string, number>> {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const last = new Date(to.getTime() - 1); // fim do período é exclusivo
  const { data, error } = await crmDb.rpc("crm_campaign_spend_report", { p_store_id: storeId, p_from: iso(from), p_to: iso(last) });
  throwIf(error);
  return new Map(((data ?? []) as { campaign: string; spend: number }[]).map((r) => [r.campaign, Number(r.spend)]));
}

// ------------------------------------------------------------ contato repetido

export interface DuplicateHit { id: string; name: string; phone: string | null; instagram_username: string | null; by: "phone" | "username" }

/** Já existe alguém com este número ou este @ na loja? */
export async function findDuplicate(storeId: string, phone: string | null, username: string | null): Promise<DuplicateHit | null> {
  const key = phone ? phoneKey(phone) : null;
  if (key) {
    const { data } = await crmDb.from("crm_contacts").select("id, name, phone, instagram_username").eq("store_id", storeId).eq("phone_key", key).limit(1);
    if (data?.[0]) return { ...data[0], by: "phone" };
  }
  if (username) {
    const { data } = await crmDb.from("crm_contacts").select("id, name, phone, instagram_username").eq("store_id", storeId).ilike("instagram_username", username).limit(1);
    if (data?.[0]) return { ...data[0], by: "username" };
  }
  return null;
}
