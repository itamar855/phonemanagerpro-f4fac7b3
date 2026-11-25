// Ponte entre o simulador de troca (/troca, módulo separado) e a Nova Venda (/vendas).
// Fica fora do módulo para a tela de Vendas não precisar baixar o simulador.

export interface TradeInHandoff {
  evaluationId: string;
  /** nome do aparelho como aparece no estoque, ex.: "iPhone 13 128 GB" */
  name: string;
  brand: string;
  model: string;
  imei: string;
  value: number;
  customerName: string | null;
}

/** Marcas que a Nova Venda conhece no trade-in. */
export function saleTradeBrand(brand: string, model = ""): "iPhone" | "Samsung" | "Xiaomi" | "Outro" {
  const s = `${brand} ${model}`.toLowerCase();
  if (s.includes("apple") || s.includes("iphone")) return "iPhone";
  if (s.includes("samsung") || s.includes("galaxy")) return "Samsung";
  if (/(xiaomi|redmi|poco)/.test(s)) return "Xiaomi";
  return "Outro";
}

/** Lê o aparelho que veio do simulador (state da navegação), se houver. */
export function readTradeInHandoff(state: unknown): TradeInHandoff | null {
  const t = (state as { tradeIn?: Partial<TradeInHandoff> } | null)?.tradeIn;
  if (!t || typeof t.evaluationId !== "string" || typeof t.name !== "string") return null;
  const value = Number(t.value);
  if (!Number.isFinite(value) || value < 0) return null;
  return {
    evaluationId: t.evaluationId,
    name: t.name,
    brand: String(t.brand ?? ""),
    model: String(t.model ?? ""),
    imei: String(t.imei ?? ""),
    value,
    customerName: t.customerName ?? null,
  };
}
