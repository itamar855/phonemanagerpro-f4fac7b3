import { crmDb, invokeFn, throwIf } from "./db";
import type { WhatsAppHealthRow } from "../lib/whatsappHealth";

/** Saúde do WhatsApp das lojas que a pessoa gerencia (vazio para quem não é gerência). */
export async function fetchWhatsAppHealth(): Promise<WhatsAppHealthRow[]> {
  const { data, error } = await crmDb.rpc("crm_whatsapp_health");
  throwIf(error);
  return (data ?? []) as WhatsAppHealthRow[];
}

export interface WhatsAppSyncResult {
  hours: number;
  covered_from: string | null;
  complete: boolean;
  direct: number;
  missing: number;
  saved: number;
  skipped: number;
  lid_queue: number;
  errors: number;
  remaining: number;
  message: string;
}

/** Botão "Sincronizar mensagens": busca na Evolution o que faltou no CRM nas últimas N horas (sem IA nem avisos). */
export const syncWhatsApp = (storeId: string, hours: number) =>
  invokeFn<WhatsAppSyncResult>("crm-watchdog", { action: "sync", store_id: storeId, hours });

/** Roda o vigia agora: confere webhook, sincroniza o que faltou e atualiza a saúde. */
export const runWhatsAppCheck = () => invokeFn<{ results: unknown[] }>("crm-watchdog", { action: "check" });
