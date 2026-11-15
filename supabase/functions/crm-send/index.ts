// Envio de mensagens do CRM (WhatsApp via Evolution; Instagram via Meta Graph).
// O navegador só informa a conversa e o conteúdo; credenciais ficam no servidor.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireMember, requireUser } from "../_shared/http.ts";
import { evolution, loadWhatsAppConfig, whatsappNumber } from "../_shared/evolution.ts";

const MAX_TEXT = 4096;
const IG_WINDOW_MS = 24 * 60 * 60 * 1000;
const MEDIA_BUCKET = "crm_media";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);
    const body = await req.json().catch(() => ({}));

    const conversationId = String(body.conversation_id || "");
    const kind = String(body.kind || "text") as "text" | "image" | "audio" | "document";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    const mediaPath = typeof body.media_path === "string" ? body.media_path : null;
    if (!conversationId) throw new HttpError(400, "conversation_id é obrigatório.");
    if (!["text", "image", "audio", "document"].includes(kind)) throw new HttpError(400, "Tipo de mensagem inválido.");
    if (kind === "text" && !text) throw new HttpError(400, "Mensagem vazia.");
    if (kind !== "text" && !mediaPath) throw new HttpError(400, "Arquivo não informado.");
    if (text.length > MAX_TEXT) throw new HttpError(400, `Mensagem com mais de ${MAX_TEXT} caracteres.`);

    const { data: conv } = await admin
      .from("crm_conversations")
      .select("id, store_id, channel, external_thread_id, last_inbound_at, contact:crm_contacts(id, phone, instagram_user_id, ignored)")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) throw new HttpError(404, "Conversa não encontrada.");
    await requireMember(admin, user.id, conv.store_id);
    const contact: any = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;

    if (mediaPath && !mediaPath.startsWith(`${conv.store_id}/`)) throw new HttpError(403, "Arquivo de outra loja.");

    let externalId: string | null = null;

    if (conv.channel === "whatsapp") {
      const cfg = await loadWhatsAppConfig(admin, conv.store_id);
      if (!cfg || !cfg.is_active) throw new HttpError(400, "WhatsApp não conectado para esta loja.");
      const evo = evolution(cfg);
      const number = whatsappNumber(contact?.phone ?? null, conv.external_thread_id);
      if (kind === "text") {
        externalId = (await evo.sendText(number, text)).externalId;
      } else {
        const { data: signed, error } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(mediaPath!, 600);
        if (error || !signed?.signedUrl) throw new HttpError(400, "Arquivo não encontrado.");
        const fileName = mediaPath!.split("/").pop();
        externalId = (await evo.sendMedia(number, kind, signed.signedUrl, text || undefined, fileName, body.mime)).externalId;
      }
    } else {
      // Instagram: a Meta só permite responder até 24 h depois da última mensagem do cliente
      const lastIn = conv.last_inbound_at ? new Date(conv.last_inbound_at).getTime() : 0;
      if (Date.now() - lastIn > IG_WINDOW_MS) {
        throw new HttpError(409, "A janela de 24 h do Instagram fechou. Aguarde o cliente escrever de novo.");
      }
      if (kind !== "text") throw new HttpError(400, "Envio de arquivos pelo Instagram ainda não está disponível.");
      const { data: ig } = await admin.from("instagram_config").select("*")
        .eq("store_id", conv.store_id).eq("is_active", true).limit(1).maybeSingle();
      if (!ig?.page_access_token || !ig?.instagram_business_account_id) throw new HttpError(400, "Instagram não conectado para esta loja.");
      const res = await fetch(`https://graph.facebook.com/v21.0/${ig.instagram_business_account_id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${ig.page_access_token}` },
        body: JSON.stringify({ recipient: { id: contact?.instagram_user_id }, message: { text } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new HttpError(502, `Instagram: ${data?.error?.message || res.status}`);
      externalId = data?.message_id ?? null;
    }

    const { data: saved, error: saveError } = await admin.rpc("crm_ingest_message", {
      p_store_id: conv.store_id,
      p_channel: conv.channel,
      p_direction: "out",
      p_sender_kind: "user",
      p_sender_user_id: user.id,
      p_kind: kind,
      p_body: text || null,
      p_phone: conv.channel === "whatsapp" ? contact?.phone : null,
      p_instagram_user_id: conv.channel === "instagram" ? contact?.instagram_user_id : null,
      p_media_path: mediaPath,
      p_media_mime: body.mime ?? null,
      p_external_id: externalId,
      p_status: "sent",
      p_create_contact: false,
    });
    if (saveError) {
      // A mensagem saiu; só o registro falhou. O webhook (eco) ainda pode gravá-la.
      console.error("[crm-send] gravação:", saveError.message);
      return json({ sent: true, saved: false, external_id: externalId, warning: "Mensagem enviada, mas não registrada." });
    }
    return json({ sent: true, saved: true, external_id: externalId, message_id: saved?.message_id ?? null });
  } catch (error) {
    return errorResponse(error);
  }
});
