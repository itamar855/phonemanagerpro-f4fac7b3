/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON sem tipos */
// Agente de IA do CRM — ações chamadas pela tela.
//  simulate: testa a IA com uma conversa digitada (gerência). Não grava nem envia nada.
//  suggest:  pede uma sugestão de resposta para uma conversa real (qualquer membro). Sempre rascunho.
//  tag:      a IA etiqueta uma conversa agora (qualquer membro). tag_recent: etiqueta as conversas
//            recentes ainda sem etiqueta da IA (gerência; em lotes, para não estourar o tempo).
// O atendimento automático (mensagem chegando) roda dentro do whatsapp-webhook.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireManager, requireMember, requireUser } from "../_shared/http.ts";
import { decide, runAgent, similarExamples, type AiSettings } from "../_shared/ai-agent.ts";
import type { TranscriptMessage } from "../_shared/ai-agent-core.ts";
import { loadMessageAudio, transcribeMessage } from "../_shared/transcribe.ts";
import { tagConversation } from "../_shared/ai-tagger.ts";

const TAG_BATCH = 24;
const TAG_PARALLEL = 4;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const user = await requireUser(req, admin);
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "simulate") {
      const storeId = String(body.store_id || "");
      if (!storeId) throw new HttpError(400, "Selecione uma loja.");
      await requireMember(admin, user.id, storeId);
      await requireManager(admin, user.id);

      const raw = Array.isArray(body.messages) ? body.messages.slice(-30) : [];
      const messages: TranscriptMessage[] = raw
        .map((m: any) => ({
          direction: m?.from === "loja" ? "out" : "in",
          sender_kind: m?.from === "loja" ? "ai" : "contact",
          kind: "text",
          body: String(m?.text ?? "").slice(0, 2000),
        }))
        .filter((m: TranscriptMessage) => m.body);
      if (!messages.some((m) => m.direction === "in")) throw new HttpError(400, "Escreva pelo menos uma mensagem do cliente.");

      const { data: saved } = await admin.from("crm_ai_settings").select("*").eq("store_id", storeId).maybeSingle();
      const { data: store } = await admin.from("stores").select("name").eq("id", storeId).maybeSingle();
      // permite testar o texto do formulário antes de salvar
      const o = body.overrides ?? {};
      const settings: AiSettings = {
        ...(saved ?? { store_id: storeId, mode: "off", max_replies_per_day: 30, max_turns: 8, enabled_channels: ["whatsapp"] }),
        ...(typeof o.knowledge === "string" ? { knowledge: o.knowledge.slice(0, 20000) } : {}),
        ...(typeof o.persona === "string" ? { persona: o.persona.slice(0, 1000) } : {}),
        ...(typeof o.handoff_message === "string" ? { handoff_message: o.handoff_message.slice(0, 500) } : {}),
        ...(typeof o.model === "string" && o.model.trim() ? { model: o.model.trim().slice(0, 80) } : {}),
        ...(o.business_hours && typeof o.business_hours === "object" ? { business_hours: o.business_hours } : {}),
        ...(Number.isFinite(Number(o.max_turns)) ? { max_turns: Number(o.max_turns) } : {}),
      } as AiSettings;

      const aiReplies = messages.filter((m) => m.direction === "out").length;
      const examples = await similarExamples(admin, storeId, messages);
      const r = await decide({
        settings, storeName: store?.name ?? "loja", contact: { name: typeof body.contact_name === "string" ? body.contact_name : null },
        messages, serviceOrders: [], aiRepliesSoFar: aiReplies, examples,
      });
      return json({
        decision: r.decision, model: r.llm.model, latency_ms: r.llm.latencyMs, open_now: r.openNow, fallback_errors: r.llm.fallbackErrors ?? [],
        examples_used: examples.map((e) => ({ question: e.question, answer: e.answer })),
      });
    }

    // Diagnóstico (gerência): nomes dos modelos que as chaves configuradas aceitam. Nunca devolve chaves.
    if (action === "models") {
      await requireManager(admin, user.id);
      const out: Record<string, unknown> = {};
      const g = Deno.env.get("GEMINI_API_KEY");
      if (g) {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", { headers: { "x-goog-api-key": g } });
        const d = await r.json().catch(() => ({}));
        out.gemini = r.ok
          ? (d.models ?? []).filter((m: any) => (m.supportedGenerationMethods ?? []).includes("generateContent")).map((m: any) => String(m.name).replace("models/", ""))
          : `erro ${r.status}`;
      }
      const q = Deno.env.get("GROQ_API_KEY");
      if (q) {
        const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${q}` } });
        const d = await r.json().catch(() => ({}));
        out.groq = r.ok ? (d.data ?? []).map((m: any) => m.id) : `erro ${r.status}`;
      }
      return json(out);
    }

    // Transcrever um áudio já recebido (botão na conversa)
    if (action === "transcribe") {
      const messageId = String(body.message_id || "");
      const { data: msg } = await admin.from("crm_messages").select("id, store_id, kind, media_path, media_url, media_mime")
        .eq("id", messageId).maybeSingle();
      if (!msg || msg.kind !== "audio") throw new HttpError(404, "Áudio não encontrado.");
      await requireMember(admin, user.id, msg.store_id);
      const { bytes, mime } = await loadMessageAudio(admin, msg);
      const text = await transcribeMessage(admin, msg.id, bytes, mime);
      if (text === null) throw new HttpError(502, "Não foi possível transcrever este áudio.");
      return json({ transcript: text });
    }

    if (action === "suggest") {
      const conversationId = String(body.conversation_id || "");
      const { data: conv } = await admin.from("crm_conversations").select("id, store_id").eq("id", conversationId).maybeSingle();
      if (!conv) throw new HttpError(404, "Conversa não encontrada.");
      await requireMember(admin, user.id, conv.store_id);
      const r = await runAgent(admin, { conversationId, forceDraft: true });
      if (r.status === "error") throw new HttpError(502, `A IA não respondeu: ${r.error}`);
      return json(r);
    }

    if (action === "tag") {
      const conversationId = String(body.conversation_id || "");
      const { data: conv } = await admin.from("crm_conversations").select("id, store_id").eq("id", conversationId).maybeSingle();
      if (!conv) throw new HttpError(404, "Conversa não encontrada.");
      await requireMember(admin, user.id, conv.store_id);
      const r = await tagConversation(admin, { conversationId });
      if (r.status === "error") throw new HttpError(502, `A IA não respondeu: ${r.error}`);
      return json(r);
    }

    if (action === "tag_recent") {
      await requireManager(admin, user.id);
      const days = Math.min(Math.max(Number(body.days) || 30, 1), 90);
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      let q = admin.from("crm_conversations")
        .select("id, contact:crm_contacts!inner(ai_tagged_at, ignored)")
        .is("contact.ai_tagged_at", null).eq("contact.ignored", false)
        .gt("last_inbound_at", since).order("last_inbound_at", { ascending: false }).limit(TAG_BATCH);
      if (body.store_id) q = q.eq("store_id", String(body.store_id));
      const { data: convs, error } = await q;
      if (error) throw new HttpError(500, error.message);
      const ids = (convs ?? []).map((c: any) => c.id as string);
      let tagged = 0, failed = 0;
      for (let i = 0; i < ids.length; i += TAG_PARALLEL) {
        const rs = await Promise.all(ids.slice(i, i + TAG_PARALLEL).map((id) => tagConversation(admin, { conversationId: id })));
        for (const r of rs) {
          if (r.status === "done") tagged++;
          else if (r.status === "error") failed++;
        }
      }
      return json({ processed: ids.length, tagged, failed, more: ids.length === TAG_BATCH });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    return errorResponse(error);
  }
});
