import { crmDb, throwIf } from "./db";

export type IgSource = "ad" | "post" | "story" | "organic";

export interface IgLeadResult {
  contact_id: string;
  conversation_id: string;
  deal_id: string;
  existing: boolean;
  contact_name: string;
  store_name: string | null;
}

export async function createInstagramLead(a: {
  storeId: string; phone: string; name?: string | null; username?: string | null; interest?: string | null;
  subject?: string | null; source: IgSource; campaign?: string | null; ownerId?: string | null; adCode?: string | null;
}): Promise<IgLeadResult> {
  const { data, error } = await crmDb.rpc("crm_create_instagram_lead", {
    p_store_id: a.storeId, p_phone: a.phone, p_name: a.name || null, p_username: a.username || null, p_interest: a.interest || null,
    p_subject: a.subject || null, p_source: a.source, p_campaign: a.campaign || null, p_owner_id: a.ownerId || null, p_ad_code: a.adCode || null,
  });
  throwIf(error);
  return data as IgLeadResult;
}

/** Campanhas já usadas (rastreamento + cadastros manuais + links), para sugerir no campo. */
export async function campaignSuggestions(storeId: string): Promise<string[]> {
  const [{ data: a }, { data: l }] = await Promise.all([
    crmDb.from("crm_attributions").select("utm_campaign").eq("store_id", storeId).not("utm_campaign", "is", null).order("created_at", { ascending: false }).limit(300),
    crmDb.from("crm_track_links").select("name").eq("store_id", storeId).eq("active", true).limit(50),
  ]);
  const all = [...(a ?? []).map((r: { utm_campaign: string }) => r.utm_campaign), ...(l ?? []).map((r: { name: string }) => r.name)];
  return [...new Set(all.map((s) => s.trim()).filter(Boolean))].slice(0, 30);
}

export async function igFirstMessageTemplate(storeId: string): Promise<string | null> {
  const { data } = await crmDb.from("crm_automation_settings").select("ig_first_message").eq("store_id", storeId).maybeSingle();
  return (data?.ig_first_message as string | undefined) ?? null;
}

export interface IgManualReport { leads: number; from_ads: number; replied: number; median_reply_min: number | null; won: number; revenue: number }

export async function igManualReport(storeId: string | null, from: Date, to: Date): Promise<IgManualReport> {
  const { data, error } = await crmDb.rpc("crm_ig_manual_report", { p_store_id: storeId, p_from: from.toISOString(), p_to: to.toISOString() });
  throwIf(error);
  return data as IgManualReport;
}
