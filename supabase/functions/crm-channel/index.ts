// Gestão do canal WhatsApp do CRM: status, QR Code, desconectar, webhook e configuração.
// A chave da Evolution é gravada aqui e nunca devolvida ao navegador.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient, corsHeaders, errorResponse, HttpError, isManager, json, requireManager, requireMember, requireUser,
} from "../_shared/http.ts";
import { evolution, loadWhatsAppConfig } from "../_shared/evolution.ts";
import { IG_TOKEN_TTL_DAYS, igMe, igRefreshToken, igSubscribe } from "../_shared/instagram.ts";
import { refreshAvatars } from "../_shared/contact-avatar.ts";

const ACTIONS = ["status", "connect", "logout", "configure-webhook", "save-config", "refresh-avatars", "ig-status", "ig-save", "ig-disconnect", "ig-app-save", "ig-auth-url"] as const;
const DAY = 24 * 60 * 60 * 1000;
// Para onde o login do Instagram pode devolver o usuário
const ALLOWED_RETURN_ORIGINS = ["https://cellpro360.vercel.app", "https://cellpromanager.vercel.app", "http://localhost:8080"];
const IG_SCOPES = "instagram_business_basic,instagram_business_manage_messages";

/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST sem tipos gerados */
async function handleInstagram(action: Action, admin: any, userId: string, storeId: string, body: any) {
  const canManage = await isManager(admin, userId);
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-webhook`;
  const oauthRedirect = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-oauth`;

  if (action === "ig-app-save") {
    await requireManager(admin, userId);
    const appId = String(body.app_id || "").trim();
    const appSecret = String(body.app_secret || "").trim();
    if (!/^\d{6,20}$/.test(appId)) throw new HttpError(400, "ID do app do Instagram inválido (só números).");
    // O ID do app do Facebook (meta app) é aceito pelo Graph como app: se responder, é o ID errado.
    try {
      const fb = await fetch(`https://graph.facebook.com/${appId}?fields=id,name`);
      const fbData = await fb.json().catch(() => ({}));
      if (fb.ok && fbData?.id === appId && !/-IG$/i.test(String(fbData?.name ?? ""))) {
        throw new HttpError(400, `Este é o ID do app do Facebook ("${fbData.name}"). Use o "ID do app do Instagram", que fica em Casos de uso → Instagram → Configuração da API com login do Instagram.`);
      }
    } catch (e) {
      if (e instanceof HttpError) throw e; // sem rede para checar: segue
    }
    const { data: prev } = await admin.from("crm_channel_secrets").select("secrets").eq("store_id", storeId).eq("channel", "instagram").maybeSingle();
    const secret = appSecret || prev?.secrets?.app_secret;
    if (!secret) throw new HttpError(400, "Cole a chave secreta do app do Instagram.");
    const { error } = await admin.from("crm_channel_secrets").upsert(
      { store_id: storeId, channel: "instagram", secrets: { ...(prev?.secrets ?? {}), app_id: appId, app_secret: secret }, updated_at: new Date().toISOString() },
      { onConflict: "store_id,channel" },
    );
    if (error) throw new HttpError(500, error.message);
    return { status: "saved" };
  }

  if (action === "ig-auth-url") {
    await requireManager(admin, userId);
    const { data: sec } = await admin.from("crm_channel_secrets").select("secrets").eq("store_id", storeId).eq("channel", "instagram").maybeSingle();
    if (!sec?.secrets?.app_id || !sec?.secrets?.app_secret) throw new HttpError(400, "Salve antes o ID e a chave secreta do app do Instagram.");
    let origin: string;
    try { origin = new URL(String(body.return_to || "")).origin; } catch { throw new HttpError(400, "Endereço de retorno inválido."); }
    if (!ALLOWED_RETURN_ORIGINS.includes(origin)) throw new HttpError(400, "Endereço de retorno não permitido.");

    const state = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    await admin.from("crm_oauth_states").delete().lt("created_at", new Date(Date.now() - DAY).toISOString()); // limpeza
    const { error } = await admin.from("crm_oauth_states").insert({ state, store_id: storeId, user_id: userId, provider: "instagram", return_to: `${origin}/integracao/instagram` });
    if (error) throw new HttpError(500, error.message);

    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("enable_fb_login", "0");
    // Sem force_authentication: se o Instagram da loja já estiver logado no navegador,
    // vai direto para "Autorizar" (forçar login novo dispara o captcha da Meta com frequência).
    url.searchParams.set("client_id", sec.secrets.app_id);
    url.searchParams.set("redirect_uri", oauthRedirect);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", IG_SCOPES);
    url.searchParams.set("state", state);
    return { url: url.toString() };
  }

  if (action === "ig-save") {
    await requireManager(admin, userId);
    const token = String(body.access_token || "").trim();
    const appSecret = String(body.app_secret || "").trim();
    if (!token) throw new HttpError(400, "Cole o token de acesso gerado no painel da Meta.");

    const { data: prevSec } = await admin.from("crm_channel_secrets").select("secrets").eq("store_id", storeId).eq("channel", "instagram").maybeSingle();
    const secret = appSecret || prevSec?.secrets?.app_secret;
    if (!secret) throw new HttpError(400, "Cole a chave secreta do app do Instagram.");

    const me = await igMe(token); // valida o token
    const igUserId = String(me.user_id || me.id);
    const { data: other } = await admin.from("instagram_config").select("store_id").eq("ig_user_id", igUserId).neq("store_id", storeId).limit(1);
    if (other && other.length > 0) throw new HttpError(409, "Esta conta do Instagram já está conectada em outra loja.");

    const now = new Date();
    const row = {
      store_id: storeId, ig_user_id: igUserId, ig_username: me.username ?? null, instagram_business_account_id: igUserId,
      token_expires_at: new Date(now.getTime() + IG_TOKEN_TTL_DAYS * DAY).toISOString(), is_active: true, updated_at: now.toISOString(),
    };
    const { error: cfgErr } = await admin.from("instagram_config").upsert(row, { onConflict: "store_id" });
    if (cfgErr) throw new HttpError(500, cfgErr.message);
    const { error: secErr } = await admin.from("crm_channel_secrets").upsert(
      { store_id: storeId, channel: "instagram", secrets: { ...(prevSec?.secrets ?? {}), access_token: token, app_secret: secret }, updated_at: now.toISOString() },
      { onConflict: "store_id,channel" },
    );
    if (secErr) throw new HttpError(500, secErr.message);

    let subscribed = false;
    let subscribeError: string | null = null;
    try {
      await igSubscribe(token);
      subscribed = true;
      await admin.from("instagram_config").update({ webhook_subscribed_at: new Date().toISOString() }).eq("store_id", storeId);
    } catch (e) {
      subscribeError = (e as Error).message;
    }
    return { status: "saved", username: me.username, subscribed, subscribe_error: subscribeError };
  }

  if (action === "ig-disconnect") {
    await requireManager(admin, userId);
    await admin.from("instagram_config").update({ is_active: false, updated_at: new Date().toISOString() }).eq("store_id", storeId);
    await admin.from("crm_channel_secrets").delete().eq("store_id", storeId).eq("channel", "instagram");
    return { status: "disconnected" };
  }

  // ig-status
  const { data: cfg } = await admin.from("instagram_config")
    .select("ig_user_id, ig_username, token_expires_at, webhook_subscribed_at, is_active").eq("store_id", storeId).maybeSingle();
  const { data: sec } = await admin.from("crm_channel_secrets").select("secrets").eq("store_id", storeId).eq("channel", "instagram").maybeSingle();
  const connected = Boolean(cfg?.is_active && cfg?.ig_user_id && sec?.secrets?.access_token);

  // Renova o token quando faltam menos de 15 dias (a Meta aceita renovar tokens com 24 h+ de idade)
  let expiresAt = cfg?.token_expires_at ?? null;
  if (connected && expiresAt && new Date(expiresAt).getTime() - Date.now() < 15 * DAY) {
    try {
      const r = await igRefreshToken(sec!.secrets.access_token);
      expiresAt = new Date(Date.now() + (Number(r.expires_in) || IG_TOKEN_TTL_DAYS * 86400) * 1000).toISOString();
      await admin.from("crm_channel_secrets").update({ secrets: { ...sec!.secrets, access_token: r.access_token }, updated_at: new Date().toISOString() })
        .eq("store_id", storeId).eq("channel", "instagram");
      await admin.from("instagram_config").update({ token_expires_at: expiresAt }).eq("store_id", storeId);
    } catch (e) {
      console.error("[crm-channel] renovar token IG:", (e as Error).message);
    }
  }

  return {
    connected,
    username: cfg?.ig_username ?? null,
    token_expires_at: expiresAt,
    webhook_subscribed: Boolean(cfg?.webhook_subscribed_at),
    has_app_secret: Boolean(sec?.secrets?.app_secret),
    app_id: sec?.secrets?.app_id ?? null, // público
    oauth_redirect_url: canManage ? oauthRedirect : null,
    can_manage: canManage,
    // dados para colar no painel da Meta (só para quem administra)
    webhook_url: canManage ? webhookUrl : null,
    verify_token: canManage ? Deno.env.get("INSTAGRAM_VERIFY_TOKEN") ?? null : null,
  };
}
type Action = typeof ACTIONS[number];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status") as Action;
    if (!ACTIONS.includes(action)) throw new HttpError(400, "Ação inválida.");

    // Loja: a informada; na visão "todas as lojas", a dona do número ativo
    let storeId: string | null = body.storeId && body.storeId !== "all" ? String(body.storeId) : null;
    if (!storeId) {
      const active = await loadWhatsAppConfig(admin, null);
      storeId = active?.store_id ?? null;
    }
    if (!storeId) throw new HttpError(400, "Selecione uma loja.");
    await requireMember(admin, user.id, storeId);

    if (action.startsWith("ig-")) return json(await handleInstagram(action, admin, user.id, storeId, body));

    if (action === "save-config") {
      await requireManager(admin, user.id);
      const apiUrl = String(body.api_url || "").trim().replace(/\/+$/, "");
      const instanceName = String(body.instance_name || "").trim();
      const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
      if (!/^https:\/\/[^\s/]+/i.test(apiUrl)) throw new HttpError(400, "Informe a URL da API com https://.");
      if (!instanceName) throw new HttpError(400, "Informe o nome da instância.");

      const { data: existing } = await admin.from("whatsapp_config").select("id, api_key").eq("store_id", storeId).limit(1).maybeSingle();
      if (!existing && !apiKey) throw new HttpError(400, "Informe a API Key.");
      const row: Record<string, unknown> = {
        store_id: storeId, api_url: apiUrl, instance_name: instanceName,
        is_active: body.is_active !== false, updated_at: new Date().toISOString(),
      };
      if (apiKey) row.api_key = apiKey;
      const { error } = existing
        ? await admin.from("whatsapp_config").update(row).eq("id", existing.id)
        : await admin.from("whatsapp_config").insert(row);
      if (error) throw new HttpError(500, error.message);
      return json({ status: "saved" });
    }

    const cfg = await loadWhatsAppConfig(admin, storeId, { fallback: false }) ?? await loadWhatsAppConfig(admin, null);
    if (!cfg) return json({ configured: false, can_manage: await isManager(admin, user.id) });

    if (action === "status") {
      let state = "unknown";
      let reachable = true;
      try {
        state = await evolution(cfg).connectionState();
      } catch (e) {
        reachable = false;
        state = "unreachable";
        console.error("[crm-channel] status:", (e as Error).message);
      }
      let host = "";
      try { host = new URL(cfg.api_url).host; } catch { /* url inválida */ }
      return json({
        configured: true,
        store_id: cfg.store_id,
        shared_from_other_store: cfg.store_id !== storeId,
        instance_name: cfg.instance_name,
        api_host: host,
        is_active: cfg.is_active,
        has_api_key: Boolean(cfg.api_key),
        state,             // open | connecting | close | not_found | unreachable | unknown
        reachable,
        can_manage: await isManager(admin, user.id),
      });
    }

    // Fotos de perfil dos contatos na tela (qualquer membro; só contatos das lojas dele)
    if (action === "refresh-avatars") {
      const ids = (Array.isArray(body.contact_ids) ? body.contact_ids : []).map(String).filter((s: string) => /^[0-9a-f-]{36}$/i.test(s)).slice(0, 40);
      if (ids.length === 0) return json({ checked: 0, updated: 0 });
      const { data: stores } = await admin.from("member_stores").select("store_id").eq("user_id", user.id);
      const allowed = (stores ?? []).map((s: { store_id: string }) => s.store_id);
      const { data: rows, error } = await admin.from("crm_contacts")
        .select("id, phone, avatar_url, avatar_checked_at").in("id", ids).in("store_id", allowed).eq("ignored", false);
      if (error) throw new HttpError(500, error.message);
      return json(await refreshAvatars(admin, cfg, rows ?? []));
    }

    await requireManager(admin, user.id);
    const evo = evolution(cfg);

    if (action === "connect") return json(await evo.connect());
    if (action === "logout") { await evo.logout(); return json({ status: "logged_out" }); }

    // configure-webhook
    const secret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
    if (!secret) throw new HttpError(500, "EVOLUTION_WEBHOOK_SECRET não configurado no servidor.");
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;
    await evo.setWebhook(url, secret);
    return json({ status: "configured", url });
  } catch (error) {
    return errorResponse(error);
  }
});
