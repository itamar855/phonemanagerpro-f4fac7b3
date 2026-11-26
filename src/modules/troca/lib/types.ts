// Tipos do simulador de troca (tabelas tradein_*). Não estão no types.ts gerado do Supabase.
import type { TradeShare } from "./share";

export type QuestionKey = "tela" | "bateria" | "carcaca" | "biometria" | "conta" | "pecas" | "acessorios";
export type RuleKind = "pct" | "fixed" | "block";
export type EvalStatus = "simulada" | "aceita" | "recusada";

export interface TradeSettings {
  store_id: string;
  negotiation_pct: number;
  round_to: number;
}

export interface TradeModel {
  id: string;
  store_id: string;
  brand: string;
  model: string;
  storage: string;
  base_price: number;
  active: boolean;
}

export interface TradeRule {
  id: string;
  store_id: string;
  question: QuestionKey;
  label: string;
  kind: RuleKind;
  amount: number;
  position: number;
  active: boolean;
}

/** Desconto escolhido, como fica salvo na avaliação (foto do momento). */
export interface AnswerLine {
  question: QuestionKey;
  label: string;
  kind: RuleKind;
  amount: number;
  /** quanto descontou em R$ (0 para "não compra") */
  value: number;
}

export interface TradeEvaluation {
  id: string;
  store_id: string;
  created_by: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  model_id: string | null;
  brand: string;
  model: string;
  storage: string;
  imei: string | null;
  base_price: number;
  answers: AnswerLine[];
  discount_total: number;
  offer_min: number;
  offer_max: number;
  blocked: boolean;
  status: EvalStatus;
  agreed_value: number | null;
  notes: string | null;
  sale_id: string | null;
  created_at: string;
  /** link enviado ao cliente (só vem no histórico) */
  share?: TradeShare | null;
}
