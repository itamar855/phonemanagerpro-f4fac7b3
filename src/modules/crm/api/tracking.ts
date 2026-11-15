import { crmDb, invokeFn, throwIf } from "./db";
import type { Attribution } from "../lib/tracking";
export { attributionLabel, META_URL_PARAMS, slugify, TRACK_BASE, type Attribution } from "../lib/tracking";

export interface TrackingSettings {
  store_id: string;
  enabled: boolean;
  dataset_id: string | null;
  test_event_code: string | null;
  whatsapp_number: string | null;
  send_lead: boolean;
  send_qualified: boolean;
  send_purchase: boolean;
  qualified_event_name: string;
  qualified_stage_codes: string[];
  only_attributed: boolean;
}

export interface TrackLink { id: string; store_id: string; slug: string; name: string; message: string; active: boolean; created_at: string }

export interface MetaEvent {
  id: string; event_name: string; event_id: string; status: "pending" | "sent" | "failed" | "skipped";
  value: number | null; attempts: number; error: string | null; created_at: string; sent_at: string | null;
  contact: { name: string } | null;
}

export interface CampaignRow { source: string; campaign: string; adset: string; ad: string; contacts: number; replied: number; qualified: number; won: number; revenue: number }

export async function getTrackingSettings(storeId: string): Promise<TrackingSettings | null> {
  const { data, error } = await crmDb.from("crm_tracking_settings").select("*").eq("store_id", storeId).maybeSingle();
  throwIf(error);
  return (data ?? null) as TrackingSettings | null;
}

export const saveTracking = (storeId: string, patch: Partial<TrackingSettings> & { access_token?: string }) =>
  invokeFn("crm-meta", { action: "save", store_id: storeId, ...patch });
export const trackingStatus = (storeId: string) => invokeFn<{ has_token: boolean }>("crm-meta", { action: "status", store_id: storeId });
export const sendTestEvent = (storeId: string) => invokeFn<{ events_received: number | null }>("crm-meta", { action: "test", store_id: storeId });
export const connectedNumber = (storeId: string) =>
  invokeFn<{ owner_number?: string | null }>("crm-channel", { action: "status", storeId }).then((r) => r.owner_number ?? null);

export async function listLinks(storeId: string): Promise<TrackLink[]> {
  const { data, error } = await crmDb.from("crm_track_links").select("*").eq("store_id", storeId).order("created_at", { ascending: false });
  throwIf(error);
  return (data ?? []) as TrackLink[];
}

export async function createLink(args: { storeId: string; userId: string; name: string; slug: string; message: string }) {
  const { error } = await crmDb.from("crm_track_links").insert({
    store_id: args.storeId, name: args.name, slug: args.slug, message: args.message, created_by: args.userId,
  });
  if (error?.message?.includes("duplicate")) throw new Error("Esse endereço já existe. Escolha outro.");
  throwIf(error);
}

export async function setLinkActive(id: string, active: boolean) {
  const { error } = await crmDb.from("crm_track_links").update({ active }).eq("id", id);
  throwIf(error);
}

export async function linkClickCounts(storeId: string): Promise<Map<string, { clicks: number; matched: number }>> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data, error } = await crmDb.from("crm_track_clicks").select("link_id, contact_id").eq("store_id", storeId).gt("created_at", since).limit(5000);
  throwIf(error);
  const m = new Map<string, { clicks: number; matched: number }>();
  for (const r of (data ?? []) as { link_id: string | null; contact_id: string | null }[]) {
    if (!r.link_id) continue;
    const cur = m.get(r.link_id) ?? { clicks: 0, matched: 0 };
    cur.clicks++;
    if (r.contact_id) cur.matched++;
    m.set(r.link_id, cur);
  }
  return m;
}

export async function listMetaEvents(storeId: string): Promise<MetaEvent[]> {
  const { data, error } = await crmDb.from("crm_meta_events").select("id, event_name, event_id, status, value, attempts, error, created_at, sent_at, contact:crm_contacts(name)")
    .eq("store_id", storeId).order("created_at", { ascending: false }).limit(40);
  throwIf(error);
  return (data ?? []) as MetaEvent[];
}

export async function getAttribution(id: string): Promise<Attribution | null> {
  const { data, error } = await crmDb.from("crm_attributions").select("*").eq("id", id).maybeSingle();
  throwIf(error);
  return (data ?? null) as Attribution | null;
}

export async function trackingReport(storeId: string | null, from: Date, to: Date): Promise<CampaignRow[]> {
  const { data, error } = await crmDb.rpc("crm_tracking_report", { p_store_id: storeId, p_from: from.toISOString(), p_to: to.toISOString() });
  throwIf(error);
  return ((data ?? []) as CampaignRow[]).map((r) => ({ ...r, revenue: Number(r.revenue) }));
}
