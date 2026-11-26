// Retorno do login oficial do Instagram (Business Login for Instagram).
// A Meta redireciona para cá com ?code&state; trocamos o code por um token de 60 dias,
// salvamos a conta na loja, inscrevemos no webhook e voltamos para o CRM.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient } from "../_shared/http.ts";
import { IG_GRAPH, IG_TOKEN_TTL_DAYS, igMe, igSubscribe } from "../_shared/instagram.ts";

const STATE_TTL_MS = 15 * 60 * 1000;

function back(returnTo: string, params: Record<string, string>) {
  const url = new URL(returnTo);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: url.toString() } });
}

serve(async (req) => {
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const denied = url.searchParams.get("error_reason") || url.searchParams.get("error");
  const admin = adminClient();

  const { data: st } = await admin.from("crm_oauth_states").select("*").eq("state", state).maybeSingle();
  if (!st) return new Response("Link de autorização inválido ou já usado. Volte ao CRM e tente de novo.", { status: 400 });
  await admin.from("crm_oauth_states").delete().eq("state", state); // uso único
  const returnTo = st.return_to as string;

  if (Date.now() - new Date(st.created_at).getTime() > STATE_TTL_MS) return back(returnTo, { ig: "error", msg: "Autorização expirou. Tente de novo." });
  if (denied || !code) return back(returnTo, { ig: "error", msg: denied ? "Autorização cancelada no Instagram." : "Instagram não devolveu o código." });

  try {
    const { data: sec } = await admin.from("crm_channel_secrets").select("secrets").eq("store_id", st.store_id).eq("channel", "instagram").maybeSingle();
    const appId = sec?.secrets?.app_id;
    const appSecret = sec?.secrets?.app_secret;
    if (!appId || !appSecret) throw new Error("ID e chave secreta do app do Instagram não configurados.");
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/instagram-oauth`;

    // 1. code → token curto
    const form = new FormData();
    form.set("client_id", appId);
    form.set("client_secret", appSecret);
    form.set("grant_type", "authorization_code");
    form.set("redirect_uri", redirectUri);
    form.set("code", code.replace(/#_$/, ""));
    const shortRes = await fetch("https://api.instagram.com/oauth/access_token", { method: "POST", body: form });
    const short = await shortRes.json().catch(() => ({}));
    const shortToken = short?.access_token ?? short?.data?.[0]?.access_token;
    if (!shortRes.ok || !shortToken) throw new Error(short?.error_message || short?.error?.message || "Falha ao trocar o código.");

    // 2. token curto → token de 60 dias
    const longRes = await fetch(`${IG_GRAPH.replace(/\/v[\d.]+$/, "")}/access_token?grant_type=ig_exchange_token&client_secret=${encodeURIComponent(appSecret)}&access_token=${encodeURIComponent(shortToken)}`);
    const long = await longRes.json().catch(() => ({}));
    if (!longRes.ok || !long?.access_token) throw new Error(long?.error?.message || "Falha ao obter o token de longa duração.");
    const token = long.access_token as string;
    const expiresIn = Number(long.expires_in) || IG_TOKEN_TTL_DAYS * 86400;

    // 3. conta, loja e webhook
    const me = await igMe(token);
    const igUserId = String(me.user_id || me.id);
    const { data: other } = await admin.from("instagram_config").select("store_id").eq("ig_user_id", igUserId).neq("store_id", st.store_id).limit(1);
    if (other && other.length > 0) throw new Error("Esta conta do Instagram já está conectada em outra loja.");

    const now = new Date();
    const { error: cfgErr } = await admin.from("instagram_config").upsert({
      store_id: st.store_id, ig_user_id: igUserId, ig_username: me.username ?? null, instagram_business_account_id: igUserId,
      token_expires_at: new Date(now.getTime() + expiresIn * 1000).toISOString(), is_active: true, updated_at: now.toISOString(),
    }, { onConflict: "store_id" });
    if (cfgErr) throw new Error(cfgErr.message);
    const { error: secErr } = await admin.from("crm_channel_secrets").upsert(
      { store_id: st.store_id, channel: "instagram", secrets: { ...sec!.secrets, access_token: token }, updated_at: now.toISOString() },
      { onConflict: "store_id,channel" },
    );
    if (secErr) throw new Error(secErr.message);

    let subscribed = "1";
    try {
      await igSubscribe(token);
      await admin.from("instagram_config").update({ webhook_subscribed_at: new Date().toISOString() }).eq("store_id", st.store_id);
    } catch (e) {
      subscribed = "0";
      console.error("[instagram-oauth] inscrição no webhook:", (e as Error).message);
    }
    return back(returnTo, { ig: "ok", user: me.username ?? "", sub: subscribed });
  } catch (e) {
    console.error("[instagram-oauth]", (e as Error).message);
    return back(returnTo, { ig: "error", msg: (e as Error).message.slice(0, 200) });
  }
});
