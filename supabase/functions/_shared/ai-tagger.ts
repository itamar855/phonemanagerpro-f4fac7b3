/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST sem tipos gerados */
// IA que etiqueta o lead (tipo + etiquetas prontas da loja). Só lê e grava etiquetas: nunca responde o cliente.
// Roda em toda mensagem recebida, com ou sem o atendimento por IA ligado.
import { toTurns, type TranscriptMessage } from "./ai-agent-core.ts";
import { mergeTags, parseTagging, sameTags, TAGGING_SCHEMA, taggingSystemPrompt } from "./ai-tagger-core.ts";
import { generateJson } from "./llm.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type TagResult =
  | { status: "skipped"; reason: string }
  | { status: "done"; lead_kind: string | null; tags: string[]; changed: boolean }
  | { status: "error"; error: string };

/** Nunca lança. debounceMs junta mensagens picadas: se chegar outra, esta execução desiste. */
export async function tagConversation(admin: any, opts: { conversationId: string; triggerMessageId?: string | null; debounceMs?: number }): Promise<TagResult> {
  try {
    if (opts.debounceMs) await sleep(opts.debounceMs);
    const { data: conv } = await admin.from("crm_conversations")
      .select("id, store_id, contact:crm_contacts(id, ignored, tags, lead_kind)")
      .eq("id", opts.conversationId).maybeSingle();
    if (!conv) return { status: "skipped", reason: "conversa não encontrada" };
    const contact: any = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;
    if (!contact || contact.ignored) return { status: "skipped", reason: "não é cliente" };

    if (opts.triggerMessageId) {
      const { data: last } = await admin.from("crm_messages").select("id").eq("conversation_id", conv.id).eq("direction", "in")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last && last.id !== opts.triggerMessageId) return { status: "skipped", reason: "chegou mensagem mais nova" };
    }

    const [{ data: tagRows }, { data: msgs }, { data: store }, { data: settings }] = await Promise.all([
      admin.from("crm_tags").select("name").eq("store_id", conv.store_id).order("created_at"),
      admin.from("crm_messages").select("direction, sender_kind, kind, body, created_at, transcript")
        .eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(20),
      admin.from("stores").select("name").eq("id", conv.store_id).maybeSingle(),
      admin.from("crm_ai_settings").select("model").eq("store_id", conv.store_id).maybeSingle(),
    ]);
    const available = (tagRows ?? []).map((t: any) => String(t.name));
    if (!available.length) return { status: "skipped", reason: "loja sem etiquetas" };
    const turns = toTurns(((msgs ?? []) as TranscriptMessage[]).reverse(), 20);
    if (!turns.length) {
      // marca como vista: o lote "etiquetar recentes" não volta nela
      await admin.from("crm_contacts").update({ ai_tagged_at: new Date().toISOString() }).eq("id", contact.id);
      return { status: "skipped", reason: "sem mensagens do cliente" };
    }

    const currentTags: string[] = Array.isArray(contact.tags) ? contact.tags : [];
    const llm = await generateJson({
      system: taggingSystemPrompt(store?.name ?? "loja", available, { lead_kind: contact.lead_kind ?? null, tags: currentTags }),
      turns, schema: TAGGING_SCHEMA, model: settings?.model ?? null, timeoutMs: 15_000,
    });
    const d = parseTagging(llm.text, available);
    // fornecedor: só o tipo; nada de temperatura/interesse
    const tags = d.lead_kind === "fornecedor" || contact.lead_kind === "fornecedor" ? currentTags : mergeTags(currentTags, d.tags);
    const leadKind = contact.lead_kind ?? d.lead_kind; // tipo marcado pela equipe ou pelo funil não é desfeito
    const changed = !sameTags(tags, currentTags) || leadKind !== (contact.lead_kind ?? null);
    const patch: Record<string, unknown> = { ai_tagged_at: new Date().toISOString() };
    if (changed) { patch.tags = tags; patch.lead_kind = leadKind; }
    const { error } = await admin.from("crm_contacts").update(patch).eq("id", contact.id);
    if (error) throw new Error(error.message);
    return { status: "done", lead_kind: leadKind, tags, changed };
  } catch (e) {
    console.error("[ai-tagger]", (e as Error).message);
    return { status: "error", error: (e as Error).message };
  }
}
