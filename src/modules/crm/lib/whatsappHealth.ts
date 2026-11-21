// Saúde do WhatsApp por loja (card em Configurações → Canais): regras de exibição, testadas no Vitest.
// Os números vêm do vigia (crm-watchdog), que checa a cada 15 min.

export interface WhatsAppHealthRow {
  config_id: string;
  store_id: string;
  store_name: string;
  instance_name: string;
  state: string | null;
  checked_at: string | null;
  last_inbound_at: string | null;
  last_direct_inbound_at: string | null;
  webhook_ok: boolean | null;
  webhook_issue: string | null;
  webhook_fixed_at: string | null;
  evo_errors: number;
  last_error: string | null;
  last_error_at: string | null;
  last_sync_at: string | null;
  synced_24h: number;
  lid_pending: number;
  probe_sent_at: string | null;
  probe_ok_at: string | null;
  last_alert_at: string | null;
  last_alert_kind: string | null;
}

export type HealthTone = "ok" | "warn" | "bad";

export interface HealthView {
  tone: HealthTone;
  headline: string;
  details: string[];
}

const MIN = 60_000;
const SP_OFFSET = -3 * 60 * MIN;
const ms = (v: string | null | undefined) => (v ? Date.parse(v) : NaN);
const pad = (n: number) => String(n).padStart(2, "0");

/** "14:05" se for hoje (São Paulo); senão "20/11 14:05". */
export function whenSp(value: string | null | undefined, nowMs: number): string {
  const t = ms(value);
  if (!Number.isFinite(t)) return "—";
  const d = new Date(t + SP_OFFSET);
  const n = new Date(nowMs + SP_OFFSET);
  const hm = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  const same = d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
  return same ? hm : `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${hm}`;
}

function inBusinessHours(nowMs: number): boolean {
  const h = new Date(nowMs + SP_OFFSET).getUTCHours();
  return h >= 8 && h < 20;
}

/** Começo do expediente de hoje (8h em São Paulo): a noite quieta não conta como problema. */
function openOfDay(nowMs: number): number {
  const d = new Date(nowMs + SP_OFFSET);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 8) - SP_OFFSET;
}

export function healthView(r: WhatsAppHealthRow, nowMs: number): HealthView {
  const details: string[] = [];
  details.push(`Última conversa de cliente: ${whenSp(r.last_direct_inbound_at, nowMs)}`);
  if (r.synced_24h > 0) details.push(`Recuperadas automaticamente (24 h): ${r.synced_24h}`);
  if (r.lid_pending > 0) details.push(`Esperando o número do contato: ${r.lid_pending}`);
  if (r.probe_ok_at) details.push(`Teste entre as lojas chegou: ${whenSp(r.probe_ok_at, nowMs)}`);
  if (r.webhook_fixed_at && nowMs - ms(r.webhook_fixed_at) < 24 * 60 * MIN) details.push(`Webhook corrigido sozinho: ${whenSp(r.webhook_fixed_at, nowMs)}`);
  details.push(`Checado: ${whenSp(r.checked_at, nowMs)}`);

  const checked = ms(r.checked_at);
  if (!Number.isFinite(checked)) return { tone: "warn", headline: "Ainda não checado pelo vigia", details };
  if (r.evo_errors > 0) return { tone: "bad", headline: "Servidor do WhatsApp com erro", details: [r.last_error ?? "sem detalhe", ...details] };
  if (nowMs - checked > 40 * MIN) return { tone: "warn", headline: `Vigia sem checar desde ${whenSp(r.checked_at, nowMs)}`, details };
  const state = String(r.state ?? "").toLowerCase();
  if (state === "connecting") return { tone: "warn", headline: "Aguardando leitura do QR Code", details };
  if (state !== "open") return { tone: "bad", headline: "Desconectado", details };
  if (r.webhook_ok === false) return { tone: "bad", headline: `Webhook errado${r.webhook_issue ? `: ${r.webhook_issue}` : ""}`, details };

  if (inBusinessHours(nowMs)) {
    const day = openOfDay(nowMs);
    const any = ms(r.last_inbound_at);
    const direct = ms(r.last_direct_inbound_at);
    const quietAll = Math.max(Number.isFinite(any) ? any : 0, day);
    if (nowMs - quietAll > 90 * MIN) return { tone: "bad", headline: `Não recebe nada desde ${whenSp(r.last_inbound_at, nowMs)}`, details };
    const quietDirect = Math.max(Number.isFinite(direct) ? direct : 0, day);
    if (nowMs - quietDirect > 150 * MIN) return { tone: "bad", headline: `Conversas de clientes não chegam desde ${whenSp(r.last_direct_inbound_at, nowMs)}`, details };
  }
  return { tone: "ok", headline: "Recebendo normalmente", details };
}
