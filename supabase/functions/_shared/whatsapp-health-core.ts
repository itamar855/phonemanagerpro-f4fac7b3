/* eslint-disable @typescript-eslint/no-explicit-any -- registros e respostas da Evolution sem tipos */
// Saúde do WhatsApp das lojas: regras puras (sem Deno), testadas pelo Vitest.
// Usadas pelo vigia (crm-watchdog), que roda a cada 15 min:
//  - confere o webhook de cada instância e corrige sozinho se estiver errado;
//  - lê as mensagens recentes da Evolution e reenvia ao CRM (modo replay) as que faltam;
//  - avisa quando a loja para de receber conversas diretas, mesmo com os grupos chegando
//    (incidente de 20–21/11/2026), quando a Evolution fica fora do ar, ou quando o teste
//    entre as lojas não chega.
import { inWatchWindow, messageTimeMs, openOfDay } from "./whatsapp-watchdog-core.ts";

const MIN = 60_000;

/** Conversa direta (pessoa), não grupo, lista de transmissão, canal ou status. */
export function isDirectJid(jid: unknown): boolean {
  const j = String(jid ?? "");
  if (!j || j === "status@broadcast") return false;
  return !/@(g\.us|broadcast|newsletter)$/.test(j);
}

/** Tipos que o CRM não grava por desenho: não adianta reenviar. */
export const SKIP_TYPES = new Set([
  "templateMessage", "associatedChildMessage", "albumMessage", "protocolMessage", "reactionMessage",
  "senderKeyDistributionMessage", "messageContextInfo", "pollUpdateMessage", "editedMessage",
]);

const isFromMe = (r: any) => r?.key?.fromMe === true || r?.key?.fromMe === "true";
const digits = (s: unknown) => String(s ?? "").split("@")[0].replace(/\D/g, "");

/** Número do outro lado da conversa (só dígitos), com o número real quando a Evolution manda os dois. */
export function counterpartDigits(r: any): string {
  const alt = String(r?.key?.remoteJidAlt ?? "");
  return digits(alt.endsWith("@s.whatsapp.net") ? alt : r?.key?.remoteJid);
}

export interface ScanSummary {
  count: number;
  oldestMs: number | null;
  newestMs: number | null;
  /** Recebida de qualquer tipo (grupo inclusive): a instância está viva. */
  lastInboundMs: number | null;
  /** Recebida em conversa direta, sem contar o teste automático da outra loja. */
  lastDirectInboundMs: number | null;
  lastGroupInboundMs: number | null;
}

/** Resume as mensagens lidas. `storeNumbers`: números das lojas (o teste entre elas não conta como cliente). */
export function scanSummary(records: any[], storeNumbers: string[] = []): ScanSummary {
  const stores = new Set(storeNumbers.map(digits).filter(Boolean));
  const s: ScanSummary = { count: 0, oldestMs: null, newestMs: null, lastInboundMs: null, lastDirectInboundMs: null, lastGroupInboundMs: null };
  const max = (a: number | null, b: number) => (a == null || b > a ? b : a);
  for (const r of Array.isArray(records) ? records : []) {
    const t = messageTimeMs(r);
    if (t == null) continue;
    s.count++;
    if (s.oldestMs == null || t < s.oldestMs) s.oldestMs = t;
    s.newestMs = max(s.newestMs, t);
    if (isFromMe(r)) continue;
    s.lastInboundMs = max(s.lastInboundMs, t);
    const jid = r?.key?.remoteJid;
    if (String(jid ?? "").endsWith("@g.us")) s.lastGroupInboundMs = max(s.lastGroupInboundMs, t);
    else if (isDirectJid(jid) && !stores.has(counterpartDigits(r))) s.lastDirectInboundMs = max(s.lastDirectInboundMs, t);
  }
  return s;
}

/** Junta o que já se sabia (gravado) com o que acabou de ler: guarda sempre o mais recente. */
export function latest(saved: string | null | undefined, seenMs: number | null): number | null {
  const a = saved ? Date.parse(saved) : NaN;
  const sa = Number.isFinite(a) ? a : null;
  if (sa == null) return seenMs;
  if (seenMs == null) return sa;
  return Math.max(sa, seenMs);
}

export const PAGE_SIZE = 50;
export const MAX_PAGES = 8;
/** Sobreposição com a leitura anterior: mensagem que chegou atrasada ainda é vista. */
export const SCAN_OVERLAP_MS = 30 * MIN;
/** Primeira leitura (sem marca anterior): até 6 h para trás. */
export const FIRST_SCAN_MS = 6 * 60 * MIN;

/** Continua lendo páginas enquanto a mais antiga lida ainda é mais nova que o ponto de parada. */
export function needMorePages(args: { page: number; pageCount: number; oldestMs: number | null; stopAtMs: number }): boolean {
  if (args.page >= MAX_PAGES) return false;
  if (args.pageCount < PAGE_SIZE) return false; // acabou o histórico
  if (args.oldestMs == null) return false;
  return args.oldestMs > args.stopAtMs;
}

/** Até onde ler: a leitura anterior menos a sobreposição (ou 6 h na primeira vez). */
export function scanStopAt(nowMs: number, lastScanIso: string | null | undefined): number {
  const last = lastScanIso ? Date.parse(lastScanIso) : NaN;
  return Number.isFinite(last) ? Math.min(last - SCAN_OVERLAP_MS, nowMs - SCAN_OVERLAP_MS) : nowMs - FIRST_SCAN_MS;
}

/** Mensagem muito nova ainda pode estar chegando pelo webhook. */
export const RECONCILE_MIN_AGE_MS = 3 * MIN;
export const RECONCILE_MAX_AGE_MS = 48 * 60 * MIN;
export const RECONCILE_LIMIT = 60;

/**
 * Mensagens da Evolution que faltam no CRM e valem reenvio: conversa direta, tipo suportado,
 * nem nova demais nem antiga demais, e ainda não tratada (`known` = ids já no CRM ou já reenviados).
 * Mais antigas primeiro, para a conversa ficar na ordem.
 */
export function reconcileCandidates(records: any[], known: Set<string>, nowMs: number, limit = RECONCILE_LIMIT, maxAgeMs = RECONCILE_MAX_AGE_MS): any[] {
  const seen = new Set<string>();
  const out: { r: any; t: number }[] = [];
  for (const r of Array.isArray(records) ? records : []) {
    const id = r?.key?.id;
    if (!id || seen.has(id) || known.has(id)) continue;
    seen.add(id);
    if (!isDirectJid(r?.key?.remoteJid)) continue;
    if (SKIP_TYPES.has(String(r?.messageType ?? ""))) continue;
    const t = messageTimeMs(r);
    if (t == null || nowMs - t < RECONCILE_MIN_AGE_MS || nowMs - t > maxAgeMs) continue;
    out.push({ r, t });
  }
  return out.sort((a, b) => a.t - b.t).slice(0, limit).map((x) => x.r);
}

// ------------------------------------------------------------------ sincronizar pela tela (botão)

/** Períodos que a pessoa escolhe no botão "Sincronizar mensagens". */
export const MANUAL_SYNC_HOURS = [6, 24, 72] as const;
/** Mensagens por página na leitura manual (menos idas à Evolution). */
export const MANUAL_PAGE_SIZE = 100;
/** Teto de páginas na leitura manual (~10 mil mensagens, com grupos). */
export const MANUAL_MAX_PAGES = 100;
/** Teto de reenvios por toque (o resto fica para o próximo toque ou para o vigia). */
export const MANUAL_REPLAY_LIMIT = 400;

/** Horas pedidas → um dos períodos aceitos (padrão 24 h). */
export function manualSyncHours(v: unknown): number {
  const n = Number(v);
  return (MANUAL_SYNC_HOURS as readonly number[]).includes(n) ? n : 24;
}

/** Leitura manual: continua enquanto a página veio cheia e ainda não chegou ao início do período. */
export function manualNeedMore(args: { page: number; pageCount: number; oldestMs: number | null; stopAtMs: number }): boolean {
  if (args.page >= MANUAL_MAX_PAGES) return false;
  if (args.pageCount < MANUAL_PAGE_SIZE) return false;
  if (args.oldestMs == null) return false;
  return args.oldestMs > args.stopAtMs;
}

export interface ManualSyncReport {
  hours: number;
  /** Até quando a leitura chegou (ISO); null se nada foi lido */
  covered_from: string | null;
  /** A leitura cobriu o período inteiro? */
  complete: boolean;
  /** Mensagens de conversa direta (não grupos) lidas no período */
  direct: number;
  /** Faltavam no CRM */
  missing: number;
  saved: number;
  skipped: number;
  lid_queue: number;
  errors: number;
  /** Ficaram para o próximo toque (tempo ou limite) */
  remaining: number;
}

/** Frase curta do resultado, para a tela. */
export function manualSyncText(r: ManualSyncReport): string {
  const period = r.hours >= 48 ? `dos últimos ${Math.round(r.hours / 24)} dias` : `das últimas ${r.hours} h`;
  const parts: string[] = [];
  if (!r.missing) parts.push(`Tudo certo: nenhuma mensagem faltando ${period.replace(/^d/, "n")}.`);
  else {
    parts.push(`${r.saved} mensage${r.saved === 1 ? "m recuperada" : "ns recuperadas"} ${period}.`);
    if (r.lid_queue) parts.push(`${r.lid_queue} de contato sem número aguardam a pessoa escrever de novo.`);
    if (r.errors) parts.push(`${r.errors} deram erro e serão tentadas de novo.`);
    if (r.remaining) parts.push(`Faltam ${r.remaining}: toque de novo para continuar.`);
  }
  if (!r.complete) parts.push("A Evolution não devolveu o período inteiro; o mais antigo foi conferido até onde deu.");
  return parts.join(" ");
}

/** Resultado do reenvio: o que não vale tentar de novo (gravada, ignorada por desenho, na fila do @lid). */
export function replayOutcome(status: number, body: any): { result: string; retry: boolean } {
  if (status === 401) return { result: "nao_autorizado", retry: false };
  if (status >= 500 || status === 0) return { result: `erro_${status}`, retry: true };
  if (status >= 400) return { result: `recusada_${status}`, retry: false };
  const st = String(body?.status ?? "");
  if (st === "success") return { result: body?.crm?.skipped ? "pulada" : "gravada", retry: false };
  if (st === "pending") return { result: "fila_lid", retry: false };
  if (st === "duplicate") return { result: "gravada", retry: false };
  return { result: st || "ok", retry: false };
}
export const REPLAY_MAX_ATTEMPTS = 3;

// ------------------------------------------------------------------ webhook

export const EXPECTED_EVENTS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"];

/**
 * O que está errado no webhook da instância (resposta de GET /webhook/find). Lista vazia = ok.
 * O segredo é comparado aqui e nunca devolvido.
 */
export function webhookIssues(found: any, expected: { url: string; secret: string }): string[] {
  const w = found?.webhook && typeof found.webhook === "object" ? found.webhook : found;
  if (!w || typeof w !== "object" || !w.url) return ["sem webhook"];
  const issues: string[] = [];
  if (w.enabled === false) issues.push("desligado");
  const norm = (u: unknown) => String(u ?? "").trim().replace(/\/+$/, "").toLowerCase();
  if (norm(w.url) !== norm(expected.url)) issues.push("endereço errado");
  const events = new Set((Array.isArray(w.events) ? w.events : []).map((e: unknown) => String(e).toUpperCase().replace(/\./g, "_")));
  if (!events.has("MESSAGES_UPSERT")) issues.push("sem o evento de mensagens");
  const headers = w.headers && typeof w.headers === "object" ? w.headers : {};
  const secret = Object.entries(headers).find(([k]) => k.toLowerCase() === "x-evolution-webhook-secret")?.[1];
  if (secret !== expected.secret) issues.push("senha do webhook diferente");
  return issues;
}

// ------------------------------------------------------------------ teste entre as lojas

/** Sem conversa direta há 1 h no expediente: manda um teste da outra loja para confirmar. */
export const PROBE_AFTER_MS = 60 * MIN;
/** No máximo 1 teste a cada 2 h por loja. */
export const PROBE_EVERY_MS = 120 * MIN;
/** Tempo para o teste chegar antes de contar como "não chegou". */
export const PROBE_WAIT_MS = 10 * MIN;
export const PROBE_TEXT = "🔄 Teste automático do CRM — pode ignorar.";

export function shouldProbe(args: { nowMs: number; lastDirectInboundMs: number | null; lastProbeSentMs: number | null; probePending: boolean }): boolean {
  const { nowMs } = args;
  if (!inWatchWindow(nowMs) || args.probePending) return false;
  if (args.lastProbeSentMs != null && nowMs - args.lastProbeSentMs < PROBE_EVERY_MS) return false;
  const quietFrom = Math.max(args.lastDirectInboundMs ?? 0, openOfDay(nowMs));
  return nowMs - quietFrom >= PROBE_AFTER_MS;
}

export type ProbeState = "none" | "waiting" | "arrived" | "missing";

/** O teste chegou? `seenIds` = ids lidos na Evolution da loja que deveria receber. */
export function probeState(args: { probeId: string | null; sentMs: number | null; seenIds: Set<string>; nowMs: number }): ProbeState {
  if (!args.probeId || args.sentMs == null) return "none";
  if (args.seenIds.has(args.probeId)) return "arrived";
  return args.nowMs - args.sentMs >= PROBE_WAIT_MS ? "missing" : "waiting";
}

// ------------------------------------------------------------------ avisos

/** Grupos chegando mas nenhuma conversa direta há 2h30 no expediente (o maior intervalo normal foi ~1h30). */
export const DIRECT_QUIET_LIMIT_MS = 150 * MIN;
/** Evolution com erro em 3 checagens seguidas (~45 min). */
export const EVO_ERROR_LIMIT = 3;
export const ALERT_COOLDOWN_MS = 6 * 60 * MIN;

/** Avisos que pedem a mesma coisa (reconectar pelo QR): dividem o intervalo de 6 h. Aviso antigo sem tipo = "zumbi". */
const RECONNECT_KINDS = new Set(["zombie", "direct_silent", "probe_missing", "disconnected"]);

export type AlertKind = "direct_silent" | "probe_missing" | "evolution_down" | "webhook_broken" | "disconnected";

export interface HealthInput {
  nowMs: number;
  state: string;
  lastInboundMs: number | null;
  lastDirectInboundMs: number | null;
  evoErrors: number;
  probe: ProbeState;
  webhookIssues: string[];
  webhookFixed: boolean;
  lastAlertMs: number | null;
  lastAlertKind: string | null;
}

/**
 * Avisos além do "zumbi" (que continua com decideAlert): um aviso por vez, com intervalo de 6 h
 * para o mesmo tipo. Só no expediente, menos a Evolution fora do ar e o webhook que não se corrigiu.
 */
export function decideHealthAlert(i: HealthInput): { kind: AlertKind; sinceMs: number | null } | null {
  const family = (k: string | null) => (k && RECONNECT_KINDS.has(k) ? "reconnect" : k);
  const cooled = (kind: AlertKind) =>
    !(i.lastAlertMs != null && family(i.lastAlertKind ?? "zombie") === family(kind) && i.nowMs - i.lastAlertMs < ALERT_COOLDOWN_MS);
  const pick = (kind: AlertKind, sinceMs: number | null) => (cooled(kind) ? { kind, sinceMs } : null);

  if (i.evoErrors >= EVO_ERROR_LIMIT) return pick("evolution_down", null);
  if (i.webhookIssues.length && !i.webhookFixed) return pick("webhook_broken", null);
  if (!inWatchWindow(i.nowMs)) return null;
  const state = String(i.state).toLowerCase();
  if (state === "close" || state === "not_found") return pick("disconnected", null);
  if (state !== "open") return null;
  if (i.probe === "missing") return pick("probe_missing", i.lastDirectInboundMs);
  const quietFrom = Math.max(i.lastDirectInboundMs ?? 0, openOfDay(i.nowMs));
  const groupsFlowing = i.lastInboundMs != null && i.lastInboundMs > quietFrom;
  if (groupsFlowing && i.nowMs - quietFrom > DIRECT_QUIET_LIMIT_MS) return pick("direct_silent", i.lastDirectInboundMs);
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");
function hhmm(ms: number): string {
  const d = new Date(ms - 3 * 60 * MIN);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

const RECONNECT = "No CRM → Configurações → Canais: Desconectar → Conectar (QR Code) → ler o QR com o celular da loja → Configurar webhook.";

export function healthAlertText(kind: AlertKind, store: string, sinceMs: number | null, issues: string[] = []): { title: string; body: string } {
  const since = sinceMs != null ? ` desde ${hhmm(sinceMs)}` : "";
  switch (kind) {
    case "direct_silent":
      return {
        title: `⚠️ ${store}: conversas de clientes não estão chegando`,
        body: `Os grupos chegam, mas nenhuma conversa direta${since}. É o sinal de WhatsApp "meio desconectado". ${RECONNECT}`,
      };
    case "probe_missing":
      return {
        title: `⚠️ ${store}: o WhatsApp não está recebendo`,
        body: `O teste automático enviado pela outra loja não chegou. ${RECONNECT}`,
      };
    case "evolution_down":
      return {
        title: `⚠️ Servidor do WhatsApp com erro`,
        body: `O servidor da Evolution (${store}) não responde há ~45 min. As mensagens não entram no CRM até ele voltar; quando voltar, o CRM sincroniza sozinho.`,
      };
    case "disconnected":
      return {
        title: `⚠️ ${store}: WhatsApp desconectado`,
        body: `A instância da loja está desconectada e nenhuma mensagem entra no CRM. ${RECONNECT}`,
      };
    case "webhook_broken":
      return {
        title: `⚠️ ${store}: webhook do WhatsApp errado`,
        body: `O CRM tentou corrigir sozinho e não conseguiu (${issues.join(", ") || "sem detalhe"}). No CRM → Configurações → Canais, clique em Configurar webhook.`,
      };
  }
}
