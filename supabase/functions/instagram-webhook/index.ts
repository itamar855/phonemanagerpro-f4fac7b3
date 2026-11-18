/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Meta) sem tipos */
// Webhook do Instagram (API com login do Instagram) → CRM.
// GET: verificação da Meta (hub.verify_token). POST: mensagens, ecos e leituras,
// validados pela assinatura X-Hub-Signature-256 com a chave secreta do app.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminClient, corsHeaders, json } from "../_shared/http.ts";
import { igProfile, loadInstagramAccount, validMetaSignature, type InstagramAccount } from "../_shared/instagram.ts";
import { safeEqual } from "../whatsapp-webhook/auth.ts";
import { tagConversation } from "../_shared/ai-tagger.ts";
import { notifyInbound } from "../_shared/push.ts";

const rt = (globalThis as any).EdgeRuntime;
const background = (p: Promise<unknown>) => (rt?.waitUntil ? rt.waitUntil(p) : p);

const MAX_MEDIA = 16 * 1024 * 1024;
const KIND: Record<string, "image" | "audio" | "video" | "document"> = {
  image: "image", audio: "audio", video: "video", file: "document", ig_reel: "video", reel: "video",
};
const LABEL: Record<string, string> = {
  image: "[Imagem]", audio: "[Áudio]", video: "[Vídeo]", file: "[Documento]", share: "[Compartilhamento]",
  story_mention: "[Mencionou você no story]", ig_reel: "[Reel]", reel: "[Reel]", ig_post: "[Publicação]", fallback: "[Anexo]",
};

async function saveMedia(admin: SupabaseClient, storeId: string, mid: string, url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type")?.split(";")[0] || "application/octet-stream";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_MEDIA) return null;
    const ext = mime.split("/")[1]?.replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${storeId}/instagram/${mid.replace(/[^A-Za-z0-9_-]/g, "").slice(-60)}.${ext}`;
    const { error } = await admin.storage.from("crm_media").upload(path, buf, { contentType: mime, upsert: true });
    if (error) { console.error("[IG Webhook] upload:", error.message); return null; }
    return { path, mime };
  } catch (e) {
    console.error("[IG Webhook] mídia:", (e as Error).message);
    return null;
  }
}

async function handleEvent(admin: SupabaseClient, acct: InstagramAccount, ev: any) {
  // Leitura de mensagem enviada por nós
  if (ev.read?.mid) {
    await admin.rpc("crm_update_message_status", { p_store_id: acct.store_id, p_external_id: ev.read.mid, p_status: "read" });
    return;
  }
  const m = ev.message;
  if (!m || m.is_deleted || m.is_unsupported || !m.mid) return;

  const echo = Boolean(m.is_echo);
  const igsid = String(echo ? ev.recipient?.id : ev.sender?.id);
  if (!igsid || igsid === acct.ig_user_id) return;

  const att = Array.isArray(m.attachments) ? m.attachments[0] : null;
  const attType = String(att?.type ?? "");
  let kind: "text" | "image" | "audio" | "video" | "document" = "text";
  let body: string = m.text ?? "";
  let media: { path: string; mime: string } | null = null;
  if (att) {
    kind = KIND[attType] ?? "text";
    if (!body) body = LABEL[attType] ?? LABEL.fallback;
    if (kind !== "text" && att.payload?.url) media = await saveMedia(admin, acct.store_id, m.mid, att.payload.url);
    if (kind === "text" && att.payload?.url) body = `${body} ${att.payload.url}`;
  }
  if (!body && !media) return;

  // Nome e foto só na primeira mensagem de quem ainda não é contato
  let profile: { name?: string; username?: string; profile_pic?: string } | null = null;
  if (!echo) {
    const { data: known } = await admin.from("crm_contacts").select("id").eq("store_id", acct.store_id).eq("instagram_user_id", igsid).limit(1);
    if (!known || known.length === 0) profile = await igProfile(acct.access_token, igsid);
  }

  const { data: crm, error } = await admin.rpc("crm_ingest_message", {
    p_store_id: acct.store_id,
    p_channel: "instagram",
    p_direction: echo ? "out" : "in",
    p_sender_kind: echo ? "user" : "contact",
    p_kind: kind,
    p_body: body,
    p_instagram_user_id: igsid,
    p_instagram_username: profile?.username ?? null,
    p_name: profile?.name || (profile?.username ? `@${profile.username}` : null),
    p_avatar_url: profile?.profile_pic ?? null,
    p_external_thread_id: igsid,
    p_media_path: media?.path ?? null,
    p_media_mime: media?.mime ?? null,
    p_external_id: m.mid,
    p_created_at: ev.timestamp ? new Date(Number(ev.timestamp)).toISOString() : null,
  });
  if (error) console.error("[IG Webhook] ingest:", error.message);
  // mensagem nova do cliente: aviso no celular e a IA etiqueta o lead, em segundo plano
  if (!echo && crm?.conversation_id && !crm.duplicate && !crm.ignored) {
    background(notifyInbound(admin, crm.conversation_id));
    background(tagConversation(admin, { conversationId: crm.conversation_id, triggerMessageId: crm.message_id, debounceMs: 8000 }));
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);

  // Verificação do webhook pela Meta
  if (req.method === "GET") {
    const expected = Deno.env.get("INSTAGRAM_VERIFY_TOKEN");
    const token = url.searchParams.get("hub.verify_token") ?? "";
    if (url.searchParams.get("hub.mode") === "subscribe" && expected && safeEqual(token, expected)) {
      return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const raw = await req.text();
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return json({ error: "JSON inválido" }, 400); }
  if (payload?.object !== "instagram") return json({ status: "ignored" });

  const admin = adminClient();
  for (const entry of payload.entry ?? []) {
    const acct = await loadInstagramAccount(admin, { igUserId: String(entry.id) });
    if (!acct) { console.warn("[IG Webhook] conta não conectada ao CRM:", entry.id); continue; }
    if (!(await validMetaSignature(raw, req.headers.get("x-hub-signature-256"), acct.app_secret))) {
      console.error("[IG Webhook] assinatura inválida para", entry.id);
      return json({ error: "Assinatura inválida" }, 401);
    }
    for (const ev of entry.messaging ?? []) {
      try { await handleEvent(admin, acct, ev); }
      catch (e) { console.error("[IG Webhook] evento:", (e as Error).message); }
    }
  }
  // 200 sempre que a assinatura confere, para a Meta não desativar o webhook
  return json({ status: "ok" });
});
