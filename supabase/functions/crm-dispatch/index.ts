// Distribuição de atendimento: envia os avisos no WhatsApp da equipe.
//  notify (cron a cada minuto com a senha interna CRM_CRON_SECRET, ou gerência pela tela)
// As regras (quem recebe, os 5 minutos, o dono) ficam no banco: crm_dispatch_tick.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireManager, requireUser } from "../_shared/http.ts";
import { sendDispatchNotices } from "../_shared/dispatch.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    if (String(body.action || "") !== "notify") throw new HttpError(400, "Ação inválida.");

    const internal = req.headers.get("x-crm-internal");
    if (internal) {
      if (internal !== Deno.env.get("CRM_CRON_SECRET")) throw new HttpError(401, "Não autorizado.");
    } else {
      const user = await requireUser(req, admin);
      await requireManager(admin, user.id);
    }
    return json(await sendDispatchNotices(admin));
  } catch (e) {
    return errorResponse(e);
  }
});
