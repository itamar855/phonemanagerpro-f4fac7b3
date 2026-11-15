/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST sem tipos */
// Aviso de atendimento no WhatsApp da pessoa da equipe (distribuição do CRM).
// As regras e a fila ficam no banco (crm_dispatch_*); aqui só sai a mensagem.
import { type DispatchNotice, noticeText } from "./dispatch-core.ts";
import { evolution, loadWhatsAppConfig } from "./evolution.ts";

const APP_URL = () => Deno.env.get("APP_URL") || "https://cellpro360.vercel.app";

/** Pega os avisos pendentes no banco e manda pelo WhatsApp da loja. Nunca lança. */
export async function sendDispatchNotices(admin: any): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  try {
    const { data, error } = await admin.rpc("crm_dispatch_claim_notifications", { p_limit: 20 });
    if (error) throw new Error(error.message);
    const list = (data ?? []) as DispatchNotice[];
    const configs = new Map<string, any>();
    for (const n of list) {
      try {
        if (!n.staff_phone) throw new Error("pessoa sem telefone");
        if (!configs.has(n.store_id)) configs.set(n.store_id, await loadWhatsAppConfig(admin, n.store_id));
        const cfg = configs.get(n.store_id);
        if (!cfg?.is_active) throw new Error("WhatsApp da loja não conectado");
        await evolution(cfg).sendText(`${n.staff_phone}@s.whatsapp.net`, noticeText(n, APP_URL()));
        await admin.rpc("crm_dispatch_notified", { p_id: n.id, p_ok: true });
        sent += 1;
      } catch (e) {
        await admin.rpc("crm_dispatch_notified", { p_id: n.id, p_ok: false, p_error: (e as Error).message });
        failed += 1;
      }
    }
  } catch (e) {
    console.error("[dispatch]", (e as Error).message);
  }
  return { sent, failed };
}
