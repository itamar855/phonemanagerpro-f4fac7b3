/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON sem tipos */
// Avisos no celular (Web Push) do CRM — ações chamadas pela tela (sempre com login).
//  public_key: chave pública VAPID (o navegador precisa dela para se inscrever).
//  subscribe / unsubscribe: liga/desliga o aviso NESTE aparelho.
//  test: manda um aviso de teste para os aparelhos da própria pessoa.
// O aviso de mensagem nova sai dos webhooks (whatsapp-webhook / instagram-webhook).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireUser } from "../_shared/http.ts";
import { sendPush, vapidPublicKey } from "../_shared/push.ts";

const MAX_LEN = 1024;
const str = (v: unknown) => (typeof v === "string" && v.length > 0 && v.length <= MAX_LEN ? v : null);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "public_key") {
      const key = vapidPublicKey();
      if (!key) throw new HttpError(503, "Avisos no celular ainda não configurados no servidor.");
      return json({ public_key: key });
    }

    if (action === "subscribe") {
      const sub = body.subscription ?? {};
      const endpoint = str(sub.endpoint);
      const p256dh = str(sub.keys?.p256dh);
      const auth = str(sub.keys?.auth);
      if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint)) throw new HttpError(400, "Inscrição inválida.");
      // o mesmo aparelho com outra pessoa logada passa a ser dela
      const { error } = await admin.from("crm_push_subscriptions").upsert({
        user_id: user.id, endpoint, p256dh, auth, user_agent: String(req.headers.get("user-agent") ?? "").slice(0, 300),
      }, { onConflict: "endpoint" });
      if (error) throw new HttpError(500, error.message);
      return json({ ok: true });
    }

    if (action === "unsubscribe") {
      const endpoint = str(body.endpoint);
      if (!endpoint) throw new HttpError(400, "Aparelho não informado.");
      await admin.from("crm_push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", user.id);
      return json({ ok: true });
    }

    if (action === "test") {
      let q = admin.from("crm_push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", user.id);
      if (str(body.endpoint)) q = q.eq("endpoint", body.endpoint);
      const { data: subs } = await q;
      if (!subs?.length) throw new HttpError(404, "Nenhum aparelho com aviso ligado.");
      const r = await sendPush(admin, subs.map((s: any) => ({ subscription_id: s.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })), {
        title: "Avisos do CRM ligados ✅", body: "Você vai ser avisado quando chegar mensagem nova.", url: "/crm/inbox", tag: "crm-test",
      });
      if (!r.sent) throw new HttpError(502, r.gone ? "O aparelho cancelou a inscrição. Ative o aviso de novo." : "O serviço de avisos recusou o envio.");
      return json(r);
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    return errorResponse(error);
  }
});
