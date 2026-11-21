/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Evolution/Meta/PostgREST) sem tipos */
// Extração do conteúdo de uma mensagem da Evolution API.
// Módulo puro (sem imports de Deno) para ser testado pelo Vitest.

export type ParsedKind = "text" | "image" | "audio" | "video" | "document" | "sticker";

export interface ParsedMessage {
  kind: ParsedKind;
  content: string;
  /** Mime type da mídia, quando houver */
  mimeType?: string;
  /** base64 embutido no payload, quando a Evolution envia */
  base64?: string;
}

/**
 * Retorna null para eventos que não são mensagens de conversa
 * (reações, mensagens de protocolo/apagadas, enquetes etc.). Esses eventos
 * não devem criar lead nem marcar a conversa como não lida.
 */
export function parseMessageBody(message: any, payload?: any): ParsedMessage | null {
  const body = message?.message;
  if (!body || typeof body !== "object") return null;

  const text = body.conversation || body.extendedTextMessage?.text;
  if (typeof text === "string" && text.trim()) {
    return { kind: "text", content: text };
  }

  const embedded = (m: any) => message?.base64 || m?.base64 || payload?.base64 || undefined;

  if (body.imageMessage) {
    return {
      kind: "image",
      content: body.imageMessage.caption || "[Imagem]",
      mimeType: body.imageMessage.mimetype || "image/jpeg",
      base64: embedded(body.imageMessage),
    };
  }
  if (body.audioMessage) {
    return {
      kind: "audio",
      content: "[Áudio]",
      mimeType: body.audioMessage.mimetype || "audio/ogg",
      base64: embedded(body.audioMessage),
    };
  }
  if (body.videoMessage) {
    return { kind: "video", content: body.videoMessage.caption || "[Vídeo]" };
  }
  if (body.documentMessage || body.documentWithCaptionMessage) {
    const doc = body.documentMessage || body.documentWithCaptionMessage?.message?.documentMessage;
    return { kind: "document", content: doc?.caption || doc?.fileName || "[Documento]" };
  }
  if (body.stickerMessage) {
    return { kind: "sticker", content: "[Figurinha]" };
  }
  return null;
}

/** Timestamp da Evolution (segundos Unix, número/string/Long) → ISO. */
export function resolveTimestamp(raw: unknown, fallback = new Date()): string {
  if (raw === null || raw === undefined) return fallback.toISOString();
  const n = typeof raw === "object" && raw !== null && "low" in (raw as any) ? Number((raw as any).low) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback.toISOString();
  const ms = n < 100000000000 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

const PHONE_JID = /^\d{8,15}@s\.whatsapp\.net$/;

/**
 * jid de telefone da conversa privada, ou null para grupos, transmissões, canais e status.
 * Contas com identificador oculto (@lid) trazem o número em remoteJidAlt/senderPn.
 */
export function resolveContactJid(key: any): string | null {
  const jid: string = key?.remoteJid || "";
  if (key?.participant && !jid.endsWith("@lid")) return null;
  if (PHONE_JID.test(jid)) return jid;
  if (jid.endsWith("@lid")) {
    for (const alt of [key?.remoteJidAlt, key?.senderPn, key?.participantAlt]) {
      if (typeof alt === "string" && PHONE_JID.test(alt)) return alt;
    }
  }
  return null;
}

/** Só conversas privadas com pessoas: sem grupos, transmissões, canais ou status. */
export function isDirectChat(key: any): boolean {
  return resolveContactJid(key) !== null;
}

// ------------------------------------------------------------------ contatos ocultos (@lid)

const LID_JID = /^\d{5,25}@lid$/;

/**
 * Identificador oculto (@lid) do contato numa conversa privada, venha ele em remoteJid
 * (com ou sem o número em remoteJidAlt) ou em remoteJidAlt (remoteJid já com o número).
 * null para grupos, transmissões, canais e status.
 */
export function contactLid(key: any): string | null {
  const jid: string = key?.remoteJid || "";
  if (LID_JID.test(jid)) return jid;
  if (key?.participant) return null;
  if (PHONE_JID.test(jid)) {
    for (const alt of [key?.remoteJidAlt, key?.participantAlt]) {
      if (typeof alt === "string" && LID_JID.test(alt)) return alt;
    }
  }
  return null;
}

/** Telefone em jid ("5587...@s.whatsapp.net") a partir de jid, "@c.us" ou só dígitos (10 a 15). */
export function phoneJidFrom(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) raw = String(Math.trunc(raw));
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (PHONE_JID.test(s)) return s;
  const cus = /^(\d{8,15})@c\.us$/.exec(s);
  if (cus) return `${cus[1]}@s.whatsapp.net`;
  if (s.includes("@")) return null;
  if (!/^\+?[\d\s().-]+$/.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? `${digits}@s.whatsapp.net` : null;
}

/** Campos em que a Evolution (versões diferentes) pode trazer o número de um contato. */
const CONTACT_PHONE_FIELDS = ["remoteJidAlt", "phoneNumber", "phone", "number", "pn", "senderPn", "jid", "remoteJid", "id"];

/**
 * Número de um contato @lid na resposta de /chat/findContacts. Só considera registros
 * desse lid; se a resposta trouxer números diferentes, não arrisca (null).
 */
export function phoneFromEvolutionContacts(records: unknown, lid: string): string | null {
  const list = Array.isArray(records) ? records : records && typeof records === "object" ? [records] : [];
  const found = new Set<string>();
  for (const r of list as any[]) {
    if (!r || typeof r !== "object") continue;
    const values = Object.values(r);
    if (!values.includes(lid)) continue;
    for (const f of CONTACT_PHONE_FIELDS) {
      const p = phoneJidFrom(r[f]);
      if (p) found.add(p);
    }
  }
  return found.size === 1 ? [...found][0] : null;
}

/** Nome comparável: sem acento, minúsculo, espaços simples. */
export function normalizeName(raw: unknown): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const GENERIC_NAMES = new Set(["lead whatsapp", "contato", "cliente", "whatsapp", "."]);

/**
 * Último recurso: o contato do CRM (mesma loja) com o mesmo nome do pushName —
 * só se houver exatamente um, com telefone. Nomes genéricos ou curtos não valem.
 */
export function matchContactByName(contacts: Array<{ name?: string | null; phone?: string | null }>, pushName: unknown): string | null {
  const target = normalizeName(pushName);
  if (!isUsableName(target) || GENERIC_NAMES.has(target)) return null;
  const same = (contacts ?? []).filter((c) => normalizeName(c?.name) === target);
  if (same.length !== 1) return null;
  return phoneJidFrom(String(same[0].phone ?? "").replace(/\D/g, ""));
}

/** Nome que serve para comparar: 3+ letras/dígitos e não só número (a Evolution às vezes manda o próprio lid como nome). */
export function isUsableName(raw: unknown): boolean {
  const t = normalizeName(raw);
  return t.replace(/[^a-z0-9]/g, "").length >= 3 && /\p{L}/u.test(t);
}

/**
 * Nomes do contato @lid na Evolution (/chat/findContacts): o pushName do registro desse lid.
 * Serve para achar o contato no CRM quando a mensagem veio sem nome (ou com o lid no lugar do nome).
 */
export function namesFromEvolutionContacts(records: unknown, lid: string): string[] {
  const list = Array.isArray(records) ? records : records && typeof records === "object" ? [records] : [];
  const out: string[] = [];
  for (const r of list as any[]) {
    if (!r || typeof r !== "object" || r.remoteJid !== lid) continue;
    const n = typeof r.pushName === "string" ? r.pushName.trim() : "";
    if (isUsableName(n) && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Cópia do evento sem o base64 das mídias (vai para a fila de espera; a mídia é baixada de novo depois). */
export function stripBase64<T>(payload: T): T {
  return JSON.parse(JSON.stringify(payload ?? null, (k, v) => (k === "base64" ? undefined : v)));
}

/** Cópia do evento com o número descoberto em key.remoteJidAlt, para reprocessar como mensagem comum. */
export function withResolvedPhone<T>(payload: T, phoneJid: string): T {
  const copy: any = JSON.parse(JSON.stringify(payload ?? {}));
  copy.data = copy.data && typeof copy.data === "object" ? copy.data : {};
  copy.data.key = { ...(copy.data.key ?? {}), remoteJidAlt: phoneJid };
  return copy;
}

// ------------------------------------------------------------------ rastreamento

export interface NativeAttribution {
  entry_point?: string;
  entry_app?: string;
  ad_source_id?: string;
  ad_source_url?: string;
  ad_source_type?: string;
  ad_title?: string;
  ctwa_clid?: string;
}

/** Procura os campos de origem/anúncio em qualquer contextInfo da mensagem (formato do WhatsApp Web/Baileys). */
export function extractAdAttribution(message: any): NativeAttribution {
  const out: NativeAttribution = {};
  const seen = new Set<any>();
  const walk = (o: any, depth: number) => {
    if (!o || typeof o !== "object" || depth > 8 || seen.has(o)) return;
    seen.add(o);
    if (typeof o.entryPointConversionSource === "string") out.entry_point ??= o.entryPointConversionSource;
    if (typeof o.entryPointConversionApp === "string") out.entry_app ??= o.entryPointConversionApp;
    if (typeof o.conversionSource === "string" && !out.entry_point) out.entry_point = o.conversionSource;
    const ad = o.externalAdReply;
    if (ad && typeof ad === "object") {
      if (ad.sourceId) out.ad_source_id ??= String(ad.sourceId);
      if (ad.sourceUrl) out.ad_source_url ??= String(ad.sourceUrl);
      if (ad.sourceType) out.ad_source_type ??= String(ad.sourceType);
      if (ad.title) out.ad_title ??= String(ad.title).slice(0, 200);
      if (ad.ctwaClid) out.ctwa_clid ??= String(ad.ctwaClid);
    }
    // API oficial (referral) — por compatibilidade
    const ref = o.referral ?? o.adReferral;
    if (ref && typeof ref === "object") {
      if (ref.source_id ?? ref.sourceId) out.ad_source_id ??= String(ref.source_id ?? ref.sourceId);
      if (ref.source_url ?? ref.sourceUrl) out.ad_source_url ??= String(ref.source_url ?? ref.sourceUrl);
      if (ref.ctwa_clid ?? ref.ctwaClid) out.ctwa_clid ??= String(ref.ctwa_clid ?? ref.ctwaClid);
      if (ref.headline) out.ad_title ??= String(ref.headline).slice(0, 200);
    }
    for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, depth + 1);
  };
  walk(message, 0);
  if ((out.ad_source_id || out.ctwa_clid) && !out.entry_point) out.entry_point = "ctwa_ad";
  return out;
}

export const hasAdData = (n: NativeAttribution) => Boolean(n.ad_source_id || n.ctwa_clid || n.entry_point === "ctwa_ad");

/** Código do link de rastreio na 1ª mensagem: "(cód. K7Q2M)", "cod: K7Q2M", "código K7Q2M". */
export function extractTrackCode(text: string | null | undefined): string | null {
  const m = /c[oó]d(?:igo)?\.?\s*:?\s*([A-HJ-NP-Z2-9]{5})\b/i.exec(text ?? "");
  return m ? m[1].toUpperCase() : null;
}

/**
 * Código de anúncio na mensagem: "#T21" ou "Ref. T21" (o banco só aceita se estiver cadastrado).
 * Mesmo padrão em src/modules/crm/lib/adCodes.ts.
 */
export function extractAdCode(text: string | null | undefined): string | null {
  const m = /(?:#|\bref\.?\s*:?\s*)([A-Za-z][A-Za-z0-9]{1,5})\b/i.exec(text ?? "");
  return m ? m[1].toUpperCase() : null;
}

/** Status de entrega da Evolution → status do CRM. */
export function mapAckStatus(raw: unknown): "sent" | "delivered" | "read" | null {
  const s = String(raw ?? "").toUpperCase();
  if (s === "SERVER_ACK" || s === "2") return "sent";
  if (s === "DELIVERY_ACK" || s === "3") return "delivered";
  if (s === "READ" || s === "PLAYED" || s === "4" || s === "5") return "read";
  return null;
}

/** Tipos aceitos pelo bucket crm_media (imagem e áudio do WhatsApp). */
const MEDIA_MIMES = ["image/jpeg", "image/png", "image/webp", "image/gif", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/webm", "audio/aac"];

/** Mime limpo para o bucket: "audio/ogg; codecs=opus" → "audio/ogg"; desconhecido → padrão do tipo. */
export function mediaMime(raw: string | null | undefined, kind: string): string {
  const m = String(raw ?? "").split(";")[0].trim().toLowerCase();
  if (MEDIA_MIMES.includes(m)) return m;
  return kind === "audio" ? "audio/ogg" : "image/jpeg";
}

export function mediaExt(mime: string): string {
  const ext: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/webm": "webm", "audio/aac": "aac",
  };
  return ext[mime] ?? "bin";
}
