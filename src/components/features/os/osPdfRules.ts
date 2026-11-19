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

export type ServiceLine = { label: string; quantity: number; total: number };

/**
 * Linhas do "Serviço executado": as peças com o valor cobrado e, se o valor final
 * for maior que a soma delas, a diferença como mão de obra. Sem peças, o serviço
 * inteiro vira uma linha com o valor final.
 */
export function serviceBreakdown(
  order: { final_price?: number | string | null; requested_service?: string | null },
  items: OsPdfItem[],
): { lines: ServiceLine[]; total: number } {
  const lines: ServiceLine[] = items.map((i) => {
    const qty = Number(i.quantity) || 1;
    return { label: i.name?.trim() || "Peça", quantity: qty, total: round2(qty * (Number(i.unit_price) || 0)) };
  });
  const partsTotal = round2(lines.reduce((s, l) => s + l.total, 0));
  const finalPrice = Number(order.final_price) || 0;
  const service = order.requested_service && order.requested_service !== "Outro" ? order.requested_service : "Serviço";
  if (finalPrice > partsTotal + 0.009) {
    lines.push({ label: lines.length ? `Mão de obra - ${service}` : service, quantity: 1, total: round2(finalPrice - partsTotal) });
  } else if (finalPrice > 0 && finalPrice < partsTotal - 0.009) {
    lines.push({ label: "Desconto", quantity: 1, total: round2(finalPrice - partsTotal) });
  }
  return { lines, total: finalPrice > 0 ? finalPrice : partsTotal };
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
