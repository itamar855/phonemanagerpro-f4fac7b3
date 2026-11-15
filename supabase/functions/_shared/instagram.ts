/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Meta) sem tipos */
// API do Instagram com login do Instagram (graph.instagram.com). Token e chave secreta só no servidor.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

export const IG_GRAPH = "https://graph.instagram.com/v23.0";
export const IG_TOKEN_TTL_DAYS = 60;

export interface InstagramAccount {
  store_id: string;
  ig_user_id: string;
  ig_username: string | null;
  token_expires_at: string | null;
  access_token: string;
  app_secret: string;
}

async function igFetch(path: string, init: RequestInit & { token?: string } = {}) {
  const url = new URL(`${IG_GRAPH}${path}`);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { ...init, headers, signal: ctrl.signal });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new HttpError(res.status === 400 || res.status === 401 ? 400 : 502, `Instagram: ${data?.error?.message || res.status}`);
    return data;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, `Instagram indisponível (${(e as Error)?.message}).`);
  } finally {
    clearTimeout(t);
  }
}

export const igMe = (token: string) =>
  igFetch(`/me?fields=user_id,username,name,profile_picture_url`, { token }) as Promise<{ user_id: string; username: string; name?: string; id: string }>;

export const igSubscribe = (token: string) =>
  igFetch(`/me/subscribed_apps?subscribed_fields=messages,messaging_seen,messaging_postbacks`, { method: "POST", token });

export const igRefreshToken = (token: string) =>
  igFetch(`/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`) as Promise<{ access_token: string; expires_in: number }>;

export async function igProfile(token: string, igsid: string): Promise<{ name?: string; username?: string; profile_pic?: string } | null> {
  try {
    return await igFetch(`/${encodeURIComponent(igsid)}?fields=name,username,profile_pic`, { token });
  } catch {
    return null; // perfil pode ser privado/indisponível: segue sem nome
  }
}

export async function igSendText(token: string, recipientId: string, text: string): Promise<string | null> {
  const d = await igFetch(`/me/messages`, { method: "POST", token, body: JSON.stringify({ recipient: { id: recipientId }, message: { text } }) });
  return d?.message_id ?? null;
}

export async function igSendImage(token: string, recipientId: string, url: string): Promise<string | null> {
  const d = await igFetch(`/me/messages`, {
    method: "POST", token,
    body: JSON.stringify({ recipient: { id: recipientId }, message: { attachment: { type: "image", payload: { url } } } }),
  });
  return d?.message_id ?? null;
}

/** Conta conectada da loja, com segredos (só uso no servidor). */
export async function loadInstagramAccount(admin: SupabaseClient, by: { storeId?: string; igUserId?: string }): Promise<InstagramAccount | null> {
  let q = admin.from("instagram_config").select("store_id, ig_user_id, ig_username, token_expires_at, is_active").eq("is_active", true);
  q = by.igUserId ? q.eq("ig_user_id", by.igUserId) : q.eq("store_id", by.storeId!);
  const { data: cfg } = await q.limit(1).maybeSingle();
  if (!cfg?.ig_user_id) return null;
  const { data: sec } = await admin.from("crm_channel_secrets").select("secrets").eq("store_id", cfg.store_id).eq("channel", "instagram").maybeSingle();
  const s: any = sec?.secrets ?? {};
  if (!s.access_token || !s.app_secret) return null;
  return { ...cfg, access_token: s.access_token, app_secret: s.app_secret } as InstagramAccount;
}

/** X-Hub-Signature-256: sha256=HMAC(corpo bruto, chave secreta do app). */
export async function validMetaSignature(rawBody: string, header: string | null, appSecret: string): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const hex = Array.from(sig).map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = header.slice(7).toLowerCase();
  if (got.length !== hex.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}
