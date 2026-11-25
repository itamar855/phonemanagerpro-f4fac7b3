// Cálculo da oferta de troca (decisão do dono, 25/11/2026):
//   valor = preço base (aparelho perfeito) − descontos de cada defeito
//   faixa = do valor (teto) até X% abaixo (piso de negociação), arredondando para baixo
// Descontos em % são sempre sobre o preço base (somam, não acumulam um sobre o outro).
import type { AnswerLine, TradeRule } from "./types";

export interface OfferSettings {
  negotiation_pct: number;
  round_to: number;
}

export interface Offer {
  base: number;
  lines: AnswerLine[];
  discountTotal: number;
  blocked: boolean;
  /** teto: o máximo que a loja paga */
  offerMax: number;
  /** piso: comece oferecendo por aqui */
  offerMin: number;
}

const cents = (v: number) => Math.round(v * 100) / 100;

/** Arredonda para baixo no múltiplo (ex.: 1.737 → 1.730 com múltiplo 10). */
export function floorTo(value: number, step: number): number {
  if (!(value > 0)) return 0;
  const s = step > 0 ? step : 1;
  return Math.floor(value / s + 1e-9) * s;
}

export function toAnswerLine(rule: Pick<TradeRule, "question" | "label" | "kind" | "amount">, base: number): AnswerLine {
  const amount = Number(rule.amount) || 0;
  const value = rule.kind === "pct" ? cents((base * amount) / 100) : rule.kind === "fixed" ? cents(amount) : 0;
  return { question: rule.question, label: rule.label, kind: rule.kind, amount, value };
}

export function computeOffer(
  basePrice: number,
  chosen: Pick<TradeRule, "question" | "label" | "kind" | "amount">[],
  settings: OfferSettings,
): Offer {
  const base = Math.max(0, Number(basePrice) || 0);
  const lines = chosen.map((r) => toAnswerLine(r, base));
  const blocked = lines.some((l) => l.kind === "block");
  const discountTotal = cents(Math.min(base, lines.reduce((s, l) => s + l.value, 0)));
  if (blocked) return { base, lines, discountTotal, blocked, offerMax: 0, offerMin: 0 };

  const neg = Math.min(50, Math.max(0, Number(settings.negotiation_pct) || 0));
  const offerMax = floorTo(base - discountTotal, settings.round_to);
  const offerMin = Math.min(offerMax, floorTo(offerMax * (1 - neg / 100), settings.round_to));
  return { base, lines, discountTotal, blocked, offerMax, offerMin };
}

export function formatBRL(v: number | null | undefined): string {
  const n = Number(v) || 0;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Como o desconto aparece na tabela: "5%", "R$ 30" ou "Não compra". */
export function ruleAmountLabel(kind: TradeRule["kind"], amount: number): string {
  if (kind === "block") return "Não compra";
  if (kind === "pct") return `${Number(amount).toLocaleString("pt-BR")}%`;
  return formatBRL(amount);
}
