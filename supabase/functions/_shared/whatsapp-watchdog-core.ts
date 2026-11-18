/* eslint-disable @typescript-eslint/no-explicit-any -- registros da Evolution sem tipos */
// Vigia do WhatsApp da loja: regras puras, sem Deno — testadas pelo Vitest.
// "Zumbi" = instância mostra `open` e envia, mas não recebe nada (17/11/2026: ~24 h sem
// mensagens no CRM; só voltou com logout + novo QR Code).

export const QUIET_LIMIT_MS = 90 * 60 * 1000; // 90 min sem receber nada
export const COOLDOWN_MS = 6 * 60 * 60 * 1000; // no máximo 1 aviso a cada 6 h
export const OPEN_HOUR = 8; // vigia só entre 8h e 20h (America/Sao_Paulo)
export const CLOSE_HOUR = 20;
const SP_OFFSET_MS = -3 * 60 * 60 * 1000; // Brasil sem horário de verão desde 2019

/** Data/hora "de parede" em São Paulo (campos UTC do Date representam o horário local). */
function spWall(ms: number): Date {
  return new Date(ms + SP_OFFSET_MS);
}

/** Início do expediente de hoje (8h em São Paulo) em epoch ms. */
export function openOfDay(nowMs: number): number {
  const w = spWall(nowMs);
  return Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), OPEN_HOUR) - SP_OFFSET_MS;
}

export function inWatchWindow(nowMs: number): boolean {
  const h = spWall(nowMs).getUTCHours();
  return h >= OPEN_HOUR && h < CLOSE_HOUR;
}

/** Timestamp da mensagem em ms (Evolution manda segundos; às vezes string ou {low}). */
export function messageTimeMs(rec: any): number | null {
  let t: any = rec?.messageTimestamp;
  if (t && typeof t === "object" && "low" in t) t = t.low;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 1e12 ? n * 1000 : n;
}

export interface InboundSummary {
  /** Mensagem recebida (fromMe=false) mais recente, em ms; null se nenhuma na página. */
  lastInboundMs: number | null;
  /** Mensagem mais antiga da página: sem recebida na página, a última recebida é anterior a ela. */
  oldestMs: number | null;
  count: number;
}

/** Resume a página de `findMessages`. Grupos contam: qualquer mensagem recebida é sinal de vida. */
export function summarizeMessages(records: any[]): InboundSummary {
  let lastInboundMs: number | null = null;
  let oldestMs: number | null = null;
  let count = 0;
  for (const r of Array.isArray(records) ? records : []) {
    const t = messageTimeMs(r);
    if (t == null) continue;
    count += 1;
    if (oldestMs == null || t < oldestMs) oldestMs = t;
    if (r?.key?.fromMe === false || r?.key?.fromMe === "false") {
      if (lastInboundMs == null || t > lastInboundMs) lastInboundMs = t;
    }
  }
  return { lastInboundMs, oldestMs, count };
}

/** Registros da resposta de `POST /chat/findMessages` (v2: messages.records; aceita lista pura). */
export function extractRecords(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.messages?.records)) return data.messages.records;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.messages)) return data.messages;
  return [];
}

export type WatchReason =
  | "alert"
  | "not_open"
  | "outside_hours"
  | "receiving"
  | "no_data"
  | "cooldown";

export interface WatchDecision {
  alert: boolean;
  reason: WatchReason;
  /** Desde quando não chega nada (a última recebida, ou o limite inferior conhecido). */
  sinceMs: number | null;
}

/**
 * Decide se avisa. O silêncio só conta dentro do expediente: às 8h não avisa por causa
 * da noite quieta — o primeiro aviso possível do dia é às 9h30.
 */
export function decideAlert(input: {
  state: string;
  summary: InboundSummary;
  nowMs: number;
  lastAlertMs: number | null;
}): WatchDecision {
  const { state, summary, nowMs, lastAlertMs } = input;
  const sinceMs = summary.lastInboundMs ?? summary.oldestMs;
  if (String(state).toLowerCase() !== "open") return { alert: false, reason: "not_open", sinceMs };
  if (!inWatchWindow(nowMs)) return { alert: false, reason: "outside_hours", sinceMs };
  if (sinceMs == null) return { alert: false, reason: "no_data", sinceMs };
  const quietFrom = Math.max(sinceMs, openOfDay(nowMs));
  if (nowMs - quietFrom <= QUIET_LIMIT_MS) return { alert: false, reason: "receiving", sinceMs };
  if (lastAlertMs != null && nowMs - lastAlertMs < COOLDOWN_MS) return { alert: false, reason: "cooldown", sinceMs };
  return { alert: true, reason: "alert", sinceMs };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "14:05" se for hoje (São Paulo); senão "16/11 às 14:05". */
export function formatSince(sinceMs: number, nowMs: number): string {
  const s = spWall(sinceMs);
  const n = spWall(nowMs);
  const hhmm = `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`;
  const sameDay = s.getUTCFullYear() === n.getUTCFullYear() && s.getUTCMonth() === n.getUTCMonth() && s.getUTCDate() === n.getUTCDate();
  return sameDay ? hhmm : `${pad(s.getUTCDate())}/${pad(s.getUTCMonth() + 1)} às ${hhmm}`;
}

export function alertText(sinceMs: number, nowMs: number): string {
  return `⚠️ WhatsApp da loja parou de receber mensagens desde ${formatSince(sinceMs, nowMs)} — desconecte e leia o QR de novo.\n\n`
    + "Ele parece conectado e ainda envia, mas nenhuma mensagem chega ao CRM. Reiniciar não resolve: "
    + "no CRM → Configurações → Canais, desconecte e escaneie o QR Code de novo.";
}

/** Uma checagem por instância (um número pode atender duas lojas). */
export function instanceKey(cfg: { api_url?: string | null; instance_name?: string | null }): string {
  return `${String(cfg.api_url ?? "").replace(/\/+$/, "").toLowerCase()}|${String(cfg.instance_name ?? "")}`;
}
