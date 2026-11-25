import { describe, expect, it } from "vitest";
import { computeOffer, floorTo, ruleAmountLabel } from "../lib/calc";
import { guessBrand, iphoneTemplate, normalizeStorage, parseMoney, parsePriceList, planUpsert } from "../lib/priceList";
import { activeQuestions, brandsOf, chosenRules, modelNames, storageSize, variantsOf } from "../lib/wizard";
import { buildHandoff, deviceName } from "../lib/handoff";
import { trocaAccess, trocaIsManager } from "../lib/access";
import { readTradeInHandoff, saleTradeBrand } from "@/lib/tradeinHandoff";
import type { TradeEvaluation, TradeModel, TradeRule } from "../lib/types";

const S = { negotiation_pct: 10, round_to: 10 };
const rule = (p: Partial<TradeRule>): TradeRule => ({
  id: p.id ?? Math.random().toString(36), store_id: "a", question: "tela", label: "x", kind: "pct", amount: 0, position: 1, active: true, ...p,
});
const model = (p: Partial<TradeModel>): TradeModel => ({
  id: p.id ?? Math.random().toString(36), store_id: "a", brand: "Apple", model: "iPhone 13", storage: "128 GB", base_price: 2000, active: true, ...p,
});

describe("cálculo da oferta", () => {
  it("aparelho perfeito: teto = base, piso = base − margem", () => {
    const o = computeOffer(2000, [], S);
    expect(o).toMatchObject({ offerMax: 2000, offerMin: 1800, discountTotal: 0, blocked: false });
  });

  it("descontos em % são sobre a base (somam) e o R$ fixo entra direto; arredonda para baixo", () => {
    const o = computeOffer(2050, [
      rule({ question: "tela", label: "Riscos", kind: "pct", amount: 5 }),      // 102,50
      rule({ question: "bateria", label: "80%", kind: "pct", amount: 10 }),    // 205
      rule({ question: "acessorios", label: "Sem caixa", kind: "fixed", amount: 30 }),
    ], S);
    expect(o.discountTotal).toBe(337.5);
    expect(o.offerMax).toBe(1710); // 1712,50 → 1710
    expect(o.offerMin).toBe(1530); // 1539 → 1530
    expect(o.lines.map((l) => l.value)).toEqual([102.5, 205, 30]);
  });

  it("conta presa bloqueia: oferta zero", () => {
    const o = computeOffer(3000, [rule({ question: "conta", kind: "block", label: "Vinculada" })], S);
    expect(o).toMatchObject({ blocked: true, offerMax: 0, offerMin: 0 });
  });

  it("desconto maior que o aparelho não fica negativo; margem fora do limite é contida", () => {
    expect(computeOffer(500, [rule({ kind: "pct", amount: 80 }), rule({ kind: "fixed", amount: 300 })], S)).toMatchObject({ offerMax: 0, offerMin: 0, discountTotal: 500 });
    expect(computeOffer(1000, [], { negotiation_pct: 90, round_to: 1 }).offerMin).toBe(500);
    expect(computeOffer(1000, [], { negotiation_pct: 0, round_to: 1 }).offerMin).toBe(1000);
  });

  it("floorTo e rótulos", () => {
    expect(floorTo(1799.99, 10)).toBe(1790);
    expect(floorTo(1800, 100)).toBe(1800);
    expect(floorTo(-5, 10)).toBe(0);
    expect(ruleAmountLabel("pct", 5)).toBe("5%");
    expect(ruleAmountLabel("block", 0)).toBe("Não compra");
    expect(ruleAmountLabel("fixed", 30)).toMatch(/R\$\s?30/);
  });
});

describe("lista de preços colada", () => {
  it("lê valores em vários formatos", () => {
    expect(parseMoney("R$ 1.500,00")).toBe(1500);
    expect(parseMoney("1.500")).toBe(1500);
    expect(parseMoney("1500.5")).toBe(1500.5);
    expect(parseMoney("2.300,90")).toBe(2300.9);
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney("-10")).toBeNull();
  });

  it("normaliza capacidade e adivinha a marca", () => {
    expect(normalizeStorage("128")).toBe("128 GB");
    expect(normalizeStorage("256gb")).toBe("256 GB");
    expect(normalizeStorage("1tb")).toBe("1 TB");
    expect(normalizeStorage("8/256")).toBe("8/256");
    expect(guessBrand("iPhone 13")).toBe("Apple");
    expect(guessBrand("Galaxy S23")).toBe("Samsung");
    expect(guessBrand("Redmi Note 13")).toBe("Xiaomi");
    expect(guessBrand("Moto G84")).toBe("Motorola");
  });

  it("aceita ; ou tab, com ou sem marca; ignora vazias e comentários; repetida vale a última", () => {
    const r = parsePriceList([
      "# tabela de novembro",
      "Apple; iPhone 13; 128; 2000",
      "iPhone 13\t256\t2.300",
      "",
      "Apple; iPhone 12; 64 GB; ",
      "Samsung; Galaxy S23",
      "Apple; iphone 13; 128 GB; 2100",
    ].join("\n"));
    expect(r.rows).toEqual([
      { brand: "Apple", model: "iphone 13", storage: "128 GB", base_price: 2100 },
      { brand: "Apple", model: "iPhone 13", storage: "256 GB", base_price: 2300 },
    ]);
    expect(r.skipped).toEqual([{ line: 5, reason: "sem valor" }, { line: 6, reason: "use Marca; Modelo; Capacidade; Valor" }]);
  });

  it("separa novos de preços que mudaram (e reativa o escondido)", () => {
    const existing = [model({ id: "m1", base_price: 2000 }), model({ id: "m2", storage: "256 GB", base_price: 2300, active: false }), model({ id: "m3", storage: "512 GB", base_price: 2600 })];
    const plan = planUpsert([
      { brand: "apple", model: "IPHONE 13", storage: "128 GB", base_price: 1900 },
      { brand: "Apple", model: "iPhone 13", storage: "256 GB", base_price: 2300 },
      { brand: "Apple", model: "iPhone 13", storage: "512 GB", base_price: 2600 },
      { brand: "Apple", model: "iPhone 14", storage: "128 GB", base_price: 2600 },
    ], existing);
    expect(plan.updates).toEqual([{ id: "m1", base_price: 1900 }, { id: "m2", base_price: 2300 }]);
    expect(plan.inserts.map((i) => i.model)).toEqual(["iPhone 14"]);
  });

  it("modelo pronto de iPhones vem sem valor e sem o que já está na tabela", () => {
    const t = iphoneTemplate([model({ model: "iPhone 13", storage: "128 GB" })]);
    expect(t).toContain("Apple; iPhone 11; 64 GB; ");
    expect(t).toContain("Apple; iPhone 17 Pro Max; 2 TB; ");
    expect(t).not.toContain("Apple; iPhone 13; 128 GB;");
    expect(parsePriceList(t).rows).toHaveLength(0); // sem valor: nada entra sem o gerente preencher
  });
});

describe("passo a passo", () => {
  const models = [
    model({ brand: "Samsung", model: "Galaxy S23", storage: "256 GB" }),
    model({ model: "iPhone 13", storage: "1 TB" }),
    model({ model: "iPhone 13", storage: "128 GB" }),
    model({ model: "iPhone 13", storage: "512 GB" }),
    model({ model: "iPhone 11", storage: "64 GB" }),
    model({ model: "iPhone 14", storage: "128 GB", active: false }),
  ];

  it("marcas com Apple primeiro; modelos sem repetir; busca procura em todas as marcas", () => {
    expect(brandsOf(models)).toEqual(["Apple", "Samsung"]);
    expect(modelNames(models, "Apple", "").map((m) => m.model)).toEqual(["iPhone 11", "iPhone 13"]);
    expect(modelNames(models, "Apple", "s23").map((m) => m.model)).toEqual(["Galaxy S23"]);
    expect(modelNames(models, "Apple", "14")).toEqual([]); // inativo some
  });

  it("capacidades da menor para a maior", () => {
    expect(variantsOf(models, "apple", "iphone 13").map((m) => m.storage)).toEqual(["128 GB", "512 GB", "1 TB"]);
    expect(storageSize("1 TB")).toBeGreaterThan(storageSize("512 GB"));
  });

  it("pergunta sem opção ativa some; respostas saem na ordem das perguntas", () => {
    const rules = [
      rule({ id: "t1", question: "tela", position: 2 }), rule({ id: "t0", question: "tela", position: 1 }),
      rule({ id: "c1", question: "conta" }),
      rule({ id: "b1", question: "bateria", active: false }),
    ];
    const qs = activeQuestions(rules);
    expect(qs.map((q) => q.question.key)).toEqual(["conta", "tela"]);
    expect(qs[1].options.map((o) => o.id)).toEqual(["t0", "t1"]);
    expect(chosenRules(rules, { tela: ["t1"], conta: ["c1"], pecas: ["sumiu"] }).map((r) => r.id)).toEqual(["c1", "t1"]);
  });
});

describe("ponte com a Nova Venda e acesso", () => {
  const ev: TradeEvaluation = {
    id: "e1", store_id: "a", created_by: "u", customer_name: "Ana", customer_phone: null, model_id: "m", brand: "Apple",
    model: "iPhone 13", storage: "128 GB", imei: "35", base_price: 2000, answers: [], discount_total: 0, offer_min: 1800,
    offer_max: 2000, blocked: false, status: "aceita", agreed_value: 1900, notes: null, sale_id: null, created_at: "",
  };

  it("só avaliação aceita, sem venda e sem bloqueio vai para a venda", () => {
    expect(deviceName(ev)).toBe("iPhone 13 128 GB");
    expect(buildHandoff(ev)).toMatchObject({ evaluationId: "e1", name: "iPhone 13 128 GB", value: 1900, customerName: "Ana" });
    expect(buildHandoff({ ...ev, status: "simulada" })).toBeNull();
    expect(buildHandoff({ ...ev, sale_id: "s" })).toBeNull();
  });

  it("a Vendas só aceita state válido e traduz a marca", () => {
    expect(readTradeInHandoff({ tradeIn: buildHandoff(ev) })?.value).toBe(1900);
    expect(readTradeInHandoff(null)).toBeNull();
    expect(readTradeInHandoff({ tradeIn: { evaluationId: "x", name: "y", value: -1 } })).toBeNull();
    expect(saleTradeBrand("Apple")).toBe("iPhone");
    expect(saleTradeBrand("Outro", "Redmi Note 12")).toBe("Xiaomi");
    expect(saleTradeBrand("Motorola")).toBe("Outro");
  });

  it("vendedor com Vendas entra; gerente/dono/admin entram e cuidam da tabela", () => {
    expect(trocaAccess(null, null)).toBe("loading");
    expect(trocaAccess("vendedor", { vendas: true })).toBe("allowed");
    expect(trocaAccess("vendedor", { vendas: false })).toBe("denied");
    expect(trocaAccess("tecnico", null)).toBe("denied");
    expect(trocaAccess("gerente", null)).toBe("allowed");
    expect(trocaIsManager("dono")).toBe(true);
    expect(trocaIsManager("vendedor")).toBe(false);
  });
});
