import { supabase } from "@/integrations/supabase/client";
import { byStore, crmDb, invokeFn, throwIf } from "./db";
import type {
  Channel, ConversationStatus, CrmContact, CrmConversationWithContact, CrmMessage, CrmQuickReply, Handler, MessageKind,
} from "../lib/types";

export const PAGE_SIZE = 30;
const MEDIA_BUCKET = "crm_media";

export type InboxFilter = "open" | "mine" | "unassigned" | "ai" | "resolved";
export type ChannelTab = Channel | "all";

export interface ConversationQuery {
  storeId: string | null;
  channel: ChannelTab;
  filter: InboxFilter;
  search: string;
  userId: string | null;
}

const CONTACT_FIELDS = "id, name, phone, instagram_username, avatar_url, origin_channel, ignored, customer_id, tags, lead_kind";

/** Remove caracteres que quebram o filtro "or" do PostgREST. */
const safeTerm = (s: string) => s.replace(/[,()*%\\]/g, " ").trim();

export async function listConversations(q: ConversationQuery, cursor?: string | null): Promise<CrmConversationWithContact[]> {
  let query = crmDb
    .from("crm_conversations")
    .select(`*, contact:crm_contacts!inner(${CONTACT_FIELDS})`)
    .eq("contact.ignored", false)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  query = byStore(query, q.storeId);
  if (q.channel !== "all") query = query.eq("channel", q.channel);

  switch (q.filter) {
    case "open": query = query.neq("status", "resolved"); break;
    case "mine": query = query.neq("status", "resolved").eq("assigned_to", q.userId); break;
    case "unassigned": query = query.neq("status", "resolved").is("assigned_to", null); break;
    case "ai": query = query.neq("status", "resolved").eq("handler", "ai"); break;
    case "resolved": query = query.eq("status", "resolved"); break;
  }

  const term = safeTerm(q.search);
  if (term) {
    const digits = term.replace(/\D/g, "");
    const parts = [`name.ilike.*${term}*`, `instagram_username.ilike.*${term}*`];
    if (digits.length >= 4) parts.push(`phone.ilike.*${digits}*`);
    query = query.or(parts.join(","), { referencedTable: "contact" });
  }
  if (cursor) query = query.lt("last_message_at", cursor);

  const { data, error } = await query;
  throwIf(error);
  return (data ?? []) as CrmConversationWithContact[];
}

export async function getConversation(id: string): Promise<CrmConversationWithContact | null> {
  const { data, error } = await crmDb
    .from("crm_conversations")
    .select(`*, contact:crm_contacts!inner(${CONTACT_FIELDS})`)
    .eq("id", id)
    .maybeSingle();
  throwIf(error);
  return data as CrmConversationWithContact | null;
}

export interface InboxCounts {
  all: number; whatsapp: number; instagram: number;
  unread_all: number; unread_whatsapp: number; unread_instagram: number;
  mine: number; unassigned: number; ai: number;
}

export async function inboxCounts(storeId: string | null): Promise<InboxCounts> {
  const { data, error } = await crmDb.rpc("crm_inbox_counts", { p_store_id: storeId && storeId !== "all" ? storeId : null });
  throwIf(error);
  return data as InboxCounts;
}

export async function updateConversation(
  id: string,
  patch: Partial<{ status: ConversationStatus; assigned_to: string | null; handler: Handler; unread_count: number }>,
) {
  const { error } = await crmDb.from("crm_conversations").update(patch).eq("id", id);
  throwIf(error);
}

export async function logActivity(args: {
  storeId: string; userId: string; contactId: string; conversationId?: string; type: string; payload?: Record<string, unknown>;
}) {
  // Histórico é complementar: falha aqui não deve travar a ação principal.
  await crmDb.from("crm_activities").insert({
    store_id: args.storeId, contact_id: args.contactId, conversation_id: args.conversationId ?? null,
    actor_kind: "user", actor_id: args.userId, type: args.type, payload: args.payload ?? {},
  });
}

// ---------------------------------------------------------------- mensagens

export async function listMessages(conversationId: string, before?: string | null): Promise<CrmMessage[]> {
  let query = crmDb
    .from("crm_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  throwIf(error);
  return ((data ?? []) as CrmMessage[]).reverse();
}

export interface SendResult { sent: boolean; saved: boolean; external_id: string | null; message_id?: string | null; warning?: string }

export function sendMessage(args: { conversationId: string; kind: Exclude<MessageKind, "note" | "video" | "sticker">; body?: string; mediaPath?: string; mime?: string }) {
  return invokeFn<SendResult>("crm-send", {
    conversation_id: args.conversationId, kind: args.kind, body: args.body ?? "", media_path: args.mediaPath, mime: args.mime,
  });
}

export async function addNote(args: { storeId: string; conversationId: string; contactId: string; userId: string; body: string }) {
  const { data, error } = await crmDb
    .from("crm_messages")
    .insert({
      store_id: args.storeId, conversation_id: args.conversationId, contact_id: args.contactId,
      direction: "out", sender_kind: "user", sender_user_id: args.userId, kind: "note", body: args.body, status: "sent",
    })
    .select("*")
    .single();
  throwIf(error);
  return data as CrmMessage;
}

export async function uploadMedia(storeId: string, file: File): Promise<{ path: string; mime: string }> {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
  const path = `${storeId}/out/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type || undefined, upsert: false });
  throwIf(error);
  return { path, mime: file.type };
}

export async function mediaSignedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

// ---------------------------------------------------------------- equipe e respostas rápidas

export interface TeamMember { user_id: string; display_name: string; role: string | null }

export async function listTeam(storeId: string | null): Promise<TeamMember[]> {
  const { data, error } = await crmDb.rpc("crm_team", { p_store_id: storeId && storeId !== "all" ? storeId : null });
  throwIf(error);
  return (data ?? []) as TeamMember[];
}

export async function listQuickReplies(storeId: string | null): Promise<CrmQuickReply[]> {
  let query = crmDb.from("crm_quick_replies").select("id, store_id, shortcut, body").order("shortcut");
  query = byStore(query, storeId);
  const { data, error } = await query;
  throwIf(error);
  return (data ?? []) as CrmQuickReply[];
}

export async function createQuickReply(storeId: string, userId: string, shortcut: string, body: string) {
  const { error } = await crmDb.from("crm_quick_replies").insert({ store_id: storeId, created_by: userId, shortcut, body });
  throwIf(error);
}

export async function deleteQuickReply(id: string) {
  const { error } = await crmDb.from("crm_quick_replies").delete().eq("id", id);
  throwIf(error);
}

// ---------------------------------------------------------------- contato

export interface ContactDetail {
  contact: CrmContact;
  customer: { id: string; name: string; phone: string | null; cpf: string | null } | null;
  orders: { id: string; order_number: number; status: string; device_model: string | null; device_brand: string | null; final_price: number | null; created_at: string }[];
  conversations: { id: string; channel: Channel; status: ConversationStatus; last_message_at: string | null }[];
}

export async function getContactDetail(contactId: string): Promise<ContactDetail> {
  const { data: contact, error } = await crmDb.from("crm_contacts").select("*").eq("id", contactId).single();
  throwIf(error);
  const c = contact as CrmContact;

  const [customerRes, convRes] = await Promise.all([
    c.customer_id
      ? supabase.from("customers").select("id, name, phone, cpf").eq("id", c.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    crmDb.from("crm_conversations").select("id, channel, status, last_message_at").eq("contact_id", contactId),
  ]);

  let orders: ContactDetail["orders"] = [];
  if (c.customer_id) {
    const { data } = await supabase
      .from("service_orders")
      .select("id, order_number, status, device_model, device_brand, final_price, created_at")
      .eq("customer_id", c.customer_id)
      .order("created_at", { ascending: false })
      .limit(5);
    orders = (data ?? []) as ContactDetail["orders"];
  }
  return { contact: c, customer: (customerRes.data as ContactDetail["customer"]) ?? null, orders, conversations: convRes.data ?? [] };
}

export async function updateContact(id: string, patch: Partial<Pick<CrmContact, "name" | "tags" | "lead_kind" | "ignored" | "ignored_reason" | "notes" | "email">>) {
  const { error } = await crmDb.from("crm_contacts").update(patch).eq("id", id);
  throwIf(error);
}

// ---------------------------------------------------------------- canais

export interface ChannelStatus {
  configured: boolean;
  store_id?: string;
  shared_from_other_store?: boolean;
  instance_name?: string;
  api_host?: string;
  is_active?: boolean;
  has_api_key?: boolean;
  state?: string;
  reachable?: boolean;
  can_manage?: boolean;
}

export const channelStatus = (storeId: string | null) => invokeFn<ChannelStatus>("crm-channel", { action: "status", storeId });
export const channelConnect = (storeId: string | null) => invokeFn<{ base64?: string; pairingCode?: string }>("crm-channel", { action: "connect", storeId });
export const channelLogout = (storeId: string | null) => invokeFn("crm-channel", { action: "logout", storeId });
export const channelConfigureWebhook = (storeId: string | null) => invokeFn<{ url: string }>("crm-channel", { action: "configure-webhook", storeId });
export interface InstagramStatus {
  connected: boolean;
  username: string | null;
  token_expires_at: string | null;
  webhook_subscribed: boolean;
  has_app_secret: boolean;
  app_id: string | null;
  oauth_redirect_url: string | null;
  can_manage: boolean;
  webhook_url: string | null;
  verify_token: string | null;
}
export const igAppSave = (storeId: string | null, app_id: string, app_secret?: string) =>
  invokeFn("crm-channel", { action: "ig-app-save", storeId, app_id, app_secret });
export const igAuthUrl = (storeId: string | null, return_to: string) =>
  invokeFn<{ url: string }>("crm-channel", { action: "ig-auth-url", storeId, return_to });
export const igStatus = (storeId: string | null) => invokeFn<InstagramStatus>("crm-channel", { action: "ig-status", storeId });
export const igSave = (storeId: string | null, access_token: string, app_secret?: string) =>
  invokeFn<{ username: string; subscribed: boolean; subscribe_error: string | null }>("crm-channel", { action: "ig-save", storeId, access_token, app_secret });
export const igDisconnect = (storeId: string | null) => invokeFn("crm-channel", { action: "ig-disconnect", storeId });

export const channelSaveConfig =(storeId: string | null, cfg: { api_url: string; instance_name: string; api_key?: string; is_active?: boolean }) =>
  invokeFn("crm-channel", { action: "save-config", storeId, ...cfg });
