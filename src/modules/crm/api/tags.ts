import { crmDb, invokeFn, throwIf } from "./db";
import type { CrmTag } from "../lib/labels";

/** Etiquetas prontas de todas as lojas que a pessoa acessa (a RLS filtra). */
export async function listTags(): Promise<CrmTag[]> {
  const { data, error } = await crmDb.from("crm_tags").select("id, store_id, name, color").order("created_at").order("name");
  throwIf(error);
  return (data ?? []) as CrmTag[];
}

export async function createTag(storeId: string, name: string, color: string) {
  const { error } = await crmDb.from("crm_tags").insert({ store_id: storeId, name: name.trim(), color });
  if (error?.code === "23505") throw new Error("Já existe uma etiqueta com esse nome nesta loja.");
  throwIf(error);
}

export async function updateTag(id: string, patch: { name?: string; color?: string }) {
  const { error } = await crmDb.from("crm_tags").update(patch).eq("id", id);
  if (error?.code === "23505") throw new Error("Já existe uma etiqueta com esse nome nesta loja.");
  throwIf(error);
}

export async function deleteTag(id: string) {
  const { error } = await crmDb.from("crm_tags").delete().eq("id", id);
  throwIf(error);
}

export interface TagRecentResult { processed: number; tagged: number; failed: number; more: boolean }

/** A IA etiqueta as conversas dos últimos dias que ainda não passaram por ela (um lote por chamada). */
export function tagRecentConversations(storeId: string | null, days = 30) {
  return invokeFn<TagRecentResult>("crm-ai-agent", { action: "tag_recent", store_id: storeId, days });
}
