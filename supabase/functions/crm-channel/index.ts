// Gestão do canal WhatsApp do CRM: status, QR Code, desconectar, webhook e configuração.
// A chave da Evolution é gravada aqui e nunca devolvida ao navegador.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  adminClient, corsHeaders, errorResponse, HttpError, isManager, json, requireManager, requireMember, requireUser,
} from "../_shared/http.ts";
import { evolution, loadWhatsAppConfig } from "../_shared/evolution.ts";

const ACTIONS = ["status", "connect", "logout", "configure-webhook", "save-config"] as const;
type Action = typeof ACTIONS[number];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "status") as Action;
    if (!ACTIONS.includes(action)) throw new HttpError(400, "Ação inválida.");

    // Loja: a informada; na visão "todas as lojas", a dona do número ativo
    let storeId: string | null = body.storeId && body.storeId !== "all" ? String(body.storeId) : null;
    if (!storeId) {
      const active = await loadWhatsAppConfig(admin, null);
      storeId = active?.store_id ?? null;
    }
    if (!storeId) throw new HttpError(400, "Selecione uma loja.");
    await requireMember(admin, user.id, storeId);

    if (action === "save-config") {
      await requireManager(admin, user.id);
      const apiUrl = String(body.api_url || "").trim().replace(/\/+$/, "");
      const instanceName = String(body.instance_name || "").trim();
      const apiKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
      if (!/^https:\/\/[^\s/]+/i.test(apiUrl)) throw new HttpError(400, "Informe a URL da API com https://.");
      if (!instanceName) throw new HttpError(400, "Informe o nome da instância.");

      const { data: existing } = await admin.from("whatsapp_config").select("id, api_key").eq("store_id", storeId).limit(1).maybeSingle();
      if (!existing && !apiKey) throw new HttpError(400, "Informe a API Key.");
      const row: Record<string, unknown> = {
        store_id: storeId, api_url: apiUrl, instance_name: instanceName,
        is_active: body.is_active !== false, updated_at: new Date().toISOString(),
      };
      if (apiKey) row.api_key = apiKey;
      const { error } = existing
        ? await admin.from("whatsapp_config").update(row).eq("id", existing.id)
        : await admin.from("whatsapp_config").insert(row);
      if (error) throw new HttpError(500, error.message);
      return json({ status: "saved" });
    }

    const cfg = await loadWhatsAppConfig(admin, storeId, { fallback: false }) ?? await loadWhatsAppConfig(admin, null);
    if (!cfg) return json({ configured: false, can_manage: await isManager(admin, user.id) });

    if (action === "status") {
      let state = "unknown";
      let reachable = true;
      try {
        state = await evolution(cfg).connectionState();
      } catch (e) {
        reachable = false;
        state = "unreachable";
        console.error("[crm-channel] status:", (e as Error).message);
      }
      let host = "";
      try { host = new URL(cfg.api_url).host; } catch { /* url inválida */ }
      return json({
        configured: true,
        store_id: cfg.store_id,
        shared_from_other_store: cfg.store_id !== storeId,
        instance_name: cfg.instance_name,
        api_host: host,
        is_active: cfg.is_active,
        has_api_key: Boolean(cfg.api_key),
        state,             // open | connecting | close | not_found | unreachable | unknown
        reachable,
        can_manage: await isManager(admin, user.id),
      });
    }

    await requireManager(admin, user.id);
    const evo = evolution(cfg);

    if (action === "connect") return json(await evo.connect());
    if (action === "logout") { await evo.logout(); return json({ status: "logged_out" }); }

    // configure-webhook
    const secret = Deno.env.get("EVOLUTION_WEBHOOK_SECRET");
    if (!secret) throw new HttpError(500, "EVOLUTION_WEBHOOK_SECRET não configurado no servidor.");
    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;
    await evo.setWebhook(url, secret);
    return json({ status: "configured", url });
  } catch (error) {
    return errorResponse(error);
  }
});
