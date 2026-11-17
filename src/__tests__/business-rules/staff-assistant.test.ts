import { describe, it, expect } from "vitest";
import {
  brl, friendlyError, isCancel, isNo, isYes, parseChoice, parseExtraction, pickCandidate, reportText,
  resolvePayments, saleDoneText, saleSummary, saleTotals, type Candidate, type DayReport,
} from "../../../supabase/functions/_shared/staff-assistant-core";

const cand = (name: string, score: number, extra: Partial<Candidate> = {}): Candidate => ({
  id: name, name, brand: null, category: "capa", sale_price: 40, quantity: 5, score, ...extra,
});

describe("assistente da equipe — leitura da mensagem", () => {
  it("lê itens, quantidades, pagamento e cliente", () => {
    const ex = parseExtraction(JSON.stringify({
      intent: "venda", items: [{ text: "película cerâmica", qty: 2 }, { text: "capinha A15", qty: 0 }],
      pay_pix: 60, pay_dinheiro: null, methods: ["pix"], discount: null, customer: "Maria",
    }));
    expect(ex.intent).toBe("venda");
    expect(ex.items).toEqual([{ text: "película cerâmica", qty: 2 }, { text: "capinha A15", qty: 1 }]);
    expect(ex.methods).toEqual(["pix"]);
    expect(ex.payments.pix).toBe(60);
    expect(ex.discount).toBe(0);
    expect(ex.customer).toBe("Maria");
  });

  it("resposta inválida do modelo vira 'outro' sem itens", () => {
    const ex = parseExtraction("não é json");
    expect(ex.intent).toBe("outro");
    expect(ex.items).toEqual([]);
    expect(ex.methods).toEqual([]);
  });

  it("forma com valor entra em methods mesmo se o modelo esquecer", () => {
    const ex = parseExtraction({ intent: "venda", items: [], methods: [], pay_dinheiro: 30 });
    expect(ex.methods).toEqual(["dinheiro"]);
  });

  it("cliente 'null' em texto é ignorado", () => {
    expect(parseExtraction({ intent: "venda", items: [], methods: [], customer: "null" }).customer).toBeNull();
  });
});

describe("assistente da equipe — escolha do item no estoque", () => {
  it("escolhe sozinho quando um resultado é claramente melhor", () => {
    const r = pickCandidate([cand("Película cerâmica", 0.9), cand("Capinha", 0.3)]);
    expect(r.kind).toBe("auto");
  });

  it("pergunta quando há itens parecidos (ex.: com e sem privacidade)", () => {
    const r = pickCandidate([cand("PELÍCULA CERÂMICA C/ PRIVACIDADE", 0.97), cand("PELÍCULA CERÂMICA S/ PRIVACIDADE", 0.94)]);
    expect(r.kind).toBe("ask");
    if (r.kind === "ask") expect(r.options).toHaveLength(2);
  });

  it("ignora sem estoque, sem preço ou pouco parecido", () => {
    expect(pickCandidate([cand("a", 0.9, { quantity: 0 }), cand("b", 0.9, { sale_price: 0 }), cand("c", 0.1)]).kind).toBe("none");
  });

  it("número da opção", () => {
    expect(parseChoice("2", 3)).toBe(1);
    expect(parseChoice("opção 1", 3)).toBe(0);
    expect(parseChoice("4", 3)).toBeNull();
    expect(parseChoice("a capinha", 3)).toBeNull();
  });
});

describe("assistente da equipe — pagamento", () => {
  const lines = [{ id: "1", name: "Película", qty: 2, price: 40 }, { id: "2", name: "Capinha", qty: 1, price: 65 }];

  it("totais com desconto", () => {
    expect(saleTotals(lines, 5)).toEqual({ subtotal: 145, discount: 5, total: 140 });
    expect(saleTotals(lines, 999).total).toBe(0);
  });

  it("uma forma sem valor = total", () => {
    const r = resolvePayments(140, { methods: ["pix"], payments: { pix: null, dinheiro: null, cartao: null } });
    expect(r).toEqual({ ok: true, payments: { dinheiro: 0, pix: 140, cartao: 0 } });
  });

  it("duas formas, uma sem valor = restante", () => {
    const r = resolvePayments(140, { methods: ["dinheiro", "pix"], payments: { dinheiro: 40, pix: null, cartao: null } });
    expect(r).toEqual({ ok: true, payments: { dinheiro: 40, pix: 100, cartao: 0 } });
  });

  it("metade/metade divide em partes iguais (centavo na 1ª forma)", () => {
    const r = resolvePayments(145, { methods: ["dinheiro", "pix"], splitEqual: true, payments: { dinheiro: null, pix: null, cartao: null } });
    expect(r).toEqual({ ok: true, payments: { dinheiro: 72.5, pix: 72.5, cartao: 0 } });
    const r3 = resolvePayments(100, { methods: ["dinheiro", "pix", "cartao"], splitEqual: true, payments: { dinheiro: null, pix: null, cartao: null } });
    expect(r3).toEqual({ ok: true, payments: { dinheiro: 33.34, pix: 33.33, cartao: 33.33 } });
  });

  it("duas formas sem valor e sem 'metade' → pergunta", () => {
    expect(resolvePayments(100, { methods: ["dinheiro", "pix"], payments: { dinheiro: null, pix: null, cartao: null } })).toMatchObject({ ok: false, reason: "missing" });
  });

  it("valores que não fecham com o total", () => {
    const r = resolvePayments(140, { methods: ["pix"], payments: { pix: 100, dinheiro: null, cartao: null } });
    expect(r).toEqual({ ok: false, reason: "mismatch", sum: 100 });
  });

  it("sem forma de pagamento → pergunta", () => {
    expect(resolvePayments(140, { methods: [], payments: { pix: null, dinheiro: null, cartao: null } })).toMatchObject({ ok: false, reason: "missing" });
  });
});

describe("assistente da equipe — respostas", () => {
  it("sim / não / cancelar", () => {
    expect(isYes("Sim!")).toBe(true);
    expect(isYes("pode lançar")).toBe(true);
    expect(isYes("sim, mas troca a capinha")).toBe(false);
    expect(isNo("não")).toBe(true);
    expect(isCancel("Cancelar")).toBe(true);
  });

  it("formata reais", () => {
    expect(brl(1234.5)).toBe("R$ 1.234,50");
    expect(brl(40)).toBe("R$ 40,00");
  });

  it("resumo mostra itens, desconto, total e pagamento", () => {
    const t = saleSummary([{ id: "1", name: "Película ", qty: 2, price: 40 }], { subtotal: 80, discount: 5, total: 75 }, { dinheiro: 25, pix: 50, cartao: 0 }, "Ana");
    expect(t).toContain("2x Película — R$ 80,00");
    expect(t).toContain("Desconto: -R$ 5,00");
    expect(t).toContain("*Total: R$ 75,00*");
    expect(t).toContain("Dinheiro R$ 25,00 + Pix R$ 50,00");
    expect(t).toContain("Cliente: Ana");
    expect(t).toContain("SIM");
  });

  it("venda lançada lembra do comprovante só quando há Pix/cartão", () => {
    expect(saleDoneText({ total: 80, pending: ["Pix"] })).toContain("comprovante do *Pix*");
    expect(saleDoneText({ total: 80, pending: [] })).toContain("dinheiro já entrou confirmado");
  });

  it("relatório não mostra custo nem lucro", () => {
    const r: DayReport = {
      day: "2026-11-17", all: false, register: { opened_at: "x", opened_by: "Thayna" },
      sales: { count: 3, total: 180, by_method: { pix: 150, dinheiro: 30 } },
      os: { count: 1, total: 200, by_method: { cartao_credito: 200 } },
      pending: { count: 1, total: 150, items: [{ description: "PDV: 2x Película", amount: 150, method: "pix" }] },
    };
    const t = reportText(r, "Thayna", "Vila Eulália");
    expect(t).toContain("17/11/2026");
    expect(t).toContain("Suas vendas PDV (Thayna):* 3 · R$ 180,00");
    expect(t).toContain("OS recebidas na loja:* 1 · R$ 200,00");
    expect(t).toContain("Cartão: R$ 200,00");
    expect(t).toContain("Sem comprovante no caixa:* 1");
    expect(t).not.toMatch(/custo|lucro/i);
  });

  it("erro do banco vira texto útil; erro desconhecido não vaza detalhes", () => {
    expect(friendlyError("Nenhum caixa aberto na loja. Abra o caixa no sistema antes de lançar a venda.")).toContain("caixa aberto");
    expect(friendlyError("duplicate key value violates constraint xyz")).toContain("Nada foi gravado");
  });
});
