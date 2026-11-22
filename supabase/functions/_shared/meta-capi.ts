// API de Conversões da Meta — montagem dos eventos (sem rede; testado no Vitest).
// Dados pessoais vão com hash SHA-256, como a Meta exige. fbc, IP, navegador e ctwa_clid vão abertos.
// Dois formatos:
//  pixel     → action_source "chat" no conjunto de dados comum. Funciona com a Evolution: a Meta
//              reconhece a pessoa pelo telefone (públicos, relatórios), mas não otimiza o anúncio de WhatsApp.
//  messaging → API de Conversões para Mensagens (action_source "business_messaging"). Exige a conta
//              oficial do WhatsApp (WABA) e o conjunto de dados ligado a ela. É o que a Meta usa para
//              otimizar anúncios de WhatsApp por lead qualificado / compra.

export const GRAPH_VERSION = "v23.0";

export type CapiFormat = "pixel" | "messaging";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Telefone no formato da Meta: só dígitos, com DDI (55 para números brasileiros sem DDI). */
export function normalizePhoneForMeta(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 10) return null;
  return d.length <= 11 ? `55${d}` : d;
}

const clean = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\s]/gu, "").trim();

export function splitName(name: string | null | undefined): { fn: string | null; ln: string | null } {
  const parts = clean(String(name ?? "")).split(/\s+/).filter(Boolean);
  if (!parts.length || /^(contato|lead)$/.test(parts[0])) return { fn: null, ln: null };
  return { fn: parts[0], ln: parts.length > 1 ? parts[parts.length - 1] : null };
}

/** Eventos aceitos pela API de Conversões para Mensagens. "Lead" lá se chama "LeadSubmitted". */
const MESSAGING_EVENTS = new Set([
  "Purchase", "LeadSubmitted", "InitiateCheckout", "AddToCart", "ViewContent", "OrderCreated", "OrderShipped",
  "OrderDelivered", "OrderCanceled", "OrderReturned", "CartAbandoned", "QualifiedLead", "RatingProvided", "ReviewProvided",
]);

/** Nome do evento no formato de mensagens, ou null se esse evento não existe lá. */
export function messagingEventName(name: string): string | null {
  const n = name === "Lead" ? "LeadSubmitted" : name;
  return MESSAGING_EVENTS.has(n) ? n : null;
}

export interface FormatConfig {
  dataset_id?: string | null;
  messaging_dataset_id?: string | null;
  waba_id?: string | null;
  page_id?: string | null;
}

/**
 * Qual formato usar para um evento:
 * - mensagens, quando há conta oficial (WABA + conjunto ligado) e o evento existe lá e
 *   temos o clique do anúncio (ctwa_clid) ou a página (para a Meta casar pelo telefone);
 * - senão pixel ("chat"), quando há conjunto de dados comum;
 * - senão nenhum.
 */
export function chooseFormat(cfg: FormatConfig, eventName: string, ctwaClid: string | null | undefined): CapiFormat | null {
  const official = Boolean(cfg.waba_id && cfg.messaging_dataset_id && messagingEventName(eventName));
  if (official && (ctwaClid || cfg.page_id)) return "messaging";
  if (cfg.dataset_id) return "pixel";
  return null;
}

export interface CapiInput {
  eventName: string;
  eventId: string;
  eventTime: Date;
  contact: { id: string; phone: string | null; name: string | null; email?: string | null };
  attribution?: { fbc?: string | null; ip?: string | null; user_agent?: string | null; ad_source_url?: string | null; ctwa_clid?: string | null } | null;
  value?: number | null;
  currency?: string;
  contentName?: string | null;
  eventSourceUrl?: string | null;
  format?: CapiFormat;
  wabaId?: string | null;
  pageId?: string | null;
}

/** Um evento no formato da API de Conversões. */
export async function buildCapiEvent(i: CapiInput) {
  const format = i.format ?? "pixel";
  const phone = normalizePhoneForMeta(i.contact.phone);
  const { fn, ln } = splitName(i.contact.name);
  const user_data: Record<string, unknown> = { country: [await sha256("br")] };
  if (phone) user_data.ph = [await sha256(phone)];
  if (fn) user_data.fn = [await sha256(fn)];
  if (ln) user_data.ln = [await sha256(ln)];
  if (i.contact.email) user_data.em = [await sha256(i.contact.email.trim().toLowerCase())];

  if (format === "messaging") {
    if (!i.wabaId) throw new Error("Formato de mensagens exige a conta oficial do WhatsApp (WABA).");
    user_data.whatsapp_business_account_id = i.wabaId;
    if (i.attribution?.ctwa_clid) user_data.ctwa_clid = i.attribution.ctwa_clid;
    if (i.pageId) user_data.page_id = i.pageId;
  } else {
    user_data.external_id = [await sha256(i.contact.id)];
    if (i.attribution?.fbc) user_data.fbc = i.attribution.fbc;
    if (i.attribution?.ip) user_data.client_ip_address = i.attribution.ip;
    if (i.attribution?.user_agent) user_data.client_user_agent = i.attribution.user_agent;
  }

  const custom_data: Record<string, unknown> = {};
  if (i.value !== null && i.value !== undefined && Number(i.value) > 0) {
    custom_data.value = Number(Number(i.value).toFixed(2));
    custom_data.currency = i.currency ?? "BRL";
  } else if (i.eventName === "Purchase") {
    custom_data.value = 0;
    custom_data.currency = i.currency ?? "BRL";
  }
  if (i.contentName) custom_data.content_name = i.contentName.slice(0, 120);
  if (format === "pixel") custom_data.lead_source = "whatsapp";

  const event: Record<string, unknown> = {
    event_name: format === "messaging" ? messagingEventName(i.eventName) ?? i.eventName : i.eventName,
    event_time: Math.floor(i.eventTime.getTime() / 1000),
    event_id: i.eventId,
    action_source: format === "messaging" ? "business_messaging" : "chat",
    user_data,
    custom_data,
  };
  if (format === "messaging") event.messaging_channel = "whatsapp";
  if (format === "pixel" && i.eventSourceUrl) event.event_source_url = i.eventSourceUrl;
  return event;
}

/** A API de Conversões recusa eventos com mais de 7 dias. */
export const MAX_EVENT_AGE_MS = 7 * 86400_000 - 3600_000;
export const tooOld = (eventTime: Date, now = new Date()) => now.getTime() - eventTime.getTime() > MAX_EVENT_AGE_MS;

/** fbc a partir do fbclid do clique (formato fb.1.<ms>.<fbclid>). */
export const fbcFrom = (fbclid: string | null | undefined, at = new Date()) => (fbclid ? `fb.1.${at.getTime()}.${fbclid}` : null);

/** Código curto do clique, sem letras/números que confundem (0/O, 1/I). */
export function newTrackCode(rand: () => number = Math.random): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => A[Math.floor(rand() * A.length)]).join("");
}
