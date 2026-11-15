/* eslint-disable @typescript-eslint/no-explicit-any -- payloads JSON externos (Evolution/PostgREST) sem tipos */
// O agente aprende com as conversas antigas do WhatsApp.
//  start  (gerência): cria o trabalho e lista as conversas diretas dos últimos N meses
//  step   (interno):  processa conversas por ~90 s e chama a si mesmo para continuar
//  resume (gerência): retoma um trabalho parado
//  cancel (gerência): cancela
// Cada conversa: só texto, dados pessoais mascarados → IA extrai perguntas/respostas e fatos
// → tudo entra na biblioteca como "para revisar". No fim, um rascunho do conhecimento da loja.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient, corsHeaders, errorResponse, HttpError, json, requireManager, requireMember, requireUser } from "../_shared/http.ts";
import { evolution, loadWhatsAppConfig } from "../_shared/evolution.ts";
import { generateJson } from "../_shared/llm.ts";
import { historyTranscript, knowledgeDraftPrompt, LEARN_SCHEMA, learnSystemPrompt, type HistoryLine } from "../_shared/ai-agent-core.ts";
import { parseMessageBody } from "../whatsapp-webhook/parse.ts";

const STEP_BUDGET_MS = 90_000;
const PAUSE_MS = 1500; // respeita o limite de pedidos por minuto da chave
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DIRECT = /@(s\.whatsapp\.net|lid)$/;

function background(p: Promise<unknown>) {
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(p); else p.catch(() => {});
}

/** Chama a si mesma para continuar o trabalho (resposta imediata; o trabalho segue em segundo plano). */
async function kick(jobId: string) {
  const secret = Deno.env.get("CRM_INTERNAL_SECRET");
  if (!secret) throw new Error("CRM_INTERNAL_SECRET não configurado.");
  await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-ai-learn`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-crm-internal": secret },
    body: JSON.stringify({ action: "step", job_id: jobId }),
  }).catch((e) => console.error("[crm-ai-learn] continuar:", (e as Error).message));
}

function lineOf(rec: any): HistoryLine | null {
  const parsed = parseMessageBody(rec);
  if (!parsed) return null;
  let text: string | null = null;
  if (parsed.kind === "text") text = parsed.content;
  else if (parsed.kind === "image" && parsed.content && parsed.content !== "[Imagem]") text = `[foto] ${parsed.content}`;
  if (!text) return null;
  const ts = Number(rec?.messageTimestamp?.low ?? rec?.messageTimestamp ?? 0);
  return { fromMe: Boolean(rec?.key?.fromMe), text, at: ts < 1e11 ? ts * 1000 : ts };
}

async function processJob(admin: any, jobId: string) {
  const t0 = Date.now();
  const { data: job } = await admin.from("crm_ai_learning_jobs").select("*").eq("id", jobId).maybeSingle();
  if (!job || job.status !== "running") return;

  const cfg = await loadWhatsAppConfig(admin, job.store_id);
  if (!cfg) {
    await admin.from("crm_ai_learning_jobs").update({ status: "failed", error: "WhatsApp não configurado.", finished_at: new Date().toISOString() }).eq("id", jobId);
    return;
  }
  const evo = evolution(cfg);
  const { data: store } = await admin.from("stores").select("name").eq("id", job.store_id).maybeSingle();
  const { data: ai } = await admin.from("crm_ai_settings").select("model").eq("store_id", job.store_id).maybeSingle();
  const storeName = store?.name ?? "loja";
  const cutoff = new Date(job.created_at).getTime() - job.months * 30 * 86400_000;
  const chats: string[] = job.chats ?? [];

  let { cursor, processed, skipped, examples, facts } = job;
  while (cursor < chats.length && Date.now() - t0 < STEP_BUDGET_MS) {
    // cancelado no meio?
    if (cursor % 5 === 0) {
      const { data: st } = await admin.from("crm_ai_learning_jobs").select("status").eq("id", jobId).maybeSingle();
      if (st?.status !== "running") return;
    }
    const jid = chats[cursor];
    cursor++;
    try {
      const lines: HistoryLine[] = [];
      const first = await evo.findMessages(jid, 1, 100);
      for (const r of first.records) { const l = lineOf(r); if (l && l.at >= cutoff) lines.push(l); }
      if (first.pages > 1) {
        const second = await evo.findMessages(jid, 2, 100);
        for (const r of second.records) { const l = lineOf(r); if (l && l.at >= cutoff) lines.push(l); }
      }
      const transcript = historyTranscript(lines);
      if (!transcript) { skipped++; continue; }

      let llm;
      try {
        llm = await generateJson({ system: learnSystemPrompt(storeName), turns: [{ role: "user", text: transcript }], schema: LEARN_SCHEMA, model: ai?.model });
      } catch (e) {
        if (/429|quota|exceeded/i.test((e as Error).message)) {
          await sleep(30_000); // cota da chave: espera e tenta de novo uma vez
          llm = await generateJson({ system: learnSystemPrompt(storeName), turns: [{ role: "user", text: transcript }], schema: LEARN_SCHEMA, model: ai?.model });
        } else throw e;
      }
      let out: any = {};
      try { out = JSON.parse(llm.text.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()); } catch { out = {}; }
      if (!out.commercial) { skipped++; processed++; continue; }

      const ref = `wa:${jid.split("@")[0].slice(-4)}`; // só os 4 últimos dígitos: referência sem expor o número
      for (const p of (out.pairs ?? []).slice(0, 4)) {
        if (!p?.question || !p?.answer) continue;
        const { data: id } = await admin.rpc("crm_ai_add_example", {
          p_store_id: job.store_id, p_kind: "qa", p_topic: p.topic ?? null, p_question: String(p.question).slice(0, 500),
          p_answer: String(p.answer).slice(0, 1000), p_source: "history", p_status: "pending", p_ref: ref,
        });
        if (id) examples++;
      }
      for (const f of (out.facts ?? []).slice(0, 8)) {
        if (!f?.fact) continue;
        const { data: id } = await admin.rpc("crm_ai_add_example", {
          p_store_id: job.store_id, p_kind: "fact", p_topic: f.topic ?? null, p_question: null,
          p_answer: String(f.fact).slice(0, 500), p_source: "history", p_status: "pending", p_ref: ref,
        });
        if (id) facts++;
      }
      processed++;
    } catch (e) {
      skipped++;
      console.error("[crm-ai-learn] conversa:", (e as Error).message.slice(0, 300));
    }
    await admin.from("crm_ai_learning_jobs").update({ cursor, processed, skipped, examples, facts, heartbeat_at: new Date().toISOString() }).eq("id", jobId);
    await sleep(PAUSE_MS);
  }

  if (cursor < chats.length) {
    await kick(jobId); // continua em outra execução
    return;
  }

  // Fim: rascunho do conhecimento a partir dos fatos encontrados
  let draft: string | null = null;
  try {
    const { data: fs } = await admin.from("crm_ai_examples").select("topic, answer").eq("store_id", job.store_id)
      .eq("kind", "fact").neq("status", "rejected").order("created_at").limit(400);
    if ((fs ?? []).length) {
      const list = (fs ?? []).map((f: any) => `- ${f.topic ? `[${f.topic}] ` : ""}${f.answer}`).join("\n");
      const llm = await generateJson({
        system: knowledgeDraftPrompt(storeName), turns: [{ role: "user", text: list }],
        schema: { type: "OBJECT", properties: { text: { type: "STRING" } }, required: ["text"] }, model: ai?.model, timeoutMs: 45_000,
      });
      draft = String(JSON.parse(llm.text)?.text ?? "").trim() || null;
    }
  } catch (e) {
    console.error("[crm-ai-learn] rascunho:", (e as Error).message);
  }
  await admin.from("crm_ai_learning_jobs").update({
    status: "done", knowledge_draft: draft, cursor, processed, skipped, examples, facts,
    heartbeat_at: new Date().toISOString(), finished_at: new Date().toISOString(),
  }).eq("id", jobId);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = adminClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    // chamada interna (a própria função continuando o trabalho)
    const internal = req.headers.get("x-crm-internal");
    if (internal) {
      if (internal !== Deno.env.get("CRM_INTERNAL_SECRET")) throw new HttpError(401, "Não autorizado.");
      if (action !== "step") throw new HttpError(400, "Ação inválida.");
      background(processJob(admin, String(body.job_id)).catch((e) => console.error("[crm-ai-learn]", e)));
      return json({ status: "accepted" }, 202);
    }

    const user = await requireUser(req, admin);
    await requireManager(admin, user.id);

    if (action === "start") {
      const storeId = String(body.store_id || "");
      if (!storeId) throw new HttpError(400, "Selecione uma loja.");
      await requireMember(admin, user.id, storeId);
      const months = Math.min(12, Math.max(1, Number(body.months) || 4));

      const { data: running } = await admin.from("crm_ai_learning_jobs").select("id").eq("store_id", storeId).eq("status", "running").limit(1);
      if (running?.length) throw new HttpError(409, "Já existe uma leitura em andamento.");

      const cfg = await loadWhatsAppConfig(admin, storeId);
      if (!cfg) throw new HttpError(400, "WhatsApp não configurado para esta loja.");
      const cutoff = Date.now() - months * 30 * 86400_000;
      const chats = await evolution(cfg).findChats();

      // fora: grupos/transmissões e contatos marcados como "não é cliente"
      const { data: ignored } = await admin.from("crm_contacts").select("phone_key").eq("store_id", storeId).eq("ignored", true).not("phone_key", "is", null);
      const ignoredKeys = new Set((ignored ?? []).map((c: any) => c.phone_key));
      const keyOf = (jid: string) => {
        const d = jid.split("@")[0].replace(/\D/g, "");
        const n = d.startsWith("55") ? d.slice(2) : d;
        return n.length >= 10 ? n.slice(0, 2) + n.slice(-8) : null;
      };
      const list = chats
        .filter((c: any) => DIRECT.test(String(c.remoteJid ?? "")) && c.updatedAt && new Date(c.updatedAt).getTime() >= cutoff)
        .filter((c: any) => !ignoredKeys.has(keyOf(String(c.remoteJid))))
        .sort((a: any, b: any) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .map((c: any) => String(c.remoteJid));
      if (!list.length) throw new HttpError(400, "Nenhuma conversa nesse período.");

      const { data: job, error } = await admin.from("crm_ai_learning_jobs").insert({
        store_id: storeId, months, chats: list, total: list.length, started_by: user.id,
      }).select("id, total").single();
      if (error) throw new HttpError(500, error.message);
      await kick(job.id);
      return json({ job_id: job.id, total: job.total });
    }

    if (action === "resume" || action === "cancel") {
      const { data: job } = await admin.from("crm_ai_learning_jobs").select("id, store_id, status, heartbeat_at").eq("id", String(body.job_id)).maybeSingle();
      if (!job) throw new HttpError(404, "Leitura não encontrada.");
      await requireMember(admin, user.id, job.store_id);
      if (action === "cancel") {
        await admin.from("crm_ai_learning_jobs").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", job.id);
        return json({ status: "cancelled" });
      }
      if (job.status !== "running") throw new HttpError(409, "Esta leitura não está em andamento.");
      if (Date.now() - new Date(job.heartbeat_at).getTime() < 3 * 60_000) throw new HttpError(409, "A leitura está andando; aguarde.");
      await kick(job.id);
      return json({ status: "resumed" });
    }

    throw new HttpError(400, "Ação inválida.");
  } catch (error) {
    return errorResponse(error);
  }
});
