import { byStore, crmDb, throwIf } from "./db";
import { normalizePhone, phoneKey as phoneKey_ } from "../lib/phone";
import type { CrmActivity, CrmContact, CrmDeal, CrmDealWithContact, CrmPipeline, CrmStage, Interest } from "../lib/types";

export async function listPipelines(storeId: string | null): Promise<(CrmPipeline & { store?: { name: string } | null })[]> {
  let q = crmDb.from("crm_pipelines").select("*, store:stores(name)").eq("archived", false).order("position");
  q = byStore(q, storeId);
  const { data, error } = await q;
  throwIf(error);
  return (data ?? []) as (CrmPipeline & { store?: { name: string } | null })[];
}

export async function listStages(pipelineId: string): Promise<CrmStage[]> {
  const { data, error } = await crmDb.from("crm_stages").select("*").eq("pipeline_id", pipelineId).order("position");
  throwIf(error);
  return (data ?? []) as CrmStage[];
}

const DEAL_SELECT = "*, contact:crm_contacts!inner(id, name, phone, avatar_url, origin_channel)";

/** Negócios do quadro: abertos + ganhos/perdidos nos últimos 30 dias. */
export async function listBoardDeals(pipelineId: string, ownerId?: string | null): Promise<CrmDealWithContact[]> {
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  let q = crmDb
    .from("crm_deals")
    .select(DEAL_SELECT)
    .eq("pipeline_id", pipelineId)
    .or(`status.eq.open,stage_entered_at.gt.${since}`)
    .order("position", { ascending: true })
    .limit(600);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data, error } = await q;
  throwIf(error);
  return (data ?? []) as CrmDealWithContact[];
}

export async function pipelineSummary(pipelineId: string, ownerId?: string | null) {
  const { data, error } = await crmDb.rpc("crm_pipeline_summary", { p_pipeline_id: pipelineId, p_owner_id: ownerId ?? null });
  throwIf(error);
  return new Map<string, { deals: number; total: number }>(
    ((data ?? []) as { stage_id: string; deals: number; total: number }[]).map((r) => [r.stage_id, { deals: r.deals, total: Number(r.total) }]),
  );
}

export async function listContactDeals(contactId: string): Promise<CrmDeal[]> {
  const { data, error } = await crmDb.from("crm_deals").select("*").eq("contact_id", contactId).order("created_at", { ascending: false });
  throwIf(error);
  return (data ?? []) as CrmDeal[];
}

export interface NewDeal {
  storeId: string;
  pipelineId: string;
  stageId: string;
  contactId: string;
  title: string;
  value: number;
  interest: Interest | null;
  ownerId: string | null;
  createdBy: string;
  originChannel?: string | null;
}

export async function createDeal(d: NewDeal): Promise<CrmDeal> {
  const { data, error } = await crmDb
    .from("crm_deals")
    .insert({
      store_id: d.storeId, pipeline_id: d.pipelineId, stage_id: d.stageId, contact_id: d.contactId,
      title: d.title, value: d.value, interest: d.interest, owner_id: d.ownerId, created_by: d.createdBy,
      origin_channel: d.originChannel ?? null, position: Date.now() / 1000,
    })
    .select("*")
    .single();
  throwIf(error);
  return data as CrmDeal;
}

export type DealPatch = Partial<Pick<CrmDeal, "title" | "value" | "interest" | "owner_id" | "expected_close_date" | "stage_id" | "pipeline_id" | "lost_reason" | "position" | "ai_summary">>;

export async function updateDeal(id: string, patch: DealPatch) {
  const { error } = await crmDb.from("crm_deals").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteDeal(id: string) {
  const { error } = await crmDb.from("crm_deals").delete().eq("id", id);
  throwIf(error);
}

export async function dealActivities(dealId: string): Promise<CrmActivity[]> {
  const { data, error } = await crmDb.from("crm_activities").select("*").eq("deal_id", dealId).order("created_at", { ascending: false }).limit(50);
  throwIf(error);
  return (data ?? []) as CrmActivity[];
}

export async function addDealNote(args: { storeId: string; dealId: string; contactId: string; userId: string; text: string }) {
  const { error } = await crmDb.from("crm_activities").insert({
    store_id: args.storeId, deal_id: args.dealId, contact_id: args.contactId,
    actor_kind: "user", actor_id: args.userId, type: "note", payload: { text: args.text },
  });
  throwIf(error);
}

// ---------------------------------------------------------------- contatos

export interface ContactListItem extends CrmContact {
  deals: { id: string; status: string; value: number }[];
  conversations: { id: string; channel: string; last_message_at: string | null }[];
}

export const CONTACTS_PAGE = 40;
export type ContactFilter = "all" | "customers" | "leads" | "ignored";

export async function listContacts(args: { storeId: string | null; search: string; filter: ContactFilter; page: number }): Promise<{ rows: ContactListItem[]; count: number }> {
  let q = crmDb
    .from("crm_contacts")
    .select("*, deals:crm_deals(id, status, value), conversations:crm_conversations(id, channel, last_message_at)", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(args.page * CONTACTS_PAGE, args.page * CONTACTS_PAGE + CONTACTS_PAGE - 1);
  q = byStore(q, args.storeId);
  if (args.filter === "ignored") q = q.eq("ignored", true);
  else {
    q = q.eq("ignored", false);
    if (args.filter === "customers") q = q.not("customer_id", "is", null);
    if (args.filter === "leads") q = q.is("customer_id", null);
  }
  const term = args.search.replace(/[,()*%\\]/g, " ").trim();
  if (term) {
    const digits = term.replace(/\D/g, "");
    const parts = [`name.ilike.*${term}*`, `instagram_username.ilike.*${term}*`];
    if (digits.length >= 4) parts.push(`phone.ilike.*${digits}*`);
    q = q.or(parts.join(","));
  }
  const { data, error, count } = await q;
  throwIf(error);
  return { rows: (data ?? []) as ContactListItem[], count: count ?? 0 };
}

export async function searchContacts(storeId: string | null, term: string): Promise<Pick<CrmContact, "id" | "name" | "phone" | "store_id" | "origin_channel">[]> {
  const t = term.replace(/[,()*%\\]/g, " ").trim();
  if (t.length < 2) return [];
  const digits = t.replace(/\D/g, "");
  const parts = [`name.ilike.*${t}*`];
  if (digits.length >= 4) parts.push(`phone.ilike.*${digits}*`);
  let q = crmDb.from("crm_contacts").select("id, name, phone, store_id, origin_channel").eq("ignored", false).or(parts.join(",")).limit(8);
  q = byStore(q, storeId);
  const { data, error } = await q;
  throwIf(error);
  return data ?? [];
}

export async function createContact(args: { storeId: string; name: string; phone: string }): Promise<CrmContact> {
  const n = normalizePhone(args.phone);
  const phone = n ? `55${n}` : null;
  const phoneKey = phoneKey_(args.phone);
  const { data, error } = await crmDb
    .from("crm_contacts")
    .insert({ store_id: args.storeId, name: args.name, phone, phone_key: phoneKey, origin_channel: "manual" })
    .select("*")
    .single();
  if (error?.message?.includes("crm_contacts_store_phone_key_uq")) throw new Error("Já existe um contato com esse telefone nesta loja.");
  throwIf(error);
  return data as CrmContact;
}
