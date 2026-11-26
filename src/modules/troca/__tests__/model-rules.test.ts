import { describe, expect, it } from "vitest";
import { computeOffer } from "../lib/calc";
import { IPHONES, normalizeStorage } from "../lib/priceList";
import { brandsOf, chosenRules, modelNames, rulesForModel, sellable, variantsOf } from "../lib/wizard";
import type { TradeModel, TradeModelRule, TradeRule } from "../lib/types";

const rule = (id: string, question: TradeRule["question"], kind: TradeRule["kind"], amount: number): TradeRule =>
  ({ id, store_id: "s", question, label: id, kind, amount, position: 1, active: true });
const RULES = [rule("tela-trocada", "pecas", "pct", 10), rule("riscos", "tela", "pct", 5), rule("conta-presa", "conta", "block", 0)];
const over = (model_id: string, rule_id: string, amount: number, kind: "pct" | "fixed" = "fixed"): TradeModelRule =>
  ({ model_id, rule_id, store_id: "s", kind, amount });
const model = (p: Partial<TradeModel>): TradeModel =>
  ({ id: "m", store_id: "s", brand: "Apple", model: "iPhone 13", storage: "128 GB", base_price: 2000, active: true, ...p });

describe("desconto de cada aparelho", () => {
  const overrides = [over("m8", "tela-trocada", 180), over("m15", "tela-trocada", 900), over("m15", "conta-presa", 1)];

  it("usa o valor do aparelho onde tem e o padrão da loja no resto", () => {
    const r8 = rulesForModel(RULES, overrides, "m8");
    expect(r8.find((r) => r.id === "tela-trocada")).toMatchObject({ kind: "fixed", amount: 180 });
    expect(r8.find((r) => r.id === "riscos")).toMatchObject({ kind: "pct", amount: 5 });
  });

  it("Não compra nunca muda; sem aparelho ou sem valores fica o padrão", () => {
    expect(rulesForModel(RULES, overrides, "m15").find((r) => r.id === "conta-presa")).toMatchObject({ kind: "block", amount: 0 });
    expect(rulesForModel(RULES, overrides, null)).toBe(RULES);
    expect(rulesForModel(RULES, overrides, "outro")).toBe(RULES);
  });

  it("a mesma peça desconta diferente em cada aparelho", () => {
    const pick = { pecas: ["tela-trocada"] };
    const settings = { negotiation_pct: 0, round_to: 10 };
    expect(computeOffer(1500, chosenRules(rulesForModel(RULES, overrides, "m8"), pick), settings).offerMax).toBe(1320);
    expect(computeOffer(5000, chosenRules(rulesForModel(RULES, overrides, "m15"), pick), settings).offerMax).toBe(4100);
    // sem valor próprio: 10% do preço base
    expect(computeOffer(2000, chosenRules(rulesForModel(RULES, overrides, "m13"), pick), settings).offerMax).toBe(1800);
  });
});

describe("aparelho cadastrado sem preço", () => {
  const models = [
    model({ id: "a", model: "iPhone 13", storage: "128 GB", base_price: 2000 }),
    model({ id: "b", model: "iPhone 13", storage: "256 GB", base_price: 0 }),
    model({ id: "c", model: "iPhone 8 Plus", storage: "64 GB", base_price: 0 }),
    model({ id: "d", brand: "Samsung", model: "Galaxy S23", storage: "256 GB", base_price: 0 }),
  ];

  it("fica fora do simulador até ter valor", () => {
    expect(sellable(models[0])).toBe(true);
    expect(sellable(models[1])).toBe(false);
    expect(sellable({ ...models[0], active: false })).toBe(false);
    expect(brandsOf(models)).toEqual(["Apple"]);
    expect(modelNames(models, "Apple", "").map((m) => m.model)).toEqual(["iPhone 13"]);
    expect(variantsOf(models, "Apple", "iPhone 13").map((m) => m.storage)).toEqual(["128 GB"]);
  });
});

describe("lista de iPhones", () => {
  it("vai do 8 ao 17, sem modelo repetido, com capacidades válidas", () => {
    const names = IPHONES.map(([m]) => m);
    expect(names[0]).toBe("iPhone 8");
    expect(names).toContain("iPhone 8 Plus");
    expect(names).toContain("iPhone XS Max");
    expect(names).toContain("iPhone 17 Pro Max");
    expect(new Set(names).size).toBe(names.length);
    for (const [, caps] of IPHONES) for (const c of caps) expect(normalizeStorage(c)).toMatch(/^\d+ (GB|TB)$/);
  });
});
