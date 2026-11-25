import type { TradeInHandoff } from "@/lib/tradeinHandoff";
import type { TradeEvaluation } from "./types";

/** Nome do aparelho como vai para o estoque: "iPhone 13 128 GB". */
export function deviceName(e: Pick<TradeEvaluation, "model" | "storage">): string {
  return [e.model, e.storage].filter(Boolean).join(" ").trim();
}

/** Dados para a Nova Venda já abrir com o aparelho na troca. Só avaliação aceita e ainda sem venda. */
export function buildHandoff(e: TradeEvaluation): TradeInHandoff | null {
  if (e.status !== "aceita" || e.blocked || e.sale_id) return null;
  return {
    evaluationId: e.id,
    name: deviceName(e),
    brand: e.brand,
    model: e.model,
    imei: e.imei ?? "",
    value: e.agreed_value ?? e.offer_max,
    customerName: e.customer_name,
  };
}
