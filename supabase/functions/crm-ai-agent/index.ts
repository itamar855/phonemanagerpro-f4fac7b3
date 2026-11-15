/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON sem tipos */
// Agente de IA do CRM — ações chamadas pela tela.
//  simulate: testa a IA com uma conversa digitada (gerência). Não grava nem envia nada.
//  suggest:  pede uma sugestão de resposta para uma conversa real (qualquer membro). Sempre rascunho.
// O atendimento automático (mensagem chegando) roda dentro do whatsapp-webhook.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireManager, requireMember, requireUser } from "../_shared/http.ts";
import { decide, runAgent, type AiSettings } from "../_shared/ai-agent.ts";
import type { TranscriptMessage } from "../_shared/ai-agent-core.ts";

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
      const r = await decide({
        settings, storeName: store?.name ?? "loja", contact: { name: typeof body.contact_name === "string" ? body.contact_name : null },
        messages, serviceOrders: [], aiRepliesSoFar: aiReplies,
      });
      return json({ decision: r.decision, model: r.llm.model, latency_ms: r.llm.latencyMs, open_now: r.openNow, fallback_errors: r.llm.fallbackErrors ?? [] });
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

    if (action === "suggest") {
      const conversationId = String(body.conversation_id || "");
      const { data: conv } = await admin.from("crm_conversations").select("id, store_id").eq("id", conversationId).maybeSingle();
      if (!conv) throw new HttpError(404, "Conversa não encontrada.");
      await requireMember(admin, user.id, conv.store_id);
      const r = await runAgent(admin, { conversationId, forceDraft: true });
      if (r.status === "error") throw new HttpError(502, `A IA não respondeu: ${r.error}`);
      return json(r);
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    return errorResponse(error);
  }
});
