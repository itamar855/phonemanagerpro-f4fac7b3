import { describe, expect, it } from "vitest";
import {
  groupDevices, selectStock, stockLine, stockPromptLines, stockQueryText, type StockItem,
} from "../../../supabase/functions/_shared/stock-core";
import { buildSystemPrompt } from "../../../supabase/functions/_shared/ai-agent-core";

const VE = "ve", SL = "sl";
const dev = (o: Partial<StockItem>): StockItem => ({
  kind: "device", name: "iPhone 13", brand: "iPhone", model: null, color: null, capacity: null, condition: "used", battery: null,
  price: 3000, qty: 1, storeId: VE, storeName: "Vila Eulalia", ...o,
});
const acc = (o: Partial<StockItem>): StockItem => ({
  kind: "accessory", name: "Capinha case", brand: "Case", category: "capa", price: 20, qty: 14, storeId: VE, storeName: "Vila Eulalia", ...o,
});

const STOCK: StockItem[] = [
  dev({ name: "IPHONE 13 PRO MAX", capacity: "128GB", color: "DOURADO", battery: 84, price: 2950 }),
  dev({ name: "iPhone 13 pro", capacity: "256GB", color: "Azul", condition: "seminovo_americano", battery: 85, price: 2690 }),
  dev({ name: "IPHONE 12", capacity: "64GB", color: "PRETO AZULADO", condition: "seminovo_americano", battery: 76, price: null }),
  dev({ name: "GALAXY A01", brand: "Samsung", capacity: "32GB", color: "VERMELHO", battery: 100, price: 280 }),
  dev({ name: "Redmi note 12", brand: "Xiaomi", price: null, storeId: SL, storeName: "Santa Luzia" }),
  dev({ name: "iPhone 13", capacity: "128GB", color: "Rosa", price: 3100, storeId: SL, storeName: "Santa Luzia" }),
  acc({}),
  acc({ name: "Película cerâmica", brand: "Caramica", category: "pelicula", price: 40, qty: 22 }),
  acc({ name: "Cabo tipo c tipo c", brand: "Kaidi", category: "cabo", price: 30, qty: 20 }),
  // "S13" no código do cabo não pode aparecer quando pedem "iphone 13"
  acc({ name: "Cabo Usb V8( Pei: S13-1)", brand: "Peining", category: "cabo", price: null, qty: 2 }),
];

describe("IA consulta o estoque", () => {
  it("acha o modelo pedido e deixa de fora os outros", () => {
    const s = selectStock(STOCK, "oi, vocês têm iphone 13?", VE);
    expect(s.own.map((i) => i.name)).toEqual(["iPhone 13 pro", "IPHONE 13 PRO MAX"]);
    expect(s.own.some((i) => i.name === "IPHONE 12")).toBe(false);
    // na outra unidade também tem
    expect(s.others.map((i) => `${i.storeName}: ${i.name}`)).toEqual(["Santa Luzia: iPhone 13"]);
  });

  it("entende jeitos diferentes de escrever (capinha = capa, galaxy = samsung, redmi = xiaomi)", () => {
    expect(selectStock(STOCK, "quanto ta a capinha?", VE).own.map((i) => i.name)).toEqual(["Capinha case"]);
    expect(selectStock(STOCK, "tem galaxy a01?", VE).own.map((i) => i.name)).toEqual(["GALAXY A01"]);
    expect(selectStock(STOCK, "tem algum redmi?", VE).others.map((i) => i.name)).toEqual(["Redmi note 12"]);
  });

  it("pergunta geral por aparelho lista os aparelhos da loja; conversa sem produto não traz nada", () => {
    const g = selectStock(STOCK, "quais celulares vocês têm?", VE);
    expect(g.generic).toBe(true);
    expect(g.own.every((i) => i.kind === "device" && i.storeId === VE)).toBe(true);
    expect(g.own.length).toBe(4);
    expect(selectStock(STOCK, "bom dia, tudo bem?", VE)).toMatchObject({ own: [], others: [] });
  });

  it("linha do item: preço de venda, estado e bateria; sem preço = a confirmar; nome em maiúsculas fica legível", () => {
    expect(stockLine(STOCK[0])).toBe("- Iphone 13 Pro Max 128GB Dourado (usado, bateria 84%) · R$ 2.950");
    expect(stockLine(STOCK[2])).toBe("- Iphone 12 64GB Preto Azulado (seminovo (americano), bateria 76%) · preço a confirmar com vendas");
    expect(stockLine(STOCK[7])).toBe("- Película cerâmica · R$ 40 · 22 em estoque");
    expect(stockLine(STOCK[5], true)).toBe("- [Santa Luzia] iPhone 13 128GB Rosa (usado) · R$ 3.100");
  });

  it("aparelhos iguais viram uma linha com a quantidade", () => {
    const g = groupDevices([dev({ price: 3000 }), dev({ price: 3000 }), dev({ price: 3200 }), acc({})]);
    expect(g.length).toBe(3);
    expect(stockLine(g[0])).toContain("· 2 unidades");
  });

  it("monta o bloco do prompt e avisa quando nada bate", () => {
    const lines = stockPromptLines(selectStock(STOCK, "iphone 13", VE), "Vila Eulalia");
    expect(lines[0]).toBe("Na Vila Eulalia:");
    expect(lines.join("\n")).toContain("Em outra unidade da loja");
    expect(stockPromptLines(selectStock(STOCK, "tem fone bluetooth jbl?", VE), "Vila Eulalia")[0]).toMatch(/nenhum item do estoque parece/);
  });

  it("texto da busca: últimas mensagens do cliente (áudio transcrito conta) + memória", () => {
    const t = stockQueryText([
      { direction: "in", kind: "text", body: "oi" },
      { direction: "out", kind: "text", body: "Temos iPhone 11" },
      { direction: "in", kind: "audio", body: "[Áudio]", transcript: "queria ver o a54" },
    ], "Quer trocar o celular");
    expect(t).toContain("queria ver o a54");
    expect(t).not.toContain("Temos iPhone 11");
    expect(t).toContain("Quer trocar o celular");
  });

  it("com estoque, as instruções mudam: pode dizer que tem e o preço; sem estoque, regra antiga", () => {
    const base = { storeName: "Loja X", knowledge: "", persona: null, contactName: null, isCustomer: false, now: new Date(), openNow: true, hoursText: null, serviceOrders: [], handoffMessage: null };
    const withStock = buildSystemPrompt({ ...base, stock: ["Na Vila Eulalia:", "- Iphone 13 Pro 256GB Azul (usado, bateria 85%) · R$ 2.690"] });
    expect(withStock).toContain("ESTOQUE AGORA");
    expect(withStock).toContain("- Iphone 13 Pro 256GB Azul (usado, bateria 85%) · R$ 2.690");
    expect(withStock).toMatch(/NÃO diga que não tem/);
    expect(withStock).toMatch(/nunca reserve nem garanta/);
    expect(withStock).toMatch(/Preço de CONSERTO não está no estoque/);
    expect(withStock).not.toMatch(/Você NÃO sabe o estoque/);
    const without = buildSystemPrompt(base);
    expect(without).toMatch(/Você NÃO sabe o estoque/);
    expect(without).not.toContain("ESTOQUE AGORA");
  });
});
