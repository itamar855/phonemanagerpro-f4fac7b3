import { byStore, crmDb, throwIf } from "./db";
import type { CrmAutomationSettings, CrmDispatch, CrmTask, CrmTaskWithLinks } from "../lib/types";

const TASK_SELECT = "*, contact:crm_contacts(id, name, phone), deal:crm_deals(id, title, pipeline_id, status)";

/** mine = minhas + sem responsável (quem pegar primeiro). */
export type TaskScope = "mine" | "all";

export async function listTasks(args: { storeId: string | null; userId: string | null; scope: TaskScope; done: boolean }): Promise<CrmTaskWithLinks[]> {
  let q = crmDb.from("crm_tasks").select(TASK_SELECT);
  q = byStore(q, args.storeId);
  if (args.scope === "mine" && args.userId) q = q.or(`assigned_to.eq.${args.userId},assigned_to.is.null`);
  q = args.done
    ? q.not("done_at", "is", null).order("done_at", { ascending: false }).limit(60)
    : q.is("done_at", null).order("due_at", { ascending: true, nullsFirst: false }).order("created_at").limit(300);
  const { data, error } = await q;
  throwIf(error);
  return (data ?? []) as CrmTaskWithLinks[];
}

/** Tarefas abertas (e concluídas recentes) de um contato ou negócio. */
export async function listEntityTasks(args: { contactId?: string; dealId?: string }): Promise<CrmTaskWithLinks[]> {
  let q = crmDb.from("crm_tasks").select(TASK_SELECT);
  if (args.dealId) q = q.eq("deal_id", args.dealId);
  else if (args.contactId) q = q.eq("contact_id", args.contactId);
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  q = q.or(`done_at.is.null,done_at.gt.${since}`).order("done_at", { ascending: false, nullsFirst: true }).order("due_at", { ascending: true, nullsFirst: false }).limit(30);
  const { data, error } = await q;
  throwIf(error);
  return (data ?? []) as CrmTaskWithLinks[];
}

export interface NewTask {
  storeId: string;
  title: string;
  dueAt: string | null;
  assignedTo: string | null;
  notes?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  conversationId?: string | null;
  kind?: string;
  createdBy: string;
}

export async function createTask(t: NewTask): Promise<CrmTask> {
  const { data, error } = await crmDb
    .from("crm_tasks")
    .insert({
      store_id: t.storeId, title: t.title, due_at: t.dueAt, assigned_to: t.assignedTo, notes: t.notes ?? null,
      contact_id: t.contactId ?? null, deal_id: t.dealId ?? null, conversation_id: t.conversationId ?? null,
      kind: t.kind ?? "follow_up", created_by: t.createdBy, source: "user",
    })
    .select("*")
    .single();
  throwIf(error);
  return data as CrmTask;
}

export type TaskPatch = Partial<Pick<CrmTask, "title" | "notes" | "due_at" | "done_at" | "assigned_to">>;

export async function updateTask(id: string, patch: TaskPatch) {
  const { error } = await crmDb.from("crm_tasks").update(patch).eq("id", id);
  throwIf(error);
}

export async function deleteTask(id: string) {
  const { error } = await crmDb.from("crm_tasks").delete().eq("id", id);
  throwIf(error);
}

export async function taskCounts(storeId: string | null): Promise<{ overdue: number; today: number; open: number }> {
  const { data, error } = await crmDb.rpc("crm_task_counts", { p_store_id: storeId });
  throwIf(error);
  return (data ?? { overdue: 0, today: 0, open: 0 }) as { overdue: number; today: number; open: number };
}

/** Conversa de WhatsApp do contato (para abrir a partir de uma tarefa). */
export async function contactConversationId(contactId: string): Promise<string | null> {
  const { data, error } = await crmDb.from("crm_conversations").select("id, channel").eq("contact_id", contactId)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  throwIf(error);
  const rows = (data ?? []) as { id: string; channel: string }[];
  return (rows.find((r) => r.channel === "whatsapp") ?? rows[0])?.id ?? null;
}

// ------------------------------------------------------------ automações

export async function getAutomationSettings(storeId: string): Promise<CrmAutomationSettings | null> {
  const { data, error } = await crmDb.from("crm_automation_settings").select("*").eq("store_id", storeId).maybeSingle();
  throwIf(error);
  return (data ?? null) as CrmAutomationSettings | null;
}

/** Quem da loja tem telefone para receber o aviso da distribuição (só gerência). */
export async function teamPhones(storeId: string): Promise<Record<string, boolean>> {
  const { data, error } = await crmDb.rpc("crm_team_phones", { p_store_id: storeId });
  throwIf(error);
  return Object.fromEntries(((data ?? []) as { user_id: string; has_phone: boolean }[]).map((r) => [r.user_id, r.has_phone]));
}

/** Vez atual da conversa na distribuição (aguardando a loja abrir ou oferecida a alguém). */
export async function activeDispatch(conversationId: string): Promise<CrmDispatch | null> {
  const { data, error } = await crmDb.from("crm_dispatches").select("*").eq("conversation_id", conversationId)
    .in("status", ["waiting", "offered"]).maybeSingle();
  throwIf(error);
  return (data ?? null) as CrmDispatch | null;
}

export async function acceptDispatch(conversationId: string) {
  const { error } = await crmDb.rpc("crm_dispatch_accept", { p_conversation_id: conversationId });
  throwIf(error);
}

export async function saveAutomationSettings(storeId: string, userId: string, patch: Partial<Omit<CrmAutomationSettings, "store_id">>) {
  const { error } = await crmDb.from("crm_automation_settings").upsert({ store_id: storeId, ...patch, updated_by: userId });
  throwIf(error);
}
