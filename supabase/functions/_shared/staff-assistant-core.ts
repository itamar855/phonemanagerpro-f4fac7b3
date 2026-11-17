/* eslint-disable @typescript-eslint/no-explicit-any -- saída JSON do modelo de IA sem tipos */
// Assistente da equipe (WhatsApp da loja): regras puras, sem Deno — testadas pelo Vitest.
// Vendedor pede o relatório do dia ou lança venda de acessórios (PDV) por texto/áudio.

export type Intent = "relatorio" | "venda" | "ajuda" | "outro";
export type Method = "dinheiro" | "pix" | "cartao";
export const METHODS: Method[] = ["dinheiro", "pix", "cartao"];

export interface Extraction {
  intent: Intent;
  items: { text: string; qty: number }[];
  payments: Record<Method, number | null>;
  methods: Method[];
  /** "metade pix metade dinheiro" / "dividido igual" */
  splitEqual?: boolean;
  discount: number;
  customer: string | null;
}

export interface Candidate {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  sale_price: number;
  quantity: number;
  score: number;
}

export interface SaleLine { id: string; name: string; qty: number; price: number }
export type Payments = Record<Method, number>;

export const EXTRACT_SCHEMA = {
  type: "OBJECT",
  properties: {
    intent: { type: "STRING", enum: ["relatorio", "venda", "ajuda", "outro"] },
    items: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { text: { type: "STRING" }, qty: { type: "INTEGER" } }, required: ["text", "qty"] },
    },
    pay_dinheiro: { type: "NUMBER", nullable: true },
    pay_pix: { type: "NUMBER", nullable: true },
    pay_cartao: { type: "NUMBER", nullable: true },
    methods: { type: "ARRAY", items: { type: "STRING", enum: ["dinheiro", "pix", "cartao"] } },
    split_equal: { type: "BOOLEAN" },
    discount: { type: "NUMBER", nullable: true },
    customer: { type: "STRING", nullable: true },
  },
  required: ["intent", "items", "methods"],
};

export function extractionPrompt(): string {
  return [
    "Você interpreta mensagens de WhatsApp de funcionários de uma loja de celulares para o sistema interno.",
    "Classifique a intenção:",
    '- "relatorio": pede relatório, resumo, fechamento, quanto vendeu hoje, como está o caixa.',
    '- "venda": quer lançar/registrar uma venda de acessórios (película, capinha, cabo, carregador, fone etc.).',
    '- "ajuda": pergunta o que o assistente faz ou como usar.',
    '- "outro": qualquer outra coisa (ex.: "ok", "bom dia", resposta a aviso de atendimento).',
    "Para venda, liste cada produto em items: text = descrição do produto como o funcionário escreveu (sem a quantidade e sem forma de pagamento), qty = quantidade (1 se não disser).",
    "Pagamento: methods = formas citadas (dinheiro, pix, cartao — débito/crédito/cartão = cartao; espécie/em mãos = dinheiro).",
    "pay_dinheiro / pay_pix / pay_cartao = valor citado para cada forma, ou null se a forma foi citada sem valor.",
    "split_equal = true só se disser que divide em partes iguais (ex.: 'metade pix metade dinheiro', 'dividido igual').",
    "discount = desconto em reais se o funcionário disser (ex.: 'com 5 de desconto'), senão null. Nunca invente desconto.",
    "customer = nome do cliente se for citado, senão null.",
    "Se a mensagem só informa forma de pagamento (ex.: 'pix', 'metade pix metade dinheiro'), use intent venda com items vazio e preencha o pagamento.",
    "Nunca invente produtos, valores ou preços.",
  ].join("\n");
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
};

export function parseExtraction(raw: string | unknown): Extraction {
  let o: any = raw;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { o = {}; }
  }
  o = o && typeof o === "object" ? o : {};
  const intent: Intent = ["relatorio", "venda", "ajuda", "outro"].includes(o.intent) ? o.intent : "outro";
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((i: any) => ({ text: String(i?.text ?? "").trim(), qty: Math.max(1, Math.min(99, Math.round(Number(i?.qty) || 1))) }))
    .filter((i: { text: string }) => i.text.length >= 2)
    .slice(0, 10);
  const payments: Record<Method, number | null> = { dinheiro: num(o.pay_dinheiro), pix: num(o.pay_pix), cartao: num(o.pay_cartao) };
  const methods = new Set<Method>((Array.isArray(o.methods) ? o.methods : []).filter((m: string) => METHODS.includes(m as Method)));
  for (const m of METHODS) if (payments[m] !== null && payments[m]! > 0) methods.add(m);
  const discount = num(o.discount) ?? 0;
  const customer = typeof o.customer === "string" && o.customer.trim() && !/^(null|n\/a|-)$/i.test(o.customer.trim()) ? o.customer.trim().slice(0, 60) : null;
  return { intent, items, payments, methods: METHODS.filter((m) => methods.has(m)), splitEqual: o.split_equal === true, discount, customer };
}

/** Escolhe sozinho só quando há um resultado claramente melhor; senão pergunta. */
export function pickCandidate(cands: Candidate[]): { kind: "auto"; item: Candidate } | { kind: "ask"; options: Candidate[] } | { kind: "none" } {
  const list = cands.filter((c) => c.score >= 0.25 && c.quantity > 0 && c.sale_price > 0);
  if (!list.length) return { kind: "none" };
  const [top, second] = list;
  if (top.score >= 0.55 && (!second || top.score - second.score >= 0.1)) return { kind: "auto", item: top };
  return { kind: "ask", options: list.slice(0, 4) };
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function saleTotals(lines: SaleLine[], discount: number) {
  const subtotal = round2(lines.reduce((s, l) => s + l.qty * l.price, 0));
  const d = Math.min(Math.max(discount || 0, 0), subtotal);
  return { subtotal, discount: round2(d), total: round2(subtotal - d) };
}

/** Fecha o pagamento com o total. Uma forma sem valor = total; duas formas com uma sem valor = o restante. */
export function resolvePayments(total: number, p: Pick<Extraction, "payments" | "methods" | "splitEqual">):
  { ok: true; payments: Payments } | { ok: false; reason: "missing" | "mismatch"; sum: number } {
  const methods = p.methods;
  if (!methods.length) return { ok: false, reason: "missing", sum: 0 };
  const out: Payments = { dinheiro: 0, pix: 0, cartao: 0 };
  const unknown = methods.filter((m) => p.payments[m] === null);
  // partes iguais: centavo que sobra vai para a 1ª forma
  if (p.splitEqual && methods.length > 1 && unknown.length === methods.length) {
    const part = Math.floor((total / methods.length) * 100) / 100;
    methods.forEach((m) => { out[m] = part; });
    out[methods[0]] = round2(total - part * (methods.length - 1));
    return { ok: true, payments: out };
  }
  let known = 0;
  for (const m of methods) if (p.payments[m] !== null) { out[m] = p.payments[m]!; known += p.payments[m]!; }
  known = round2(known);
  if (unknown.length === 1) {
    const rest = round2(total - known);
    if (rest <= 0) return { ok: false, reason: "mismatch", sum: known };
    out[unknown[0]] = rest;
  } else if (unknown.length > 1) {
    return { ok: false, reason: "missing", sum: known };
  }
  const sum = round2(out.dinheiro + out.pix + out.cartao);
  if (Math.abs(sum - total) > 0.009) return { ok: false, reason: "mismatch", sum };
  return { ok: true, payments: out };
}

const norm = (t: string) => t.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[!.?,;]+$/g, "");
export const isYes = (t: string) => /^(sim|s|ss|confirmo|confirma|confirmar|pode|pode lancar|pode lançar|isso|ok|blz|beleza|certo|correto|yes)$/.test(norm(t));
export const isNo = (t: string) => /^(nao|n|nn|errado|negativo)$/.test(norm(t));
export const isCancel = (t: string) => /^(cancelar|cancela|cancelado|esquece|deixa|deixa pra la|para|parar|sair)$/.test(norm(t));
export function parseChoice(t: string, n: number): number | null {
  const m = norm(t).match(/^(?:opcao |op |numero |n )?(\d{1,2})$/);
  if (!m) return null;
  const k = Number(m[1]);
  return k >= 1 && k <= n ? k - 1 : null;
}

export const brl = (n: number) => "R$ " + (Math.round(n * 100) / 100).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const METHOD_LABEL: Record<string, string> = { dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão", cartao_credito: "Cartão", cartao_debito: "Cartão débito", transferencia: "Transferência", outro: "Outro" };
const label = (m: string) => METHOD_LABEL[m] ?? m;

export function candidateLabel(c: Candidate) {
  return `${c.name.trim()}${c.brand ? ` (${c.brand.trim()})` : ""} — ${brl(c.sale_price)} · estoque ${c.quantity}`;
}

export function chooseText(itemText: string, qty: number, options: Candidate[]) {
  return [`Achei mais de um item para *${qty}x ${itemText}*. Qual é?`, ...options.map((c, i) => `*${i + 1}.* ${candidateLabel(c)}`), "", "Responda com o número (ou *cancelar*)."].join("\n");
}

export function paymentQuestion(total: number, sum?: number) {
  const head = sum !== undefined && sum > 0 ? `O pagamento (${brl(sum)}) não fecha com o total de *${brl(total)}*.` : `Total da venda: *${brl(total)}*.`;
  return `${head}\nQual a forma de pagamento? Ex.: *pix*, *dinheiro*, *cartão* ou dividido (*30 dinheiro e 50 pix*).`;
}

export function saleSummary(lines: SaleLine[], t: { subtotal: number; discount: number; total: number }, pay: Payments, customer: string | null) {
  const out = ["*Confere a venda?*", ...lines.map((l) => `• ${l.qty}x ${l.name.trim()} — ${brl(l.qty * l.price)}`)];
  if (t.discount > 0) out.push(`Subtotal: ${brl(t.subtotal)}`, `Desconto: -${brl(t.discount)}`);
  out.push(`*Total: ${brl(t.total)}*`);
  out.push("Pagamento: " + METHODS.filter((m) => pay[m] > 0).map((m) => `${label(m)} ${brl(pay[m])}`).join(" + "));
  if (customer) out.push(`Cliente: ${customer}`);
  out.push("", "Responda *SIM* para lançar ou *cancelar*.");
  return out.join("\n");
}

export function saleDoneText(r: { total: number; pending: string[] }) {
  const pend = r.pending?.length
    ? `\n\n📎 Falta anexar o comprovante do *${r.pending.join(" e ")}* no Caixa do sistema para confirmar no financeiro.`
    : "\n\nPagamento em dinheiro já entrou confirmado no caixa.";
  return `✅ Venda lançada no PDV — ${brl(r.total)}.${pend}`;
}

export interface DayReport {
  day: string;
  all: boolean;
  register: { opened_at: string; opened_by: string | null } | null;
  sales: { count: number; total: number; by_method: Record<string, number> };
  os: { count: number; total: number; by_method: Record<string, number> };
  pending: { count: number; total: number; items: { description: string; amount: number; method: string }[] };
}

const methodLines = (bm: Record<string, number>) =>
  Object.entries(bm ?? {}).filter(([, v]) => Number(v) > 0).map(([m, v]) => `   ${label(m)}: ${brl(Number(v))}`);

export function reportText(r: DayReport, who: string, storeName: string) {
  const [y, mo, d] = String(r.day).split("-");
  const out = [`📊 *Resumo de hoje (${d}/${mo}/${y})* — ${storeName}`];
  out.push(r.register ? `Caixa aberto${r.register.opened_by ? ` por ${r.register.opened_by}` : ""}.` : "⚠️ Nenhum caixa aberto agora.");
  out.push("", `🛍️ *${r.all ? "Vendas PDV da loja" : `Suas vendas PDV (${who})`}:* ${Number(r.sales.count)} · ${brl(Number(r.sales.total))}`, ...methodLines(r.sales.by_method));
  out.push("", `🔧 *OS recebidas na loja:* ${Number(r.os.count)} · ${brl(Number(r.os.total))}`, ...methodLines(r.os.by_method));
  if (Number(r.pending.count) > 0) {
    out.push("", `📎 *Sem comprovante no caixa:* ${Number(r.pending.count)} · ${brl(Number(r.pending.total))}`);
    for (const p of r.pending.items.slice(0, 6)) out.push(`   • ${label(p.method)} ${brl(Number(p.amount))} — ${p.description}`);
    if (r.pending.items.length > 6) out.push(`   … e mais ${r.pending.items.length - 6}`);
  } else {
    out.push("", "📎 Nenhum lançamento sem comprovante.");
  }
  return out.join("\n");
}

export function helpText(name: string | null) {
  return [
    `Oi${name ? `, ${name.split(" ")[0]}` : ""}! Sou o assistente interno da loja. Aqui você pode:`,
    "• *relatório* — suas vendas de hoje, OS recebidas e o que falta comprovante no caixa;",
    "• *lançar venda de acessório* — ex.: _2 películas cerâmica e 1 capinha, pix_.",
    "Pode mandar por áudio também. Para assumir um atendimento do CRM, use o link do aviso.",
  ].join("\n");
}

/** Mensagem de erro do banco → texto para o vendedor. */
export function friendlyError(msg: string) {
  const m = String(msg || "");
  if (/caixa aberto/i.test(m) || /estoque insuficiente/i.test(m) || /sem preço/i.test(m) || /não fecha/i.test(m) || /desconto maior/i.test(m) || /sem acesso/i.test(m)) {
    return `❌ ${m.replace(/^ERROR:\s*/i, "")}`;
  }
  return "❌ Não consegui lançar a venda agora. Nada foi gravado. Tente de novo ou lance pelo sistema.";
}
