import { crmDb, invokeFn, throwIf } from "./db";
import type { WhatsAppHealthRow } from "../lib/whatsappHealth";

/** Saúde do WhatsApp das lojas que a pessoa gerencia (vazio para quem não é gerência). */
export async function fetchWhatsAppHealth(): Promise<WhatsAppHealthRow[]> {
  const { data, error } = await crmDb.rpc("crm_whatsapp_health");
  throwIf(error);
  return (data ?? []) as WhatsAppHealthRow[];
}

/** Roda o vigia agora: confere webhook, sincroniza o que faltou e atualiza a saúde. */
export const runWhatsAppCheck = () => invokeFn<{ results: unknown[] }>("crm-watchdog", { action: "check" });
