import { describe, it, expect, beforeEach } from "vitest";
import {
  calculatePhonePatent,
  calculateAccessoryPatent,
  aggregatePhoneRanking,
  aggregateAccessoryRanking,
  PHONE_TIERS,
  ACCESSORY_TIERS,
  PATENT_CONFIGS,
  getPatentSettings,
  savePatentSettings,
  resetPatentSettings,
  type PhoneRuleTier,
  type AccessoryRuleTier,
} from "@/utils/rankingGamification";

describe("Sistema de Gamificação e Ranking — Trilha de Celulares", () => {
  it("deve atribuir Bronze para até 5 aparelhos com cálculo correto de progresso", () => {
    const p0 = calculatePhonePatent(0);
    expect(p0.currentTier).toBe("bronze");
    expect(p0.nextTier).toBe("prata");
    expect(p0.progressPercent).toBe(0);
    expect(p0.remainingValue).toBe(6);
    expect(p0.bonusUnlocked).toBe(0);

    const p3 = calculatePhonePatent(3);
    expect(p3.currentTier).toBe("bronze");
    expect(p3.nextTier).toBe("prata");
    expect(p3.progressPercent).toBe(50); // 3 de 6 = 50%
    expect(p3.remainingValue).toBe(3);
    expect(p3.bonusUnlocked).toBe(0);
  });

  it("deve atribuir Prata para 6 a 12 aparelhos com bônus de R$ 150", () => {
    const p6 = calculatePhonePatent(6);
    expect(p6.currentTier).toBe("prata");
    expect(p6.nextTier).toBe("ouro");
    expect(p6.bonusUnlocked).toBe(150);
    expect(p6.progressPercent).toBe(0); // 0 no intervalo 6..13
    expect(p6.remainingValue).toBe(7);

    const p9 = calculatePhonePatent(9);
    expect(p9.currentTier).toBe("prata");
    expect(p9.bonusUnlocked).toBe(150);
    expect(p9.remainingValue).toBe(4);
  });

  it("deve atribuir Ouro para 13 a 20 aparelhos com bônus de R$ 350 e comissão extra 0,5%", () => {
    const p13 = calculatePhonePatent(13);
    expect(p13.currentTier).toBe("ouro");
    expect(p13.nextTier).toBe("diamante");
    expect(p13.bonusUnlocked).toBe(350);
    expect(p13.extraCommissionPct).toBe(0.5);
    expect(p13.remainingValue).toBe(8); // 21 - 13

    const p20 = calculatePhonePatent(20);
    expect(p20.currentTier).toBe("ouro");
    expect(p20.bonusUnlocked).toBe(350);
    expect(p20.remainingValue).toBe(1);
  });

  it("deve atribuir Diamante para 21 ou mais aparelhos com bônus de R$ 700 e comissão extra 1%", () => {
    const p21 = calculatePhonePatent(21);
    expect(p21.currentTier).toBe("diamante");
    expect(p21.nextTier).toBeNull();
    expect(p21.progressPercent).toBe(100);
    expect(p21.bonusUnlocked).toBe(700);
    expect(p21.extraCommissionPct).toBe(1.0);
    expect(p21.remainingValue).toBe(0);

    const p35 = calculatePhonePatent(35);
    expect(p35.currentTier).toBe("diamante");
    expect(p35.bonusUnlocked).toBe(700);
  });
});

describe("Sistema de Gamificação e Ranking — Trilha de Acessórios", () => {
  it("deve atribuir Bronze para faturamento até R$ 2.500", () => {
    const p = calculateAccessoryPatent(1250);
    expect(p.currentTier).toBe("bronze");
    expect(p.nextTier).toBe("prata");
    expect(p.progressPercent).toBe(50);
    expect(p.remainingValue).toBe(1250);
    expect(p.bonusUnlocked).toBe(0);
  });

  it("deve atribuir Prata para faturamento entre R$ 2.501 e R$ 5.000 com bônus de R$ 100", () => {
    const p = calculateAccessoryPatent(3750);
    expect(p.currentTier).toBe("prata");
    expect(p.nextTier).toBe("ouro");
    expect(p.bonusUnlocked).toBe(100);
    expect(p.remainingValue).toBe(1250); // 5000 - 3750
  });

  it("deve atribuir Ouro para faturamento entre R$ 5.001 e R$ 8.000 com bônus de R$ 250", () => {
    const p = calculateAccessoryPatent(6500);
    expect(p.currentTier).toBe("ouro");
    expect(p.nextTier).toBe("diamante");
    expect(p.bonusUnlocked).toBe(250);
    expect(p.remainingValue).toBe(1500); // 8000 - 6500
  });

  it("deve atribuir Diamante para faturamento acima de R$ 8.000 com bônus de R$ 500", () => {
    const p = calculateAccessoryPatent(8500);
    expect(p.currentTier).toBe("diamante");
    expect(p.nextTier).toBeNull();
    expect(p.progressPercent).toBe(100);
    expect(p.bonusUnlocked).toBe(500);
  });
});

describe("Agregações de Ranking", () => {
  const mockProfiles = [
    { user_id: "user-v1", display_name: "Mariana Vendedora", role: "vendedor" },
    { user_id: "user-t1", display_name: "Carlos Técnico", role: "tecnico" },
  ];

  const mockStores = [
    { id: "store-1", name: "Matriz Centro" },
    { id: "store-2", name: "Shopping" },
  ];

  const mockRoles = [
    { user_id: "user-v1", role: "vendedor" },
    { user_id: "user-t1", role: "tecnico" },
  ];

  it("deve agregar ranking de celulares unificando vendedoras e técnicos", () => {
    const sales = [
      { id: "s1", created_by: "user-v1", store_id: "store-1", sale_price: 3500, has_trade_in: true, trade_in_value: 800 },
      { id: "s2", created_by: "user-v1", store_id: "store-1", sale_price: 4000, has_trade_in: false },
      { id: "s3", seller_id: "user-t1", created_by: "admin", store_id: "store-2", sale_price: 2800, has_trade_in: false },
    ];

    const ranked = aggregatePhoneRanking({
      sales,
      profiles: mockProfiles,
      stores: mockStores,
      userRoles: mockRoles,
    });

    expect(ranked.length).toBe(2);
    // Mariana tem 2 vendas -> 1º lugar
    expect(ranked[0].uid).toBe("user-v1");
    expect(ranked[0].qtdCelulares).toBe(2);
    expect(ranked[0].totalVendas).toBe(7500);
    expect(ranked[0].tradeInCount).toBe(1);
    expect(ranked[0].tradeInTotalValue).toBe(800);
    expect(ranked[0].ticketMedio).toBe(3750);
    expect(ranked[0].isTechnician).toBe(false);

    // Carlos Técnico tem 1 venda -> 2º lugar
    expect(ranked[1].uid).toBe("user-t1");
    expect(ranked[1].qtdCelulares).toBe(1);
    expect(ranked[1].totalVendas).toBe(2800);
    expect(ranked[1].isTechnician).toBe(true);
  });

  it("deve agregar ranking de acessórios por loja e apurar taxa de anexo", () => {
    const transactions = [
      {
        id: "tx1",
        type: "income",
        category: "acessorio",
        amount: 150,
        store_id: "store-1",
        created_by: "user-v1",
        metadata: { cart: [{ id: "acc1", qty: 2 }, { id: "acc2", qty: 1 }] }, // 3 peças
      },
      {
        id: "tx2",
        type: "income",
        category: "acessorio",
        amount: 80,
        store_id: "store-1",
        created_by: "user-v1",
        metadata: { cart: [{ id: "acc3", qty: 1 }] }, // 1 peça
      },
    ];

    const sales = [
      { id: "s1", store_id: "store-1", sale_price: 3000 },
      { id: "s2", store_id: "store-1", sale_price: 2500 },
    ];

    const { ranking, storeMetrics } = aggregateAccessoryRanking({
      transactions,
      sales,
      profiles: mockProfiles,
      stores: mockStores,
      userRoles: mockRoles,
      filterStoreId: "store-1",
    });

    expect(ranking.length).toBe(1);
    expect(ranking[0].totalFaturado).toBe(230);
    expect(ranking[0].qtdTransacoes).toBe(2);
    expect(ranking[0].qtdPecas).toBe(4);
    expect(ranking[0].ticketMedioTransacao).toBe(115);

    // Métrica da loja
    const storeMatriz = storeMetrics["store-1"];
    expect(storeMatriz.totalFaturado).toBe(230);
    expect(storeMatriz.qtdPecas).toBe(4);
    expect(storeMatriz.totalCelularesLoja).toBe(2);
    // Taxa de anexo: 4 peças / 2 celulares = 2.0 peças por aparelho
    expect(storeMatriz.taxaAnexo).toBe(2.0);
  });

  describe("Customização de Patentes e Metas pelo Painel Admin", () => {
    it("deve recalcular patentes de celulares quando o admin customizar as réguas e bônus", () => {
      const customPhoneTiers: PhoneRuleTier[] = [
        { tier: "bronze", minQty: 0, maxQty: 3, bonusReais: 0, extraCommissionPct: 0, description: "Bronze" },
        { tier: "prata", minQty: 4, maxQty: 9, bonusReais: 200, extraCommissionPct: 0, description: "Prata" },
        { tier: "ouro", minQty: 10, maxQty: 15, bonusReais: 500, extraCommissionPct: 1.5, description: "Ouro" },
        { tier: "diamante", minQty: 16, maxQty: null, bonusReais: 1000, extraCommissionPct: 2.5, description: "Diamante" },
      ];

      // Com a régua customizada: 4 celulares já é Prata com bônus de 200
      const p4 = calculatePhonePatent(4, customPhoneTiers);
      expect(p4.currentTier).toBe("prata");
      expect(p4.bonusUnlocked).toBe(200);

      // 10 celulares já é Ouro com bônus de 500 e 1.5% extra
      const p10 = calculatePhonePatent(10, customPhoneTiers);
      expect(p10.currentTier).toBe("ouro");
      expect(p10.bonusUnlocked).toBe(500);
      expect(p10.extraCommissionPct).toBe(1.5);

      // 16 celulares é Diamante com bônus de 1000 e 2.5% extra
      const p16 = calculatePhonePatent(16, customPhoneTiers);
      expect(p16.currentTier).toBe("diamante");
      expect(p16.bonusUnlocked).toBe(1000);
      expect(p16.extraCommissionPct).toBe(2.5);
    });

    it("deve recalcular patentes de acessórios quando o admin customizar os limites de faturamento", () => {
      const customAccessoryTiers: AccessoryRuleTier[] = [
        { tier: "bronze", minAmount: 0, maxAmount: 1500, bonusReais: 0, description: "Bronze" },
        { tier: "prata", minAmount: 1500.01, maxAmount: 3000, bonusReais: 150, description: "Prata" },
        { tier: "ouro", minAmount: 3000.01, maxAmount: 6000, bonusReais: 400, description: "Ouro" },
        { tier: "diamante", minAmount: 6000.01, maxAmount: null, bonusReais: 800, description: "Diamante" },
      ];

      // R$ 2.000 já atinge Prata na régua customizada
      const p2000 = calculateAccessoryPatent(2000, customAccessoryTiers);
      expect(p2000.currentTier).toBe("prata");
      expect(p2000.bonusUnlocked).toBe(150);

      // R$ 6.500 já atinge Diamante na régua customizada
      const p6500 = calculateAccessoryPatent(6500, customAccessoryTiers);
      expect(p6500.currentTier).toBe("diamante");
      expect(p6500.bonusUnlocked).toBe(800);
    });
  });
});
