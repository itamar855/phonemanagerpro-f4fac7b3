/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST sem tipos gerados */
// Assistente da equipe no WhatsApp da loja: quem é da equipe e escreve no privado para o número
// da loja cai aqui (não no CRM). Relatório do dia e venda de acessórios no PDV, sempre com confirmação.
import {
  chooseText, EXTRACT_SCHEMA, extractionPrompt, friendlyError, helpText, isCancel, isNo, isYes, parseChoice,
  parseExtraction, paymentQuestion, pickCandidate, reportText, resolvePayments, saleDoneText, saleSummary, saleTotals,
  type Candidate, type DayReport, type Extraction, type Payments, type SaleLine,
} from "./staff-assistant-core.ts";
import { evolution, type EvolutionConfig } from "./evolution.ts";
import { generateJson } from "./llm.ts";

export interface Staff {
  user_id: string;
  name: string | null;
  role: string;
  permissions: Record<string, boolean>;
  store_id: string;
  store_name: string | null;
}

type Pending = { text: string; qty: number; options?: Candidate[]; chosen?: SaleLine };
type State =
  | { step: "choose"; pending: Pending[]; ex: Pick<Extraction, "payments" | "methods" | "splitEqual" | "discount" | "customer"> }
  | { step: "payment"; lines: SaleLine[]; discount: number; customer: string | null }
  | { step: "confirm"; lines: SaleLine[]; discount: number; customer: string | null; payments: Payments; total: number };

const SESSION_TTL_MS = 15 * 60 * 1000;

/** Celular → pessoa da equipe (ou null). Nunca lança: em erro, a mensagem segue para o CRM. */
export async function findStaff(admin: any, phone: string, storeId: string): Promise<Staff | null> {
  try {
    const { data, error } = await admin.rpc("staff_lookup", { p_phone: phone, p_store: storeId });
    if (error) { console.error("[Equipe] lookup:", error.message); return null; }
    return (data as Staff) ?? null;
  } catch (e) {
    console.error("[Equipe] lookup:", (e as Error).message);
    return null;
  }
}

const canSell = (s: Staff) => s.role === "admin" || s.permissions?.vendas === true;

async function extract(text: string): Promise<Extraction> {
  const llm = await generateJson({ system: extractionPrompt(), turns: [{ role: "user", text }], schema: EXTRACT_SCHEMA, timeoutMs: 15_000 });
  return parseExtraction(llm.text);
}

async function findLine(admin: any, storeId: string, text: string) {
  const { data, error } = await admin.rpc("staff_find_accessories", { p_store: storeId, p_text: text, p_limit: 4 });
  if (error) throw new Error(error.message);
  return pickCandidate(((data ?? []) as any[]).map((c) => ({ ...c, sale_price: Number(c.sale_price), quantity: Number(c.quantity), score: Number(c.score) })));
}

// o nome com a marca só aparece no resumo (a venda usa o id): deixa claro qual item foi escolhido
const toLine = (c: Candidate, qty: number): SaleLine => ({
  id: c.id, name: `${c.name.trim()}${c.brand?.trim() ? ` (${c.brand.trim()})` : ""}`, qty, price: Number(c.sale_price),
});

export async function handleStaffMessage(admin: any, cfg: EvolutionConfig, staff: Staff, msg: { text: string; messageId: string | null; jid: string; hasImage?: boolean }) {
  const send = (t: string) => evolution(cfg).sendText(msg.jid, t).catch((e) => console.error("[Equipe] envio:", (e as Error).message));

  const { data: sess } = await admin.from("staff_assistant_sessions").select("state, last_message_id, updated_at").eq("user_id", staff.user_id).maybeSingle();
  if (msg.messageId && sess?.last_message_id === msg.messageId) return "duplicate";
  const fresh = sess && Date.now() - new Date(sess.updated_at).getTime() < SESSION_TTL_MS;
  let state: State | null = fresh && sess?.state?.step ? (sess.state as State) : null;

  const save = async (next: State | null) => {
    state = next;
    await admin.from("staff_assistant_sessions").upsert({
      user_id: staff.user_id, store_id: staff.store_id, state: next ?? {}, last_message_id: msg.messageId, updated_at: new Date().toISOString(),
    });
  };

  const text = (msg.text || "").trim();
  if (!text) {
    await save(state);
    await send(msg.hasImage
      ? "Recebi a imagem, mas o comprovante é anexado pelo *Caixa* do sistema (no lançamento pendente). Aqui eu lanço vendas e mando o relatório."
      : helpText(staff.name));
    return "empty";
  }

  if (state && isCancel(text)) { await save(null); await send("Ok, cancelado. Nada foi lançado."); return "cancel"; }

  // ---- continuação de uma venda ----
  if (state?.step === "choose") {
    const cur = state.pending.find((p) => !p.chosen && p.options)!;
    const k = cur ? parseChoice(text, cur.options!.length) : null;
    if (cur && k !== null) {
      cur.chosen = toLine(cur.options![k], cur.qty);
      return await afterChoice(state);
    }
    if (cur && /^\d{1,2}$/.test(text)) { await save(state); await send(`Responda com um número de 1 a ${cur.options!.length}, ou *cancelar*.`); return "choose"; }
    state = null; // mensagem nova: abandona a venda pela metade
  } else if (state?.step === "payment") {
    try {
      const ex = await extract(`Forma de pagamento: ${text}`);
      return await goPayment(state.lines, state.discount, state.customer, ex);
    } catch (e) {
      console.error("[Equipe] pagamento:", (e as Error).message);
      await save(state); await send("Não entendi a forma de pagamento. Ex.: *pix*, *dinheiro*, *cartão* ou *30 dinheiro e 50 pix*."); return "payment";
    }
  } else if (state?.step === "confirm") {
    if (isYes(text)) return await register(state);
    if (isNo(text)) { await save(null); await send("Ok, não lancei. Se quiser, mande a venda de novo corrigida."); return "cancel"; }
    state = null;
  }

  // ---- mensagem nova ----
  let ex: Extraction;
  try { ex = await extract(text); } catch (e) {
    console.error("[Equipe] IA:", (e as Error).message);
    await save(null); await send("Não consegui entender agora (IA indisponível). Tente de novo em instantes."); return "llm_error";
  }

  if (ex.intent === "relatorio") {
    if (!canSell(staff)) { await save(null); await send("Seu usuário não tem acesso a Vendas. Peça ao administrador para liberar em Equipe."); return "denied"; }
    const { data, error } = await admin.rpc("staff_day_report", { p_store: staff.store_id, p_user: staff.user_id, p_all: staff.role === "admin" });
    await save(null);
    if (error) { console.error("[Equipe] relatório:", error.message); await send("Não consegui gerar o relatório agora. Tente de novo."); return "error"; }
    await send(reportText(data as DayReport, (staff.name ?? "").split(" ")[0] || "você", staff.store_name ?? "loja"));
    return "report";
  }

  if (ex.intent === "venda" && ex.items.length) {
    if (!canSell(staff)) { await save(null); await send("Seu usuário não tem acesso a Vendas. Peça ao administrador para liberar em Equipe."); return "denied"; }
    const pending: Pending[] = [];
    for (const it of ex.items) {
      const r = await findLine(admin, staff.store_id, it.text);
      if (r.kind === "none") {
        await save(null);
        await send(`Não achei *${it.text}* com estoque na ${staff.store_name ?? "loja"}. Confira o nome e mande a venda de novo.`);
        return "not_found";
      }
      pending.push(r.kind === "auto" ? { text: it.text, qty: it.qty, chosen: toLine(r.item, it.qty) } : { text: it.text, qty: it.qty, options: r.options });
    }
    return await afterChoice({ step: "choose", pending, ex: { payments: ex.payments, methods: ex.methods, splitEqual: ex.splitEqual, discount: ex.discount, customer: ex.customer } });
  }

  await save(null);
  await send(helpText(staff.name));
  return "help";

  // ---- etapas ----
  async function afterChoice(s: Extract<State, { step: "choose" }>) {
    const next = s.pending.find((p) => !p.chosen);
    if (next) { await save(s); await send(chooseText(next.text, next.qty, next.options!)); return "choose"; }
    const lines = s.pending.map((p) => p.chosen!);
    return await goPayment(lines, s.ex.discount, s.ex.customer, s.ex);
  }

  async function goPayment(lines: SaleLine[], discount: number, customer: string | null, ex: Pick<Extraction, "payments" | "methods" | "splitEqual">) {
    const t = saleTotals(lines, discount);
    const r = resolvePayments(t.total, ex);
    if (!r.ok) {
      await save({ step: "payment", lines, discount: t.discount, customer });
      await send(paymentQuestion(t.total, r.reason === "mismatch" ? r.sum : undefined));
      return "payment";
    }
    const conf: State = { step: "confirm", lines, discount: t.discount, customer, payments: r.payments, total: t.total };
    await save(conf);
    await send(saleSummary(lines, t, r.payments, customer));
    return "confirm";
  }

  async function register(s: Extract<State, { step: "confirm" }>) {
    // limpa antes: uma confirmação repetida não lança duas vezes
    await save(null);
    const { data, error } = await admin.rpc("pdv_register_sale", {
      p_store: staff.store_id, p_user: staff.user_id,
      p_items: s.lines.map((l) => ({ id: l.id, qty: l.qty })),
      p_payments: { dinheiro: s.payments.dinheiro, cartao: s.payments.cartao, pix: s.payments.pix },
      p_discount: s.discount, p_customer: s.customer, p_source_message: msg.messageId,
    });
    if (error) { console.error("[Equipe] venda:", error.message); await send(friendlyError(error.message)); return "sale_error"; }
    await send(saleDoneText({ total: Number(data?.total ?? s.total), pending: data?.pending ?? [] }));
    return "sale";
  }
}
