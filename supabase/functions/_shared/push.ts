/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST sem tipos gerados */
// Aviso no celular (Web Push) de mensagem nova no CRM. Chaves VAPID nos segredos do Supabase.
import webpush from "npm:web-push@3.6.7";
import { buildPushPayload, isGoneStatus, storeShortName, type PushPayload } from "./push-core.ts";

let configured: boolean | null = null;

function configure(): boolean {
  if (configured !== null) return configured;
  const pub = Deno.env.get("VAPID_PUBLIC_KEY");
  const priv = Deno.env.get("VAPID_PRIVATE_KEY");
  if (!pub || !priv) { configured = false; return false; }
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "https://cellpro360.vercel.app", pub, priv);
  configured = true;
  return true;
}

export const vapidPublicKey = () => Deno.env.get("VAPID_PUBLIC_KEY") ?? null;

export interface PushTarget { subscription_id: string; endpoint: string; p256dh: string; auth: string }

/** Envia para as inscrições; apaga as que o serviço diz que não existem mais. Nunca lança. */
export async function sendPush(admin: any, targets: PushTarget[], payload: PushPayload) {
  if (!targets.length || !configure()) return { sent: 0, gone: 0, failed: 0 };
  let sent = 0, gone = 0, failed = 0;
  const data = JSON.stringify(payload);
  await Promise.all(targets.map(async (t) => {
    try {
      await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, data, { TTL: 3600, urgency: "high" });
      sent++;
      await admin.from("crm_push_subscriptions").update({ last_ok_at: new Date().toISOString() }).eq("id", t.subscription_id);
    } catch (e: any) {
      if (isGoneStatus(e?.statusCode)) {
        gone++;
        await admin.from("crm_push_subscriptions").delete().eq("id", t.subscription_id);
      } else {
        failed++;
        console.error("[push]", e?.statusCode ?? "", String(e?.body ?? e?.message ?? e).slice(0, 200));
      }
    }
  }));
  return { sent, gone, failed };
}

/** Mensagem recebida do cliente: avisa o dono (e admins) ou, sem dono, todos com CRM. Nunca lança. */
export async function notifyInbound(admin: any, conversationId: string) {
  try {
    if (!configure()) return;
    const { data: claimed, error: claimErr } = await admin.rpc("crm_push_claim", { p_conversation_id: conversationId });
    if (claimErr) throw new Error(claimErr.message);
    if (!claimed) return; // rajada: já avisou há menos de 45 s
    const [{ data: targets, error }, { data: conv }] = await Promise.all([
      admin.rpc("crm_push_recipients", { p_conversation_id: conversationId }),
      admin.from("crm_conversations")
        .select("id, channel, store:stores(name), contact:crm_contacts(name, ignored)")
        .eq("id", conversationId).maybeSingle(),
    ]);
    if (error) throw new Error(error.message);
    if (!targets?.length || !conv) return;
    const contact: any = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;
    if (contact?.ignored) return;
    const store: any = Array.isArray(conv.store) ? conv.store[0] : conv.store;
    const { data: msg } = await admin.from("crm_messages").select("kind, body")
      .eq("conversation_id", conversationId).eq("direction", "in").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const payload = buildPushPayload({
      conversationId, contactName: contact?.name ?? null, storeLabel: storeShortName(store?.name), kind: msg?.kind ?? "text",
      body: msg?.body ?? null, channel: conv.channel,
    });
    const r = await sendPush(admin, targets as PushTarget[], payload);
    if (r.failed) console.error("[push] falhas:", r.failed);
  } catch (e) {
    console.error("[push] aviso:", (e as Error).message);
  }
}
