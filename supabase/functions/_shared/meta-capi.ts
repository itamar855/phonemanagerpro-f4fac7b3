// API de Conversões da Meta — montagem dos eventos (sem rede; testado no Vitest).
// Dados pessoais vão com hash SHA-256, como a Meta exige. fbc, IP e navegador vão abertos.

export const GRAPH_VERSION = "v23.0";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Telefone no formato da Meta: só dígitos, com DDI (55 para números brasileiros sem DDI). */
export function normalizePhoneForMeta(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

const clean = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\s]/gu, "").trim();

export function splitName(name: string | null | undefined): { fn: string | null; ln: string | null } {
  const parts = clean(String(name ?? "")).split(/\s+/).filter(Boolean);
  if (!parts.length || /^(contato|lead)$/.test(parts[0])) return { fn: null, ln: null };
  return { fn: parts[0], ln: parts.length > 1 ? parts[parts.length - 1] : null };
}

export interface CapiInput {
  eventName: string;
  eventId: string;
  eventTime: Date;
  contact: { id: string; phone: string | null; name: string | null; email?: string | null };
  attribution?: { fbc?: string | null; ip?: string | null; user_agent?: string | null; ad_source_url?: string | null } | null;
  value?: number | null;
  currency?: string;
  contentName?: string | null;
  eventSourceUrl?: string | null;
}

/** Um evento no formato da API de Conversões. */
export async function buildCapiEvent(i: CapiInput) {
  const phone = normalizePhoneForMeta(i.contact.phone);
  const { fn, ln } = splitName(i.contact.name);
  const user_data: Record<string, unknown> = {
    external_id: [await sha256(i.contact.id)],
    country: [await sha256("br")],
  };
  if (phone) user_data.ph = [await sha256(phone)];
  if (fn) user_data.fn = [await sha256(fn)];
  if (ln) user_data.ln = [await sha256(ln)];
  if (i.contact.email) user_data.em = [await sha256(i.contact.email.trim().toLowerCase())];
  if (i.attribution?.fbc) user_data.fbc = i.attribution.fbc;
  if (i.attribution?.ip) user_data.client_ip_address = i.attribution.ip;
  if (i.attribution?.user_agent) user_data.client_user_agent = i.attribution.user_agent;

  const custom_data: Record<string, unknown> = {};
  if (i.value !== null && i.value !== undefined && Number(i.value) > 0) {
    custom_data.value = Number(Number(i.value).toFixed(2));
    custom_data.currency = i.currency ?? "BRL";
  } else if (i.eventName === "Purchase") {
    custom_data.value = 0;
    custom_data.currency = i.currency ?? "BRL";
  }
  if (i.contentName) custom_data.content_name = i.contentName.slice(0, 120);
  custom_data.lead_source = "whatsapp";

  const event: Record<string, unknown> = {
    event_name: i.eventName,
    event_time: Math.floor(i.eventTime.getTime() / 1000),
    event_id: i.eventId,
    action_source: "chat",
    user_data,
    custom_data,
  };
  if (i.eventSourceUrl) event.event_source_url = i.eventSourceUrl;
  return event;
}

/** fbc a partir do fbclid do clique (formato fb.1.<ms>.<fbclid>). */
export const fbcFrom = (fbclid: string | null | undefined, at = new Date()) => (fbclid ? `fb.1.${at.getTime()}.${fbclid}` : null);

/** Código curto do clique, sem letras/números que confundem (0/O, 1/I). */
export function newTrackCode(rand: () => number = Math.random): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => A[Math.floor(rand() * A.length)]).join("");
}
