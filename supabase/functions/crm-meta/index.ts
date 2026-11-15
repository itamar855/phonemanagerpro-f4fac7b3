/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST e respostas da Meta sem tipos */
// API de Conversões da Meta.
//  flush  (cron a cada minuto, com senha interna; ou gerência): envia a fila de eventos
//  save   (gerência): dataset, código de teste, número do WhatsApp e token (o token só fica no servidor)
//  status (gerência): se há token salvo
//  test   (gerência): manda um evento de teste (aparece em Gerenciador de Eventos → Testar eventos)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireManager, requireMember, requireUser } from "../_shared/http.ts";
import { buildCapiEvent, GRAPH_VERSION } from "../_shared/meta-capi.ts";

const MAX_ATTEMPTS = 6;

async function sendToMeta(datasetId: string, token: string, events: unknown[], testCode?: string | null) {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(datasetId)}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: events, access_token: token, ...(testCode ? { test_event_code: testCode } : {}) }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

async function loadToken(admin: any, storeId: string): Promise<string | null> {
  const { data } = await admin.from("crm_channel_secrets").select("secrets").eq("store_id", storeId).eq("channel", "meta_capi").maybeSingle();
  return data?.secrets?.access_token ?? null;
}

async function flush(admin: any) {
  const { data: rows } = await admin.from("crm_meta_events")
    .select("*, contact:crm_contacts(id, name, phone, email, attribution:crm_attributions!crm_contacts_attribution_id_fkey(fbc, ip, user_agent, ad_source_url)), deal:crm_deals(title)")
    .eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(100);
  const byStore = new Map<string, any[]>();
  for (const r of rows ?? []) byStore.set(r.store_id, [...(byStore.get(r.store_id) ?? []), r]);

  let sent = 0, failed = 0;
  for (const [storeId, list] of byStore) {
    const { data: s } = await admin.from("crm_tracking_settings").select("*").eq("store_id", storeId).maybeSingle();
    const token = await loadToken(admin, storeId);
    if (!s?.enabled || !s.dataset_id || !token) {
      await admin.from("crm_meta_events").update({ status: "skipped", error: "Rastreamento desligado ou sem token." }).in("id", list.map((r) => r.id));
      continue;
    }
    const events = await Promise.all(list.map((r) => buildCapiEvent({
      eventName: r.event_name, eventId: r.event_id, eventTime: new Date(r.event_time),
      contact: { id: r.contact?.id ?? r.contact_id, phone: r.contact?.phone ?? null, name: r.contact?.name ?? null, email: r.contact?.email ?? null },
      attribution: r.contact?.attribution ?? null, value: r.value, contentName: r.deal?.title ?? null,
    })));
    const res = await sendToMeta(s.dataset_id, token, events, s.test_event_code);
    const now = new Date();
    if (res.ok) {
      sent += list.length;
      await admin.from("crm_meta_events").update({ status: "sent", sent_at: now.toISOString(), response: res.body, error: null }).in("id", list.map((r) => r.id));
    } else {
      failed += list.length;
      const err = String(res.body?.error?.message ?? `HTTP ${res.status}`).slice(0, 500);
      for (const r of list) {
        const attempts = r.attempts + 1;
        await admin.from("crm_meta_events").update({
          attempts, error: err, response: res.body,
          status: attempts >= MAX_ATTEMPTS || res.status === 400 && /token|permission|dataset|pixel/i.test(err) ? "failed" : "pending",
          next_attempt_at: new Date(now.getTime() + Math.min(60, 2 ** attempts) * 60_000).toISOString(),
        }).eq("id", r.id);
      }
    }
  }
  return { sent, failed };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    const internal = req.headers.get("x-crm-internal");
    if (internal) {
      if (internal !== Deno.env.get("CRM_CRON_SECRET")) throw new HttpError(401, "Não autorizado.");
      if (action !== "flush") throw new HttpError(400, "Ação inválida.");
      return json(await flush(admin));
    }

    const user = await requireUser(req, admin);
    await requireManager(admin, user.id);
    if (action === "flush") return json(await flush(admin));

    const storeId = String(body.store_id || "");
    if (!storeId) throw new HttpError(400, "Selecione uma loja.");
    await requireMember(admin, user.id, storeId);

    if (action === "status") return json({ has_token: Boolean(await loadToken(admin, storeId)) });

    if (action === "save") {
      const datasetId = String(body.dataset_id ?? "").trim();
      if (datasetId && !/^\d{6,20}$/.test(datasetId)) throw new HttpError(400, "O ID do conjunto de dados (pixel) é só números.");
      const number = String(body.whatsapp_number ?? "").replace(/\D/g, "");
      if (number && (number.length < 12 || number.length > 13)) throw new HttpError(400, "WhatsApp da loja: use 55 + DDD + número.");
      const row: Record<string, unknown> = {
        store_id: storeId, dataset_id: datasetId || null, whatsapp_number: number || null,
        test_event_code: String(body.test_event_code ?? "").trim() || null, updated_by: user.id, updated_at: new Date().toISOString(),
      };
      for (const k of ["enabled", "send_lead", "send_qualified", "send_purchase", "only_attributed"]) if (typeof body[k] === "boolean") row[k] = body[k];
      if (typeof body.qualified_event_name === "string" && /^[A-Za-z][A-Za-z0-9_]{1,39}$/.test(body.qualified_event_name)) row.qualified_event_name = body.qualified_event_name;
      if (Array.isArray(body.qualified_stage_codes)) row.qualified_stage_codes = body.qualified_stage_codes.map(String).slice(0, 10);
      const { error } = await admin.from("crm_tracking_settings").upsert(row);
      if (error) throw new HttpError(500, error.message);

      const token = typeof body.access_token === "string" ? body.access_token.trim() : "";
      if (token) {
        const { error: e2 } = await admin.from("crm_channel_secrets").upsert(
          { store_id: storeId, channel: "meta_capi", secrets: { access_token: token }, updated_at: new Date().toISOString() },
          { onConflict: "store_id,channel" },
        );
        if (e2) throw new HttpError(500, e2.message);
      }
      return json({ status: "saved" });
    }

    if (action === "test") {
      const { data: s } = await admin.from("crm_tracking_settings").select("*").eq("store_id", storeId).maybeSingle();
      const token = await loadToken(admin, storeId);
      if (!s?.dataset_id || !token) throw new HttpError(400, "Salve o ID do conjunto de dados e o token antes.");
      if (!s.test_event_code) throw new HttpError(400, "Coloque o código de teste (Gerenciador de Eventos → Testar eventos).");
      const ev = await buildCapiEvent({
        eventName: "Lead", eventId: `test:${crypto.randomUUID()}`, eventTime: new Date(),
        contact: { id: `teste-${storeId}`, phone: s.whatsapp_number, name: "Teste CRM" },
      });
      const res = await sendToMeta(s.dataset_id, token, [ev], s.test_event_code);
      if (!res.ok) throw new HttpError(502, `A Meta recusou: ${res.body?.error?.message ?? res.status}`);
      return json({ status: "sent", events_received: res.body?.events_received ?? null });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    return errorResponse(error);
  }
});
