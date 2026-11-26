// Montagem do passo a passo do simulador a partir da tabela da loja.
import { QUESTIONS, type Question } from "./questions";
import type { QuestionKey, TradeModel, TradeModelRule, TradeRule } from "./types";

/** "64 GB" < "128 GB" < "1 TB"; texto livre vai para o fim. */
export function storageSize(s: string): number {
  const m = (s ?? "").match(/(\d+(?:[.,]\d+)?)\s*(gb|tb)/i);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const n = Number(m[1].replace(",", "."));
  return m[2].toLowerCase() === "tb" ? n * 1024 : n;
}

const natural = (a: string, b: string) => a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" });

/** Aparece no simulador: ativo e com preço (modelo cadastrado sem valor fica só na Tabela). */
export const sellable = (m: TradeModel) => m.active && m.base_price > 0;

/** Marcas com pelo menos um modelo ativo; Apple primeiro (é a maior parte das trocas). */
export function brandsOf(models: TradeModel[]): string[] {
  const set = [...new Set(models.filter(sellable).map((m) => m.brand.trim()))];
  return set.sort((a, b) => (a === "Apple" ? -1 : b === "Apple" ? 1 : natural(a, b)));
}

/** Nomes de modelo (sem repetir por capacidade), filtrando por marca ou pela busca em todas as marcas. */
export function modelNames(models: TradeModel[], brand: string | null, search: string): { brand: string; model: string }[] {
  const q = search.trim().toLowerCase();
  const seen = new Set<string>();
  const out: { brand: string; model: string }[] = [];
  for (const m of models) {
    if (!sellable(m)) continue;
    if (q ? !`${m.brand} ${m.model}`.toLowerCase().includes(q) : m.brand.trim() !== brand) continue;
    const key = `${m.brand.trim()}|${m.model.trim()}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ brand: m.brand.trim(), model: m.model.trim() });
  }
  return out.sort((a, b) => natural(a.model, b.model));
}

/** Capacidades de um modelo, da menor para a maior. */
export function variantsOf(models: TradeModel[], brand: string, model: string): TradeModel[] {
  const b = brand.trim().toLowerCase();
  const n = model.trim().toLowerCase();
  return models
    .filter((m) => sellable(m) && m.brand.trim().toLowerCase() === b && m.model.trim().toLowerCase() === n)
    .sort((x, y) => storageSize(x.storage) - storageSize(y.storage));
}

/** Perguntas que têm resposta cadastrada (pergunta sem opção ativa some do passo a passo). */
export function activeQuestions(rules: TradeRule[]): { question: Question; options: TradeRule[] }[] {
  return QUESTIONS.map((question) => ({
    question,
    options: rules.filter((r) => r.active && r.question === question.key).sort((a, b) => a.position - b.position),
  })).filter((q) => q.options.length > 0);
}

/**
 * Opções da loja com o valor próprio do aparelho, quando houver (igual a tradein_effective_rules no banco).
 * "Não compra" nunca muda. Sem aparelho escolhido: padrão da loja.
 */
export function rulesForModel(rules: TradeRule[], overrides: TradeModelRule[], modelId: string | null | undefined): TradeRule[] {
  if (!modelId) return rules;
  const mine = new Map(overrides.filter((o) => o.model_id === modelId).map((o) => [o.rule_id, o]));
  if (!mine.size) return rules;
  return rules.map((r) => {
    const o = r.kind === "block" ? undefined : mine.get(r.id);
    return o ? { ...r, kind: o.kind, amount: o.amount } : r;
  });
}

/** Regras escolhidas, na ordem das perguntas. */
export function chosenRules(rules: TradeRule[], answers: Partial<Record<QuestionKey, string[]>>): TradeRule[] {
  const byId = new Map(rules.map((r) => [r.id, r]));
  return QUESTIONS.flatMap((q) => (answers[q.key] ?? []).map((id) => byId.get(id)).filter((r): r is TradeRule => !!r));
}
