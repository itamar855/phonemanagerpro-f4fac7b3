/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST e payloads da Evolution sem tipos */
// Vigia do WhatsApp das lojas (cron a cada 15 min com a senha interna CRM_CRON_SECRET, ou gerência pela tela).
// Por instância:
//  1. webhook: confere na Evolution e corrige sozinho se estiver errado;
//  2. sincronização: lê as mensagens recentes e reenvia ao CRM (replay, sem IA nem avisos) as que faltam;
//  3. saúde: última mensagem recebida, última conversa DIRETA, erros da Evolution;
//  4. teste entre lojas: sem conversa direta há 1 h no expediente, a outra loja manda um teste;
//  5. avisos: "zumbi", grupos sem conversas diretas, teste que não chegou, Evolution fora, webhook errado —
//     por WhatsApp para o admin e no celular (Web Push) dos admins.
// Regras em _shared/whatsapp-watchdog-core.ts e _shared/whatsapp-health-core.ts.
// Nunca devolve nem registra a chave da API nem o segredo do webhook.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireManager, requireMember, requireUser } from "../_shared/http.ts";
import { evolution, type EvolutionConfig } from "../_shared/evolution.ts";
import { sendPush, type PushTarget } from "../_shared/push.ts";
import { alertText, decideAlert, extractRecords, instanceKey } from "../_shared/whatsapp-watchdog-core.ts";
import {
  type AlertKind, decideHealthAlert, healthAlertText, isDirectJid, latest, needMorePages, PAGE_SIZE, PROBE_TEXT, probeState,
  type ProbeState, reconcileCandidates, REPLAY_MAX_ATTEMPTS, replayOutcome, scanStopAt, scanSummary, shouldProbe, webhookIssues,
  type ManualSyncReport, MANUAL_MAX_PAGES, MANUAL_PAGE_SIZE, MANUAL_REPLAY_LIMIT, manualNeedMore, manualSyncHours, manualSyncText, RECONCILE_LIMIT,
} from "../_shared/whatsapp-health-core.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
/** Tempo máximo de reenvio por instância em cada checagem (o resto fica para a próxima). */
const REPLAY_BUDGET_MS = 45_000;

interface Instance {
  cfg: EvolutionConfig;
  storeName: string;
  health: any;
  state: string;
  owner: string | null;
  records: any[];
  error: string | null;
  result: Record<string, unknown>;
}

const iso = (ms: number | null | undefined) => (ms != null && Number.isFinite(ms) ? new Date(ms).toISOString() : null);
const short = (name: string | null | undefined) => String(name ?? "").replace(/^.*\(([^)]+)\).*$/, "$1") || "Loja";

// ------------------------------------------------------------------ leitura

async function scanMessages(cfg: EvolutionConfig, health: any, nowMs: number): Promise<any[]> {
  const evo = evolution(cfg);
  const stopAt = scanStopAt(nowMs, health?.scanned_at);
  const all: any[] = [];
  for (let page = 1; ; page++) {
    let recs: any[];
    try {
      recs = extractRecords(await evo.recentMessages(PAGE_SIZE, page));
    } catch (e) {
      if (page === 1) throw e;
      console.warn("[watchdog] página", page, (e as Error).message);
      break; // usa o que já leu
    }
    all.push(...recs);
    const oldest = scanSummary(recs).oldestMs;
    if (!needMorePages({ page, pageCount: recs.length, oldestMs: oldest, stopAtMs: stopAt })) break;
  }
  return all;
}

// ------------------------------------------------------------------ webhook

async function checkWebhook(cfg: EvolutionConfig): Promise<{ ok: boolean; issues: string[]; fixed: boolean }> {
  const secret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!secret) return { ok: false, issues: ["EVOLUTION_WEBHOOK_SECRET ausente no servidor"], fixed: false };
  const evo = evolution(cfg);
  const issues = webhookIssues(await evo.findWebhook(), { url: WEBHOOK_URL, secret });
  if (!issues.length) return { ok: true, issues, fixed: false };
  try {
    await evo.setWebhook(WEBHOOK_URL, secret);
    const after = webhookIssues(await evo.findWebhook(), { url: WEBHOOK_URL, secret });
    console.warn("[watchdog] webhook corrigido:", cfg.instance_name, issues.join(", "), after.length ? `→ ainda: ${after.join(", ")}` : "→ ok");
    return { ok: after.length === 0, issues: after.length ? after : issues, fixed: after.length === 0 };
  } catch (e) {
    console.error("[watchdog] corrigir webhook:", (e as Error).message);
    return { ok: false, issues, fixed: false };
  }
}

// ------------------------------------------------------------------ sincronização

async function knownIds(admin: any, configId: string, ids: string[]): Promise<Set<string>> {
  const known = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const [{ data: msgs, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
      admin.from("crm_messages").select("external_id").in("external_id", chunk),
      admin.from("whatsapp_sync_log").select("external_id, retry, attempts").eq("config_id", configId).in("external_id", chunk),
    ]);
    if (e1 || e2) throw new Error(`ler mensagens do CRM: ${(e1 ?? e2).message}`);
    for (const m of msgs ?? []) known.add(m.external_id);
    for (const l of logs ?? []) if (!l.retry || l.attempts >= REPLAY_MAX_ATTEMPTS) known.add(l.external_id);
  }
  return known;
}

interface ReconcileResult { sent: number; saved: number; errors: number; skipped: number; lid: number; missing: number; remaining: number }

async function reconcile(
  admin: any, inst: Instance, nowMs: number,
  opts: { limit?: number; maxAgeMs?: number; budgetMs?: number; strict?: boolean } = {},
): Promise<ReconcileResult> {
  const out: ReconcileResult = { sent: 0, saved: 0, errors: 0, skipped: 0, lid: 0, missing: 0, remaining: 0 };
  const cron = Deno.env.get("CRM_CRON_SECRET");
  const secret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
  if (!cron || !secret) {
    if (opts.strict) throw new Error("Segredos do servidor ausentes (CRM_CRON_SECRET / EVOLUTION_WEBHOOK_SECRET).");
    return out;
  }
  const ids = [...new Set(inst.records.filter((r) => isDirectJid(r?.key?.remoteJid)).map((r) => r?.key?.id).filter(Boolean))] as string[];
  if (!ids.length) return out;
  const known = await knownIds(admin, inst.cfg.id, ids);
  const all = reconcileCandidates(inst.records, known, nowMs, Number.MAX_SAFE_INTEGER, opts.maxAgeMs);
  out.missing = all.length;
  const candidates = all.slice(0, opts.limit ?? RECONCILE_LIMIT);
  const budget = opts.budgetMs ?? REPLAY_BUDGET_MS;
  const started = Date.now();
  let sent = 0, saved = 0, errors = 0;
  for (const r of candidates) {
    if (Date.now() - started > budget) break;
    let status = 0, body: any = null;
    try {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-evolution-webhook-secret": secret, "x-crm-internal": cron },
        body: JSON.stringify({ event: "messages.upsert", instance: inst.cfg.instance_name, data: r, replay: true }),
      });
      status = res.status;
      body = await res.json().catch(() => null);
    } catch (e) {
      console.error("[watchdog] reenvio:", (e as Error).message);
    }
    sent++;
    const res = replayOutcome(status, body);
    if (res.result === "gravada") saved++;
    else if (res.result === "pulada") out.skipped++;
    else if (res.result === "fila_lid") out.lid++;
    if (res.retry) errors++;
    const { data: prev } = await admin.from("whatsapp_sync_log").select("attempts").eq("config_id", inst.cfg.id).eq("external_id", r.key.id).maybeSingle();
    await admin.from("whatsapp_sync_log").upsert({
      config_id: inst.cfg.id, external_id: r.key.id, result: res.result, retry: res.retry,
      attempts: (prev?.attempts ?? 0) + 1, message_at: iso(Number(r.messageTimestamp) * 1000), last_at: new Date().toISOString(),
    }, { onConflict: "config_id,external_id" });
    if (status === 401) break; // segredo errado: não insiste
  }
  if (sent) console.log(`[watchdog] ${inst.cfg.instance_name}: ${sent} reenviadas, ${saved} gravadas, ${errors} com erro`);
  Object.assign(out, { sent, saved, errors, remaining: Math.max(0, out.missing - sent) });
  return out;
}

// ------------------------------------------------------------------ sincronizar pela tela (botão por loja)

/** Lê o período pedido (páginas em lotes paralelos); para no início do período, no fim do histórico ou no tempo-limite. */
async function scanPeriod(cfg: EvolutionConfig, stopAtMs: number, budgetMs: number): Promise<{ records: any[]; complete: boolean }> {
  const evo = evolution(cfg);
  const all: any[] = [];
  const started = Date.now();
  const BATCH = 4;
  for (let first = 1; first <= MANUAL_MAX_PAGES; first += BATCH) {
    const pages = Array.from({ length: Math.min(BATCH, MANUAL_MAX_PAGES - first + 1) }, (_, i) => first + i);
    const got = await Promise.all(pages.map(async (p) => {
      try { return extractRecords(await evo.recentMessages(MANUAL_PAGE_SIZE, p)); }
      catch (e) { if (p === 1) throw e; console.warn("[sync] página", p, (e as Error).message); return null; }
    }));
    for (let i = 0; i < got.length; i++) {
      const recs = got[i];
      if (!recs) return { records: all, complete: false };
      all.push(...recs);
      const oldest = scanSummary(recs).oldestMs;
      if (!manualNeedMore({ page: pages[i], pageCount: recs.length, oldestMs: oldest, stopAtMs })) {
        return { records: all, complete: recs.length < MANUAL_PAGE_SIZE || (oldest != null && oldest <= stopAtMs) };
      }
    }
    if (Date.now() - started > budgetMs) return { records: all, complete: false };
  }
  return { records: all, complete: false };
}

async function syncStore(admin: any, storeId: string, hours: number) {
  const nowMs = Date.now();
  const { data: cfg } = await admin.from("whatsapp_config").select("*, store:stores(name)").eq("store_id", storeId).eq("is_active", true).maybeSingle();
  if (!cfg) throw new HttpError(400, "Esta loja não tem WhatsApp conectado.");
  const state = await evolution(cfg).connectionState();
  if (state !== "open") throw new HttpError(409, "O WhatsApp desta loja não está conectado. Conecte pelo QR Code antes de sincronizar.");

  const periodMs = hours * 3_600_000;
  const stopAtMs = nowMs - periodMs;
  const { records, complete } = await scanPeriod(cfg, stopAtMs, 60_000);
  const store = Array.isArray(cfg.store) ? cfg.store[0] : cfg.store;
  const inst: Instance = { cfg, storeName: short(store?.name), health: null, state, owner: null, records, error: null, result: {} };
  const r = await reconcile(admin, inst, nowMs, { limit: MANUAL_REPLAY_LIMIT, maxAgeMs: periodMs, budgetMs: 70_000, strict: true });

  const oldest = scanSummary(records).oldestMs;
  const report: ManualSyncReport = {
    hours, covered_from: iso(oldest != null ? Math.max(oldest, stopAtMs) : null), complete,
    direct: records.filter((x) => isDirectJid(x?.key?.remoteJid)).length,
    missing: r.missing, saved: r.saved, skipped: r.skipped, lid_queue: r.lid, errors: r.errors, remaining: r.remaining,
  };
  await admin.from("whatsapp_watchdog").upsert({ config_id: cfg.id, last_sync_at: iso(nowMs), last_sync_saved: r.saved }, { onConflict: "config_id" });
  console.log(`[sync] ${cfg.instance_name}: ${hours} h, ${records.length} lidas, ${r.missing} faltando, ${r.saved} gravadas`);
  return { ...report, message: manualSyncText(report) };
}

// ------------------------------------------------------------------ avisos

async function adminPushTargets(admin: any): Promise<PushTarget[]> {
  const { data: admins } = await admin.from("user_roles").select("user_id").eq("role", "admin");
  const ids = (admins ?? []).map((a: any) => a.user_id);
  if (!ids.length) return [];
  const { data } = await admin.from("crm_push_subscriptions").select("id, endpoint, p256dh, auth").in("user_id", ids);
  return (data ?? []).map((s: any) => ({ subscription_id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth }));
}

/** Aviso pelo WhatsApp (de uma instância que esteja aberta) e no celular dos admins. Nunca lança. */
async function sendAlert(admin: any, inst: Instance, all: Instance[], title: string, body: string): Promise<boolean> {
  let delivered = false;
  try {
    const r = await sendPush(admin, await adminPushTargets(admin), { title, body, url: "/crm/config", tag: `whatsapp-${inst.cfg.id}` });
    delivered = r.sent > 0;
  } catch (e) { console.error("[watchdog] push:", (e as Error).message); }
  const senders = [inst, ...all.filter((o) => o !== inst)].filter((o) => o.state === "open" && !o.error);
  if (senders.length) {
    try {
      const { data: phone } = await admin.rpc("whatsapp_watchdog_admin_phone", { p_store_id: inst.cfg.store_id });
      if (phone) {
        await evolution(senders[0].cfg).sendText(`${phone}@s.whatsapp.net`, `${title}\n\n${body}`);
        delivered = true;
      }
    } catch (e) { console.error("[watchdog] aviso WhatsApp:", (e as Error).message); }
  }
  return delivered;
}

// ------------------------------------------------------------------ checagem

async function checkAll(admin: any): Promise<Record<string, unknown>[]> {
  const nowMs = Date.now();
  const { data: configs, error } = await admin.from("whatsapp_config").select("*, store:stores(name)").eq("is_active", true);
  if (error) throw new HttpError(500, error.message);
  const ids = (configs ?? []).map((c: any) => c.id);
  const { data: rows } = ids.length ? await admin.from("whatsapp_watchdog").select("*").in("config_id", ids) : { data: [] };
  const healthOf = new Map((rows ?? []).map((r: any) => [r.config_id, r]));

  const seen = new Set<string>();
  const list: Instance[] = [];
  for (const c of (configs ?? []) as any[]) {
    const key = instanceKey(c);
    if (seen.has(key)) continue; // mesmo número em duas lojas: uma checagem só
    seen.add(key);
    const store = Array.isArray(c.store) ? c.store[0] : c.store;
    list.push({ cfg: c, storeName: short(store?.name), health: healthOf.get(c.id) ?? null, state: "unknown", owner: null, records: [], error: null, result: { store_id: c.store_id, instance: c.instance_name } });
  }

  // 1) estado, número e mensagens de cada instância
  await Promise.all(list.map(async (inst) => {
    try {
      const evo = evolution(inst.cfg);
      inst.state = await evo.connectionState();
      inst.owner = (await evo.ownerNumber().catch(() => null)) ?? inst.health?.owner_number ?? null;
      if (inst.state === "open") inst.records = await scanMessages(inst.cfg, inst.health, nowMs);
    } catch (e) {
      inst.error = (e as Error).message;
      if (inst.state === "unknown") inst.state = "unreachable";
    }
  }));
  const storeNumbers = list.map((i) => i.owner).filter(Boolean) as string[];

  for (const inst of list) {
    const h = inst.health ?? {};
    const row: Record<string, unknown> = { config_id: inst.cfg.id, last_state: inst.state, checked_at: iso(nowMs), owner_number: inst.owner };
    const res = inst.result;
    res.state = inst.state;
    try {
      if (inst.error) throw new Error(inst.error);

      // 2) webhook
      let wh = { ok: Boolean(h.webhook_ok), issues: [] as string[], fixed: false };
      if (inst.state === "open") {
        wh = await checkWebhook(inst.cfg);
        Object.assign(row, { webhook_ok: wh.ok, webhook_issue: wh.issues.join(", ") || null, webhook_checked_at: iso(nowMs) });
        if (wh.fixed) row.webhook_fixed_at = iso(nowMs);
        res.webhook = wh.ok ? (wh.fixed ? "corrigido" : "ok") : wh.issues;
      }

      // 3) saúde a partir do que foi lido
      const s = scanSummary(inst.records, storeNumbers);
      const lastInbound = latest(h.last_inbound_at, s.lastInboundMs);
      const lastDirect = latest(h.last_direct_inbound_at, s.lastDirectInboundMs);
      Object.assign(row, {
        last_inbound_at: iso(lastInbound), last_direct_inbound_at: iso(lastDirect),
        last_group_inbound_at: iso(latest(h.last_group_inbound_at, s.lastGroupInboundMs)),
        evo_errors: 0, scanned_at: inst.state === "open" ? iso(nowMs) : h.scanned_at ?? null,
      });

      // 4) sincronização
      if (inst.state === "open" && inst.records.length) {
        const sync = await reconcile(admin, inst, nowMs);
        Object.assign(row, { last_sync_at: iso(nowMs), last_sync_saved: sync.saved });
        res.sync = sync;
      }

      // 5) teste entre lojas: chegou?
      const seenIds = new Set(inst.records.map((r) => r?.key?.id).filter(Boolean));
      const probe: ProbeState = probeState({ probeId: h.probe_external_id ?? null, sentMs: h.probe_sent_at ? Date.parse(h.probe_sent_at) : null, seenIds, nowMs });
      if (probe === "arrived") Object.assign(row, { probe_ok_at: iso(nowMs), probe_external_id: null });
      if (probe === "missing") row.probe_external_id = null; // conta uma vez só

      // 6) avisos: primeiro o "zumbi" (nada chega), depois os novos
      const lastAlertMs = h.last_alert_at ? Date.parse(h.last_alert_at) : null;
      const zombie = decideAlert({ state: inst.state, summary: { lastInboundMs: lastInbound, oldestMs: s.oldestMs, count: s.count }, nowMs, lastAlertMs });
      let alerted: string | null = null;
      if (zombie.alert && zombie.sinceMs != null) {
        if (await sendAlert(admin, inst, list, `⚠️ ${inst.storeName}: WhatsApp parou de receber`, alertText(zombie.sinceMs, nowMs))) alerted = "zombie";
      } else {
        const d = decideHealthAlert({
          nowMs, state: inst.state, lastInboundMs: lastInbound, lastDirectInboundMs: lastDirect, evoErrors: 0, probe,
          webhookIssues: wh.ok ? [] : wh.issues, webhookFixed: wh.fixed, lastAlertMs, lastAlertKind: h.last_alert_kind ?? null,
        });
        if (d) {
          const t = healthAlertText(d.kind, inst.storeName, d.sinceMs, wh.issues);
          if (await sendAlert(admin, inst, list, t.title, t.body)) alerted = d.kind;
        }
      }
      if (alerted) Object.assign(row, { last_alert_at: iso(nowMs), last_alert_kind: alerted });
      res.alert = alerted;

      // 7) teste entre lojas: precisa mandar outro?
      if (inst.state === "open" && inst.owner && probe !== "waiting") {
        if (shouldProbe({ nowMs, lastDirectInboundMs: lastDirect, lastProbeSentMs: h.probe_sent_at ? Date.parse(h.probe_sent_at) : null, probePending: false })) {
          const sender = list.find((o) => o !== inst && o.state === "open" && !o.error && o.owner && o.owner !== inst.owner);
          if (sender) {
            await admin.rpc("whatsapp_ensure_store_contact", { p_store_id: inst.cfg.store_id, p_phone: sender.owner, p_label: sender.storeName });
            await admin.rpc("whatsapp_ensure_store_contact", { p_store_id: sender.cfg.store_id, p_phone: inst.owner, p_label: inst.storeName });
            const { externalId } = await evolution(sender.cfg).sendText(inst.owner, PROBE_TEXT);
            Object.assign(row, { probe_external_id: externalId, probe_sent_at: iso(nowMs), probe_from_config: sender.cfg.id });
            res.probe = "enviado";
          }
        }
      }
      res.probe_state = probe;
    } catch (e) {
      const msg = (e as Error).message;
      const errors = Number(h.evo_errors ?? 0) + 1;
      Object.assign(row, { evo_errors: errors, last_error: msg.slice(0, 300), last_error_at: iso(nowMs) });
      res.error = msg;
      console.error("[watchdog]", inst.cfg.instance_name, msg);
      const lastAlertMs = h.last_alert_at ? Date.parse(h.last_alert_at) : null;
      const d = decideHealthAlert({
        nowMs, state: inst.state, lastInboundMs: null, lastDirectInboundMs: null, evoErrors: errors, probe: "none",
        webhookIssues: [], webhookFixed: false, lastAlertMs, lastAlertKind: h.last_alert_kind ?? null,
      });
      if (d?.kind === "evolution_down") {
        const t = healthAlertText(d.kind, inst.storeName, null);
        if (await sendAlert(admin, inst, list, t.title, t.body)) Object.assign(row, { last_alert_at: iso(nowMs), last_alert_kind: d.kind as AlertKind });
      }
    }
    const { error: uErr } = await admin.from("whatsapp_watchdog").upsert(row, { onConflict: "config_id" });
    if (uErr) console.error("[watchdog] gravar", uErr.message);
  }

  // limpeza do registro de reenvios (7 dias)
  await admin.from("whatsapp_sync_log").delete().lt("last_at", new Date(nowMs - 7 * 86_400_000).toISOString());
  return list.map((i) => i.result);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");
    if (action !== "check" && action !== "sync") throw new HttpError(400, "Ação inválida.");

    // botão "Sincronizar mensagens" de uma loja (gerência daquela loja)
    if (action === "sync") {
      const user = await requireUser(req, admin);
      await requireManager(admin, user.id);
      const storeId = String(body.store_id || "");
      if (!storeId) throw new HttpError(400, "Escolha a loja.");
      await requireMember(admin, user.id, storeId);
      return json(await syncStore(admin, storeId, manualSyncHours(body.hours)));
    }

    const internal = req.headers.get("x-crm-internal");
    if (internal) {
      if (internal !== Deno.env.get("CRM_CRON_SECRET")) throw new HttpError(401, "Não autorizado.");
    } else {
      const user = await requireUser(req, admin);
      await requireManager(admin, user.id);
    }
    return json({ results: await checkAll(admin) });
  } catch (e) {
    return errorResponse(e);
  }
});
