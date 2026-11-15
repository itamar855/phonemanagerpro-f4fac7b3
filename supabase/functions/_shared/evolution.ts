/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Evolution/Meta/PostgREST) sem tipos */
// Cliente da Evolution API (WhatsApp). A chave fica só no servidor.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError } from "./http.ts";

export interface EvolutionConfig {
  id: string;
  store_id: string;
  api_url: string;
  api_key: string;
  instance_name: string;
  is_active: boolean;
}

/** Configuração da loja; sem ela, o número ativo (hoje um número atende as duas lojas). */
export async function loadWhatsAppConfig(admin: SupabaseClient, storeId: string | null, opts: { fallback?: boolean } = {}) {
  const fallback = opts.fallback ?? true;
  if (storeId) {
    const { data } = await admin.from("whatsapp_config").select("*").eq("store_id", storeId).limit(1).maybeSingle();
    if (data) return data as EvolutionConfig;
  }
  if (!fallback) return null;
  const { data } = await admin.from("whatsapp_config").select("*").eq("is_active", true).limit(1).maybeSingle();
  return (data as EvolutionConfig) ?? null;
}

export function evolution(cfg: EvolutionConfig) {
  if (!cfg?.api_url || !cfg?.api_key || !cfg?.instance_name) {
    throw new HttpError(400, "WhatsApp não configurado (URL, instância ou chave ausente).");
  }
  const base = String(cfg.api_url).replace(/\/+$/, "");
  const instance = encodeURIComponent(cfg.instance_name);
  const headers = { "Content-Type": "application/json", apikey: cfg.api_key };

  async function call(method: "GET" | "POST" | "DELETE", path: string, body?: unknown, timeoutMs = 15000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data: any = null;
      try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      const msg = (err as Error)?.name === "AbortError" ? "tempo esgotado" : (err as Error)?.message;
      throw new HttpError(502, `Servidor do WhatsApp indisponível (${msg}).`);
    } finally {
      clearTimeout(t);
    }
  }

  const must = (r: { ok: boolean; status: number; data: any }, what: string) => {
    if (!r.ok) throw new HttpError(502, `${what}: Evolution retornou ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
    return r.data;
  };

  return {
    instanceName: cfg.instance_name,
    async connectionState(): Promise<string> {
      const r = await call("GET", `/instance/connectionState/${instance}`, undefined, 5000);
      if (r.status === 404) return "not_found";
      const d = must(r, "Status");
      return String(d?.instance?.state ?? d?.state ?? "unknown");
    },
    async connect(): Promise<{ base64?: string; pairingCode?: string; state?: string }> {
      const d = must(await call("GET", `/instance/connect/${instance}`), "Conectar");
      return { base64: d?.base64 ?? d?.qrcode?.base64, pairingCode: d?.pairingCode ?? d?.code, state: d?.instance?.state };
    },
    async logout() {
      return must(await call("DELETE", `/instance/logout/${instance}`), "Desconectar");
    },
    async setWebhook(url: string, secret: string) {
      const webhook = {
        enabled: true,
        url,
        byEvents: false,
        base64: true,
        headers: { "x-evolution-webhook-secret": secret },
        events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
      };
      let r = await call("POST", `/webhook/set/${instance}`, { webhook });
      if (!r.ok) r = await call("POST", `/webhook/set/${instance}`, webhook);
      return must(r, "Configurar webhook");
    },
    async sendText(number: string, text: string): Promise<{ externalId: string | null; raw: any }> {
      const d = must(await call("POST", `/message/sendText/${instance}`, { number, text, delay: 1200 }), "Enviar texto");
      return { externalId: d?.key?.id ?? null, raw: d };
    },
    async sendMedia(number: string, mediatype: "image" | "audio" | "document" | "video", media: string, caption?: string, fileName?: string, mimetype?: string) {
      const path = mediatype === "audio" ? `/message/sendWhatsAppAudio/${instance}` : `/message/sendMedia/${instance}`;
      const body = mediatype === "audio"
        ? { number, audio: media, delay: 1200 }
        : { number, mediatype, mediaType: mediatype, media, caption, fileName, mimetype, delay: 1200 };
      const d = must(await call("POST", path, body, 30000), "Enviar mídia");
      return { externalId: d?.key?.id ?? null, raw: d };
    },
    /** Link da foto de perfil (null se a pessoa não tem foto ou esconde). */
    async profilePicture(number: string): Promise<string | null> {
      const r = await call("POST", `/chat/fetchProfilePictureUrl/${instance}`, { number }, 6000);
      if (!r.ok) return null;
      const url = r.data?.profilePictureUrl ?? r.data?.picture ?? null;
      return typeof url === "string" && /^https:\/\//.test(url) ? url : null;
    },
    async mediaBase64(messageId: string): Promise<string | undefined> {
      const r = await call("POST", `/chat/getBase64FromMediaMessage/${instance}`, { message: { key: { id: messageId } }, convertToMp4: false }, 20000);
      if (!r.ok) return undefined;
      return r.data?.base64 || r.data?.data || undefined;
    },
  };
}

/** Número para a Evolution a partir do contato (55 + DDD + número) ou do jid salvo. */
export function whatsappNumber(contactPhone: string | null, threadId: string | null): string {
  if (threadId && threadId.endsWith("@s.whatsapp.net")) return threadId;
  const digits = String(contactPhone ?? "").replace(/\D/g, "");
  if (!digits) throw new HttpError(400, "Contato sem telefone.");
  return `${digits}@s.whatsapp.net`;
}
