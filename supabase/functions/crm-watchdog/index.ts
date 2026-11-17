/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST e payloads da Evolution sem tipos */
// Vigia do WhatsApp da loja: avisa o admin quando a instância fica "zumbi"
// (mostra open, envia, mas não recebe nada há mais de 90 min entre 8h e 20h).
//  check (cron a cada 15 min com a senha interna CRM_CRON_SECRET, ou gerência pela tela)
// Regras em _shared/whatsapp-watchdog-core.ts. Nunca devolve nem registra a chave da API.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireManager, requireUser } from "../_shared/http.ts";
import { evolution, type EvolutionConfig } from "../_shared/evolution.ts";
import { alertText, decideAlert, extractRecords, instanceKey, summarizeMessages } from "../_shared/whatsapp-watchdog-core.ts";

interface CheckResult {
  store_id: string;
  instance: string;
  state: string;
  reason: string;
  since: string | null;
  alerted: boolean;
  error?: string;
}

async function checkAll(admin: any): Promise<CheckResult[]> {
  const { data: configs, error } = await admin.from("whatsapp_config").select("*").eq("is_active", true);
  if (error) throw new HttpError(500, error.message);
  const seen = new Set<string>();
  const out: CheckResult[] = [];

  for (const cfg of (configs ?? []) as EvolutionConfig[]) {
    const key = instanceKey(cfg);
    if (seen.has(key)) continue; // mesmo número em duas lojas: um aviso só
    seen.add(key);
    const res: CheckResult = { store_id: cfg.store_id, instance: cfg.instance_name, state: "unknown", reason: "", since: null, alerted: false };
    out.push(res);
    try {
      const evo = evolution(cfg);
      const nowMs = Date.now();
      res.state = await evo.connectionState();
      const { data: health } = await admin.from("whatsapp_watchdog").select("last_alert_at").eq("config_id", cfg.id).maybeSingle();
      const lastAlertMs = health?.last_alert_at ? Date.parse(health.last_alert_at) : null;

      // só lê as mensagens se a instância diz que está aberta (o resto não é "zumbi")
      const summary = res.state === "open"
        ? summarizeMessages(extractRecords(await evo.recentMessages(50)))
        : { lastInboundMs: null, oldestMs: null, count: 0 };
      const d = decideAlert({ state: res.state, summary, nowMs, lastAlertMs });
      res.reason = d.reason;
      res.since = d.sinceMs != null ? new Date(d.sinceMs).toISOString() : null;

      let alertedAt: string | null = null;
      if (d.alert && d.sinceMs != null) {
        const { data: phone, error: pErr } = await admin.rpc("whatsapp_watchdog_admin_phone", { p_store_id: cfg.store_id });
        if (pErr) throw new Error(pErr.message);
        if (!phone) throw new Error("nenhum admin com celular em profiles.phone");
        await evo.sendText(`${phone}@s.whatsapp.net`, alertText(d.sinceMs, nowMs));
        alertedAt = new Date(nowMs).toISOString();
        res.alerted = true;
      }

      const row: Record<string, unknown> = {
        config_id: cfg.id,
        last_state: res.state,
        last_inbound_at: summary.lastInboundMs != null ? new Date(summary.lastInboundMs).toISOString() : null,
        checked_at: new Date(nowMs).toISOString(),
      };
      if (alertedAt) row.last_alert_at = alertedAt;
      const { error: uErr } = await admin.from("whatsapp_watchdog").upsert(row, { onConflict: "config_id" });
      if (uErr) console.error("[watchdog] gravar", uErr.message);
    } catch (e) {
      res.error = (e as Error).message;
      console.error("[watchdog]", cfg.instance_name, res.error);
    }
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    if (String(body.action || "") !== "check") throw new HttpError(400, "Ação inválida.");

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
