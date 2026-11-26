import { CHECKLIST_ITEMS } from "@/components/OsChecklist";

/** Peça/serviço lançado na OS, como o cliente vê: nome e valor cobrado (nunca custo ou fornecedor). */
export type OsPdfItem = {
  name: string;
  brand?: string | null;
  model?: string | null;
  quantity: number;
  unit_price: number;
};

export type ChecklistSummary = { ok: string[]; defects: string[]; untested: string[] };

/** Agrupa o checklist por situação, na ordem da tela. Itens fora da lista entram no fim. */
export function checklistSummary(data: unknown): ChecklistSummary {
  const out: ChecklistSummary = { ok: [], defects: [], untested: [] };
  if (!data || typeof data !== "object" || Array.isArray(data)) return out;
  const map = data as Record<string, unknown>;
  const keys = [...CHECKLIST_ITEMS.filter((k) => k in map), ...Object.keys(map).filter((k) => !CHECKLIST_ITEMS.includes(k))];
  for (const k of keys) {
    const v = map[k];
    if (v === "ok") out.ok.push(k);
    else if (v === "defeito") out.defects.push(k);
    else if (v === "na" || v === "nao_testado") out.untested.push(k);
  }
  return out;
}

export const hasChecklist = (s: ChecklistSummary) => s.ok.length + s.defects.length + s.untested.length > 0;

export type CheckMark = "ok" | "defeito" | "na";
/** Um item do checklist com a situação na entrada e na saída (null = não preenchido). */
export type ChecklistRow = { item: string; entry: CheckMark | null; exit: CheckMark | null };

const toMark = (v: unknown): CheckMark | null =>
  v === "ok" ? "ok" : v === "defeito" ? "defeito" : v === "na" || v === "nao_testado" ? "na" : null;

/** Tabela de testes: todos os itens preenchidos em algum dos checklists, na ordem da tela. */
export function checklistRows(entry: unknown, exit: unknown): ChecklistRow[] {
  const obj = (d: unknown) => (d && typeof d === "object" && !Array.isArray(d) ? (d as Record<string, unknown>) : {});
  const e = obj(entry), x = obj(exit);
  const keys = [...CHECKLIST_ITEMS, ...Object.keys(e), ...Object.keys(x)].filter((k, i, a) => a.indexOf(k) === i);
  return keys.map((item) => ({ item, entry: toMark(e[item]), exit: toMark(x[item]) })).filter((r) => r.entry || r.exit);
}

/** Contagem de uma etapa: funcionando, com defeito e não testados. */
export function checklistCount(rows: ChecklistRow[], stage: "entry" | "exit") {
  const marks = rows.map((r) => r[stage]).filter((m): m is CheckMark => m !== null);
  return {
    total: marks.length,
    ok: marks.filter((m) => m === "ok").length,
    defects: marks.filter((m) => m === "defeito").length,
    untested: marks.filter((m) => m === "na").length,
  };
}

/** Serviço executado lançado pelo técnico: descrição e valor (opcional). */
export type PerformedService = { description: string; price: number | null };

/** Lista de serviços da OS; OS antigas com só o texto livre viram uma linha por serviço, sem valor. */
export function performedServices(order: { services_performed?: unknown; service_performed?: string | null }): PerformedService[] {
  const raw = Array.isArray(order.services_performed) ? order.services_performed : [];
  const list = raw
    .map((x) => ({
      description: String(x?.description ?? "").trim(),
      price: x?.price === null || x?.price === undefined || x?.price === "" || Number.isNaN(Number(x.price)) ? null : round2(Number(x.price)),
    }))
    .filter((x) => x.description);
  if (list.length) return list;
  return String(order.service_performed ?? "")
    .split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((description): PerformedService => ({ description, price: null }));
}

/** Linha do formulário (valores como texto dos inputs). */
export type ServiceFormRow = { description: string; price: string };

/** Formulário → o que vai para o banco: sem linhas vazias, valor vazio = null. */
export function cleanServiceRows(rows: ServiceFormRow[]): PerformedService[] {
  return rows
    .map((r) => ({
      description: r.description.trim(),
      price: r.price.trim() === "" || Number.isNaN(Number(r.price)) ? null : Math.max(0, round2(Number(r.price))),
    }))
    .filter((r) => r.description);
}

export type ServiceLine = {
  label: string;
  /** só peças têm quantidade */
  quantity: number | null;
  /** null = serviço sem valor separado (o valor está no total) */
  total: number | null;
  kind: "part" | "service" | "labor" | "discount";
};

/**
 * Linhas do "Serviço executado": peças (valor cobrado), serviços, a diferença para
 * o valor final como mão de obra e o desconto. O total é sempre o valor final
 * (que já tem o desconto); sem valor final, é a soma menos o desconto.
 */
export function serviceBreakdown(
  order: {
    final_price?: number | string | null;
    requested_service?: string | null;
    discount_amount?: number | string | null;
    services_performed?: unknown;
    service_performed?: string | null;
  },
  items: OsPdfItem[],
): { lines: ServiceLine[]; total: number; discount: number } {
  const lines: ServiceLine[] = items.map((i) => {
    const qty = Number(i.quantity) || 1;
    return { label: i.name?.trim() || "Peça", quantity: qty, total: round2(qty * (Number(i.unit_price) || 0)), kind: "part" };
  });
  const services = performedServices(order);
  services.forEach((sv) => lines.push({ label: sv.description, quantity: null, total: sv.price, kind: "service" }));

  const priced = round2(lines.reduce((s, l) => s + (l.total ?? 0), 0));
  const finalPrice = Number(order.final_price) || 0;
  let discount = Math.max(0, round2(Number(order.discount_amount) || 0));

  if (finalPrice > 0) {
    const rest = round2(finalPrice + discount - priced);
    if (rest > 0.009) {
      const unpriced = services.some((sv) => sv.price === null);
      const service = order.requested_service && order.requested_service !== "Outro" ? order.requested_service : "Serviço";
      const label = unpriced
        ? (priced > 0 ? "Demais serviços / mão de obra" : "Valor dos serviços")
        : lines.length ? `Mão de obra - ${service}` : service;
      lines.push({ label, quantity: null, total: rest, kind: "labor" });
    } else if (rest < -0.009) {
      discount = round2(priced - finalPrice); // cobrou menos que a soma: a diferença é desconto
    }
  }
  if (discount > 0.009) lines.push({ label: "Desconto", quantity: null, total: -discount, kind: "discount" });
  const total = finalPrice > 0 ? finalPrice : Math.max(0, round2(priced - discount));
  return { lines, total, discount };
}

/**
 * Valor final na tela de Atualizar Serviço quando o técnico mexe nos serviços ou no desconto:
 * - com algum serviço com valor: peças + serviços − desconto;
 * - só descrições: mudar o desconto tira (ou devolve) a diferença do valor final.
 */
export function recalcFinalPrice(
  prev: { final_price: string; discount_amount: string; services: { price: string }[] },
  next: { discount_amount: string; services: { price: string }[] },
  partsTotal: number,
): string {
  const num = (v: string) => (v === "" || Number.isNaN(Number(v)) ? 0 : Number(v));
  const priced = next.services.filter((s) => s.price !== "" && !Number.isNaN(Number(s.price)));
  if (priced.length) {
    const sum = partsTotal + priced.reduce((a, s) => a + Number(s.price), 0) - num(next.discount_amount);
    return Math.max(0, round2(sum)).toFixed(2);
  }
  if (num(prev.discount_amount) !== num(next.discount_amount) && prev.final_price !== "") {
    return Math.max(0, round2(num(prev.final_price) + num(prev.discount_amount) - num(next.discount_amount))).toFixed(2);
  }
  return prev.final_price;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Data só do dia (yyyy-mm-dd ou timestamp à meia-noite UTC) sem cair no dia anterior pelo fuso. */
export function formatDay(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}
