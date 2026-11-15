/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Evolution/Meta/PostgREST) sem tipos */
// Envio de mensagens do CRM (WhatsApp via Evolution; Instagram via Meta Graph).
// O navegador só informa a conversa e o conteúdo; credenciais ficam no servidor.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireMember, requireUser } from "../_shared/http.ts";
import { evolution, loadWhatsAppConfig, whatsappNumber } from "../_shared/evolution.ts";
import { igSendImage, igSendText, loadInstagramAccount } from "../_shared/instagram.ts";

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

    let suggestion: { id: string; body: string } | null = null;
    if (body.ai_suggestion_id) {
      const { data: sg } = await admin.from("crm_ai_suggestions").select("id, status, conversation_id, body")
        .eq("id", String(body.ai_suggestion_id)).maybeSingle();
      if (!sg || sg.conversation_id !== conv.id) throw new HttpError(404, "Sugestão não encontrada.");
      if (sg.status !== "pending") throw new HttpError(409, "Esta sugestão já foi usada ou descartada.");
      if (kind !== "text") throw new HttpError(400, "Sugestão da IA é só texto.");
      suggestion = { id: sg.id, body: sg.body };
    }

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
      if (kind !== "text" && kind !== "image") throw new HttpError(400, "Pelo Instagram dá para enviar texto e imagem.");
      const acct = await loadInstagramAccount(admin, { storeId: conv.store_id });
      if (!acct) throw new HttpError(400, "Instagram não conectado para esta loja.");
      const recipient = contact?.instagram_user_id ?? conv.external_thread_id;
      if (!recipient) throw new HttpError(400, "Contato sem identificador do Instagram.");
      if (kind === "image") {
        const { data: signed, error } = await admin.storage.from(MEDIA_BUCKET).createSignedUrl(mediaPath!, 600);
        if (error || !signed?.signedUrl) throw new HttpError(400, "Arquivo não encontrado.");
        externalId = await igSendImage(acct.access_token, recipient, signed.signedUrl);
        if (text) await igSendText(acct.access_token, recipient, text); // legenda vai como mensagem separada
      } else {
        externalId = await igSendText(acct.access_token, recipient, text);
      }
    }

    // Sugestão da IA aprovada por uma pessoa: registra como IA (a conversa continua com ela)
    if (suggestion) {
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
      const edited = norm(text) !== norm(suggestion.body);
      await admin.from("crm_ai_suggestions").update({
        status: "sent", decided_by: user.id, decided_at: new Date().toISOString(), final_body: text, edited,
      }).eq("id", suggestion.id);
      // A equipe corrigiu a IA: a versão corrigida vira exemplo aprovado na biblioteca
      if (edited) {
        try {
          const { data: lastIn } = await admin.from("crm_messages").select("kind, body, transcript")
            .eq("conversation_id", conv.id).eq("direction", "in").order("created_at", { ascending: false }).limit(3);
          const question = (lastIn ?? []).reverse()
            .map((m: any) => (m.kind === "audio" ? m.transcript : m.body) ?? "").filter((t: string) => t && !/^\[.*\]$/.test(t)).join(" ").slice(0, 500);
          if (question) {
            await admin.rpc("crm_ai_add_example", {
              p_store_id: conv.store_id, p_kind: "qa", p_topic: null, p_question: question, p_answer: text,
              p_source: "correction", p_status: "approved", p_ref: conv.id,
            });
          }
        } catch (e) {
          console.error("[crm-send] aprendizado:", (e as Error).message);
        }
      }
    }

    const { data: saved, error: saveError } = await admin.rpc("crm_ingest_message", {
      p_store_id: conv.store_id,
      p_channel: conv.channel,
      p_direction: "out",
      p_sender_kind: suggestion ? "ai" : "user",
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
