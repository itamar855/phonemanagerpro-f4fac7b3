/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST e respostas da Meta sem tipos */
// Meta: API de Conversões + gasto dos anúncios.
//  flush          (cron a cada minuto, com senha interna; ou gerência): envia a fila de eventos.
//                 Cada evento vai no melhor formato disponível: mensagens (conta oficial do WhatsApp)
//                 ou pixel ("chat"). Ver _shared/meta-capi.ts.
//  sync_insights  (cron a cada 2 h, com senha interna; ou gerência): gasto por anúncio e dia
//  save           (gerência): conjunto de dados, WABA, página, conta de anúncios, tokens (só no servidor)
//  status         (gerência): quais tokens estão salvos
//  test           (gerência): evento de teste num dos formatos (aparece em "Testar eventos")
//  backfill       (gerência): manda os leads e vendas dos últimos 7 dias
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireManager, requireMember, requireUser } from "../_shared/http.ts";
import { buildCapiEvent, chooseFormat, GRAPH_VERSION, tooOld, type CapiFormat } from "../_shared/meta-capi.ts";
import { INSIGHT_FIELDS, insightsRange, normalizeAdAccount, parseInsight } from "../_shared/meta-insights.ts";

const MAX_ATTEMPTS = 6;
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

async function graph(path: string, token: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(path.startsWith("http") ? path : `${GRAPH}/${path}`, {
    method: init.method ?? "GET",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(25_000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

const metaError = (r: { status: number; body: any }) => String(r.body?.error?.message ?? `HTTP ${r.status}`).slice(0, 500);

async function sendToMeta(datasetId: string, token: string, events: unknown[], testCode?: string | null) {
  return graph(`${encodeURIComponent(datasetId)}/events`, token, {
    method: "POST", body: { data: events, access_token: token, ...(testCode ? { test_event_code: testCode } : {}) },
  });
}

async function loadSecrets(admin: any, storeId: string): Promise<{ access_token?: string; ads_token?: string }> {
  const { data } = await admin.from("crm_channel_secrets").select("secrets").eq("store_id", storeId).eq("channel", "meta_capi").maybeSingle();
  return data?.secrets ?? {};
}

// ------------------------------------------------------------------ fila

async function flush(admin: any) {
  const { data: rows } = await admin.from("crm_meta_events")
    .select(`*,
      contact:crm_contacts(id, name, phone, email, attribution:crm_attributions!crm_contacts_attribution_id_fkey(fbc, ip, user_agent, ctwa_clid)),
      origin:crm_attributions!crm_meta_events_attribution_id_fkey(fbc, ip, user_agent, ctwa_clid),
      deal:crm_deals(title)`)
    .eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(100);
  const byStore = new Map<string, any[]>();
  for (const r of rows ?? []) byStore.set(r.store_id, [...(byStore.get(r.store_id) ?? []), r]);

  let sent = 0, failed = 0, skipped = 0;
  for (const [storeId, list] of byStore) {
    const { data: s } = await admin.from("crm_tracking_settings").select("*").eq("store_id", storeId).maybeSingle();
    const token = (await loadSecrets(admin, storeId)).access_token;
    if (!s?.enabled || !token) {
      skipped += list.length;
      await admin.from("crm_meta_events").update({ status: "skipped", error: "Rastreamento desligado ou sem token." }).in("id", list.map((r) => r.id));
      continue;
    }

    const groups: Record<CapiFormat, { rows: any[]; events: unknown[] }> = { pixel: { rows: [], events: [] }, messaging: { rows: [], events: [] } };
    for (const r of list) {
      const at = new Date(r.event_time);
      if (tooOld(at)) {
        skipped++;
        await admin.from("crm_meta_events").update({ status: "skipped", error: "Mais de 7 dias: a Meta não aceita mais." }).eq("id", r.id);
        continue;
      }
      // origem do evento (último clique em anúncio) com a 1ª origem do contato de reserva
      const first = r.contact?.attribution ?? {};
      const origin = r.origin ?? {};
      const attribution = {
        ctwa_clid: origin.ctwa_clid ?? first.ctwa_clid ?? null,
        fbc: origin.fbc ?? first.fbc ?? null, ip: origin.ip ?? first.ip ?? null, user_agent: origin.user_agent ?? first.user_agent ?? null,
      };
      const format = chooseFormat(s, r.event_name, attribution.ctwa_clid);
      if (!format) {
        skipped++;
        await admin.from("crm_meta_events").update({ status: "skipped", error: "Sem conjunto de dados para este evento." }).eq("id", r.id);
        continue;
      }
      groups[format].rows.push(r);
      groups[format].events.push(await buildCapiEvent({
        eventName: r.event_name, eventId: r.event_id, eventTime: at, format, wabaId: s.waba_id, pageId: s.page_id,
        contact: { id: r.contact?.id ?? r.contact_id, phone: r.contact?.phone ?? null, name: r.contact?.name ?? null, email: r.contact?.email ?? null },
        attribution, value: r.value, contentName: r.deal?.title ?? null,
      }));
    }

    for (const format of ["messaging", "pixel"] as CapiFormat[]) {
      const g = groups[format];
      if (!g.rows.length) continue;
      const datasetId = format === "messaging" ? s.messaging_dataset_id : s.dataset_id;
      const res = await sendToMeta(datasetId, token, g.events, s.test_event_code);
      const now = new Date();
      if (res.ok) {
        sent += g.rows.length;
        await admin.from("crm_meta_events").update({ status: "sent", format, sent_at: now.toISOString(), response: res.body, error: null })
          .in("id", g.rows.map((r) => r.id));
      } else {
        failed += g.rows.length;
        const err = metaError(res);
        const fatal = res.status === 400 && /token|permission|dataset|pixel|business account/i.test(err);
        for (const r of g.rows) {
          const attempts = r.attempts + 1;
          await admin.from("crm_meta_events").update({
            attempts, error: err, response: res.body, format,
            status: attempts >= MAX_ATTEMPTS || fatal ? "failed" : "pending",
            next_attempt_at: new Date(now.getTime() + Math.min(60, 2 ** attempts) * 60_000).toISOString(),
          }).eq("id", r.id);
        }
      }
    }
  }
  return { sent, failed, skipped };
}

// ------------------------------------------------------------------ gasto

async function syncInsights(admin: any, onlyStore?: string) {
  let q = admin.from("crm_tracking_settings").select("store_id, ad_account_id, insights_synced_at").not("ad_account_id", "is", null);
  if (onlyStore) q = q.eq("store_id", onlyStore);
  const { data: stores } = await q;
  const out: Record<string, { rows?: number; error?: string }> = {};

  for (const st of stores ?? []) {
    const secrets = await loadSecrets(admin, st.store_id);
    const token = secrets.ads_token || secrets.access_token;
    const fail = async (error: string) => {
      out[st.store_id] = { error };
      await admin.from("crm_tracking_settings").update({ insights_error: error }).eq("store_id", st.store_id);
    };
    if (!token) { await fail("Sem token para ler o gasto."); continue; }

    const range = insightsRange(st.insights_synced_at ? new Date(st.insights_synced_at) : null);
    const params = new URLSearchParams({
      level: "ad", time_increment: "1", fields: INSIGHT_FIELDS, limit: "500", time_range: JSON.stringify(range),
    });
    let next: string | null = `${GRAPH}/act_${st.ad_account_id}/insights?${params}`;
    const rows: any[] = [];
    let error: string | null = null;
    for (let page = 0; next && page < 40; page++) {
      const res = await graph(next, token);
      if (!res.ok) { error = metaError(res); break; }
      for (const r of res.body?.data ?? []) { const p = parseInsight(r); if (p) rows.push({ store_id: st.store_id, ...p, updated_at: new Date().toISOString() }); }
      next = res.body?.paging?.next ?? null;
    }
    if (error) { await fail(error); continue; }

    for (let i = 0; i < rows.length; i += 500) {
      const { error: e } = await admin.from("crm_ad_insights").upsert(rows.slice(i, i + 500), { onConflict: "store_id,date,ad_id" });
      if (e) { error = e.message; break; }
    }
    if (error) { await fail(error); continue; }
    await admin.from("crm_tracking_settings").update({ insights_synced_at: new Date().toISOString(), insights_error: null }).eq("store_id", st.store_id);
    out[st.store_id] = { rows: rows.length };
  }
  return out;
}

// ------------------------------------------------------------------ conta oficial

/** Conjunto de dados ligado à WABA (busca; se não houver, cria). */
async function wabaDataset(wabaId: string, token: string): Promise<{ id: string | null; error?: string }> {
  const pick = (b: any) => String(b?.id ?? b?.dataset_id ?? b?.data?.[0]?.id ?? b?.data?.[0]?.dataset_id ?? "") || null;
  const got = await graph(`${encodeURIComponent(wabaId)}/dataset`, token);
  if (got.ok && pick(got.body)) return { id: pick(got.body) };
  const made = await graph(`${encodeURIComponent(wabaId)}/dataset`, token, { method: "POST" });
  if (made.ok && pick(made.body)) return { id: pick(made.body) };
  return { id: null, error: metaError(made.ok ? got : made) };
}

const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    const internal = req.headers.get("x-crm-internal");
    if (internal) {
      if (internal !== Deno.env.get("CRM_CRON_SECRET")) throw new HttpError(401, "Não autorizado.");
      if (action === "flush") return json(await flush(admin));
      if (action === "sync_insights") return json(await syncInsights(admin));
      throw new HttpError(400, "Ação inválida.");
    }

    const user = await requireUser(req, admin);
    await requireManager(admin, user.id);
    if (action === "flush") return json(await flush(admin));

    const storeId = String(body.store_id || "");
    if (!storeId) throw new HttpError(400, "Selecione uma loja.");
    await requireMember(admin, user.id, storeId);

    if (action === "status") {
      const sec = await loadSecrets(admin, storeId);
      return json({ has_token: Boolean(sec.access_token), has_ads_token: Boolean(sec.ads_token) });
    }

    if (action === "save") {
      const datasetId = digits(body.dataset_id);
      if (body.dataset_id && !/^\d{6,20}$/.test(datasetId)) throw new HttpError(400, "O ID do conjunto de dados (pixel) é só números.");
      const number = digits(body.whatsapp_number);
      if (number && (number.length < 12 || number.length > 13)) throw new HttpError(400, "WhatsApp da loja: use 55 + DDD + número.");
      const wabaId = digits(body.waba_id);
      if (wabaId && wabaId.length < 6) throw new HttpError(400, "O ID da conta do WhatsApp Business (WABA) é só números.");
      const pageId = digits(body.page_id);
      if (pageId && pageId.length < 6) throw new HttpError(400, "O ID da página do Facebook é só números.");
      const adAccount = body.ad_account_id ? normalizeAdAccount(body.ad_account_id) : null;
      if (body.ad_account_id && !adAccount) throw new HttpError(400, "Conta de anúncios: use o número (com ou sem act_).");

      const { data: before } = await admin.from("crm_tracking_settings").select("waba_id, messaging_dataset_id, ad_account_id").eq("store_id", storeId).maybeSingle();
      const row: Record<string, unknown> = {
        store_id: storeId, dataset_id: datasetId || null, whatsapp_number: number || null,
        test_event_code: String(body.test_event_code ?? "").trim() || null, updated_by: user.id, updated_at: new Date().toISOString(),
      };
      if ("waba_id" in body) row.waba_id = wabaId || null;
      if ("page_id" in body) row.page_id = pageId || null;
      if ("ad_account_id" in body) {
        row.ad_account_id = adAccount;
        if (adAccount !== before?.ad_account_id) { row.insights_synced_at = null; row.insights_error = null; }
      }
      for (const k of ["enabled", "send_lead", "send_qualified", "send_purchase", "only_attributed"]) if (typeof body[k] === "boolean") row[k] = body[k];
      if (typeof body.qualified_event_name === "string" && /^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(body.qualified_event_name)) row.qualified_event_name = body.qualified_event_name;
      if (Array.isArray(body.qualified_stage_codes)) row.qualified_stage_codes = body.qualified_stage_codes.map(String).slice(0, 10);

      // tokens: junta com o que já está salvo (colar um não apaga o outro)
      const secrets = await loadSecrets(admin, storeId);
      const token = typeof body.access_token === "string" ? body.access_token.trim() : "";
      const adsToken = typeof body.ads_token === "string" ? body.ads_token.trim() : "";
      if (token || adsToken) {
        const merged = { ...secrets, ...(token ? { access_token: token } : {}), ...(adsToken ? { ads_token: adsToken } : {}) };
        const { error: e2 } = await admin.from("crm_channel_secrets").upsert(
          { store_id: storeId, channel: "meta_capi", secrets: merged, updated_at: new Date().toISOString() },
          { onConflict: "store_id,channel" },
        );
        if (e2) throw new HttpError(500, e2.message);
        Object.assign(secrets, merged);
      }

      // conta oficial: descobre o conjunto de dados ligado à WABA
      let warning: string | null = null;
      if ("waba_id" in body) {
        if (!wabaId) row.messaging_dataset_id = null;
        else if (wabaId !== before?.waba_id || !before?.messaging_dataset_id || token) {
          if (!secrets.access_token) warning = "Salve o token para ligar a conta oficial do WhatsApp.";
          else {
            const ds = await wabaDataset(wabaId, secrets.access_token);
            row.messaging_dataset_id = ds.id;
            if (!ds.id) warning = `Não consegui o conjunto de dados da conta oficial: ${ds.error}`;
          }
        }
      }

      const { error } = await admin.from("crm_tracking_settings").upsert(row);
      if (error) throw new HttpError(500, error.message);
      return json({ status: "saved", warning, messaging_dataset_id: row.messaging_dataset_id ?? before?.messaging_dataset_id ?? null });
    }

    if (action === "test") {
      const format: CapiFormat = body.format === "messaging" ? "messaging" : "pixel";
      const { data: s } = await admin.from("crm_tracking_settings").select("*").eq("store_id", storeId).maybeSingle();
      const token = (await loadSecrets(admin, storeId)).access_token;
      if (!token) throw new HttpError(400, "Salve o token antes.");
      if (!s?.test_event_code) throw new HttpError(400, "Coloque o código de teste (Gerenciador de Eventos → Testar eventos).");
      const datasetId = format === "messaging" ? s.messaging_dataset_id : s.dataset_id;
      if (format === "messaging" && (!s.waba_id || !datasetId)) throw new HttpError(400, "Formato de mensagens só com a conta oficial do WhatsApp (WABA) ligada.");
      if (format === "messaging" && !s.page_id) throw new HttpError(400, "Coloque o ID da página do Facebook para o teste de mensagens.");
      if (!datasetId) throw new HttpError(400, "Salve o ID do conjunto de dados (pixel) antes.");
      const ev = await buildCapiEvent({
        eventName: "Lead", eventId: `test:${crypto.randomUUID()}`, eventTime: new Date(), format, wabaId: s.waba_id, pageId: s.page_id,
        contact: { id: `teste-${storeId}`, phone: s.whatsapp_number, name: "Teste CRM" },
      });
      const res = await sendToMeta(datasetId, token, [ev], s.test_event_code);
      if (!res.ok) throw new HttpError(502, `A Meta recusou: ${metaError(res)}`);
      return json({ status: "sent", format, events_received: res.body?.events_received ?? null });
    }

    if (action === "backfill") {
      const { data, error } = await admin.rpc("crm_meta_backfill", { p_store_id: storeId, p_days: 7 });
      if (error) throw new HttpError(500, error.message);
      const sent = await flush(admin);
      return json({ queued: data, ...sent });
    }

    if (action === "sync_insights") {
      const r = await syncInsights(admin, storeId);
      const mine = r[storeId];
      if (!mine) throw new HttpError(400, "Coloque a conta de anúncios antes.");
      if (mine.error) throw new HttpError(502, `A Meta recusou: ${mine.error}`);
      return json({ rows: mine.rows ?? 0 });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    return errorResponse(error);
  }
});
