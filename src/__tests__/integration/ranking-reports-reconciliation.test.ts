import { describe, it, expect, beforeEach } from "vitest";
import {
  aggregatePhoneRanking,
  aggregateAccessoryRanking,
  calculatePhonePatent,
  calculateAccessoryPatent,
  getPatentSettings,
  savePatentSettings,
  resetPatentSettings,
  type PhoneRuleTier,
  type AccessoryRuleTier,
} from "@/utils/rankingGamification";
import { getPeriodDates, getPeriodLabel } from "@/components/features/relatorios/types";

describe("Suíte Geral de Conciliação — Ranking, Metas & Relatórios Oficiais", () => {
  const mockStores = [
    { id: "store-matriz", name: "Matriz Centro" },
    { id: "store-filial", name: "Filial Shopping" },
  ];

  const mockProfiles = [
    { user_id: "user-vendedora-1", display_name: "Mariana Vendas" },
    { user_id: "user-vendedora-2", display_name: "Camila Vendas" },
    { user_id: "user-tecnico-1", display_name: "Carlos Técnico" },
  ];

  const mockUserRoles = [
    { user_id: "user-vendedora-1", role: "vendedor", commission_sales_percent: 3 },
    { user_id: "user-vendedora-2", role: "vendedor", commission_sales_percent: 2.5 },
    { user_id: "user-tecnico-1", role: "tecnico", commission_sales_percent: 2 },
  ];

  const mockProducts = [
    { id: "prod-iphone-13", name: "iPhone 13 128GB", cost_price: 2800 },
    { id: "prod-iphone-14", name: "iPhone 14 128GB", cost_price: 3600 },
    { id: "prod-samsung-s23", name: "Galaxy S23", cost_price: 2400 },
  ];

  const productMap = new Map<string, any>(mockProducts.map((p) => [p.id, p]));

  beforeEach(() => {
    resetPatentSettings();
  });

  describe("1. Conciliação de Vendas & Faturamento (Ranking vs. DRE vs. Relatório de Vendas)", () => {
    it("deve garantir que o faturamento de celulares e o volume de unidades no Ranking batem com a Receita de Aparelhos do DRE", () => {
      const sales = [
        {
          id: "sale-1",
          store_id: "store-matriz",
          seller_id: "user-vendedora-1",
          created_by: "user-vendedora-1",
          product_id: "prod-iphone-13",
          sale_price: 3800,
          commission_value: 114, // 3% de 3800
          created_at: "2026-10-15T10:00:00Z",
        },
        {
          id: "sale-2",
          store_id: "store-matriz",
          seller_id: "user-vendedora-1",
          created_by: "user-vendedora-1",
          product_id: "prod-iphone-14",
          sale_price: 4500,
          commission_value: 135, // 3% de 4500
          created_at: "2026-10-16T14:30:00Z",
        },
        {
          id: "sale-3",
          store_id: "store-filial",
          seller_id: "user-vendedora-2",
          created_by: "user-vendedora-2",
          product_id: "prod-samsung-s23",
          sale_price: 3200,
          commission_value: 80, // 2.5% de 3200
          created_at: "2026-10-17T11:00:00Z",
        },
        {
          id: "sale-4",
          store_id: "store-matriz",
          seller_id: "user-tecnico-1",
          created_by: "user-tecnico-1",
          product_id: "prod-iphone-13",
          sale_price: 3700,
          commission_value: 74, // 2% de 3700
          created_at: "2026-10-18T16:00:00Z",
        },
      ];

      // Cálculo como feito no DRE
      const dreReceitaAparelhos = sales.reduce((acc, s) => acc + Number(s.sale_price), 0);
      const dreQtdAparelhos = sales.length;

      // Cálculo pelo motor de Ranking
      const ranking = aggregatePhoneRanking({
        sales,
        profiles: mockProfiles,
        stores: mockStores,
        userRoles: mockUserRoles,
        productMap,
      });

      const rankingTotalVendas = ranking.reduce((acc, r) => acc + r.totalVendas, 0);
      const rankingQtdAparelhos = ranking.reduce((acc, r) => acc + r.qtdCelulares, 0);

      // Conciliação exata
      expect(rankingTotalVendas).toBe(dreReceitaAparelhos);
      expect(rankingTotalVendas).toBe(15200); // 3800 + 4500 + 3200 + 3700
      expect(rankingQtdAparelhos).toBe(dreQtdAparelhos);
      expect(rankingQtdAparelhos).toBe(4);
    });
  });

  describe("2. Conciliação de Lucro & CMV (Preço de Venda - Custo)", () => {
    it("deve apurar exatamente o mesmo CMV e Lucro Bruto no DRE, no Relatório de Vendas e no Ranking", () => {
      const sales = [
        {
          id: "s1",
          store_id: "store-matriz",
          created_by: "user-vendedora-1",
          product_id: "prod-iphone-13", // Venda 3800, Custo 2800 -> Lucro 1000
          sale_price: 3800,
          commission_value: 114,
        },
        {
          id: "s2",
          store_id: "store-matriz",
          created_by: "user-vendedora-1",
          product_id: "prod-iphone-14", // Venda 4500, Custo 3600 -> Lucro 900
          sale_price: 4500,
          commission_value: 135,
        },
      ];

      // DRE
      const totalReceita = sales.reduce((acc, s) => acc + s.sale_price, 0);
      const cmvAparelhos = sales.reduce((acc, s) => acc + productMap.get(s.product_id).cost_price, 0);
      const lucroBrutoDRE = totalReceita - cmvAparelhos;

      // Ranking
      const ranking = aggregatePhoneRanking({
        sales,
        profiles: mockProfiles,
        stores: mockStores,
        userRoles: mockUserRoles,
        productMap,
      });

      expect(cmvAparelhos).toBe(6400); // 2800 + 3600
      expect(lucroBrutoDRE).toBe(1900); // 1000 + 900
      expect(ranking[0].totalLucro).toBe(lucroBrutoDRE);
      expect(ranking[0].totalVendas).toBe(totalReceita);
    });
  });

  describe("3. Conciliação de Comissões (Ranking vs. Comissões da Equipe)", () => {
    it("deve manter a comissão base de vendas idêntica à cadastrada no painel da equipe", () => {
      const sales = [
        {
          id: "s1",
          store_id: "store-matriz",
          created_by: "user-vendedora-1",
          product_id: "prod-iphone-13",
          sale_price: 4000,
          commission_value: 120, // 3%
        },
        {
          id: "s2",
          store_id: "store-matriz",
          created_by: "user-vendedora-1",
          product_id: "prod-iphone-14",
          sale_price: 5000,
          commission_value: 150, // 3%
        },
      ];

      const ranking = aggregatePhoneRanking({
        sales,
        profiles: mockProfiles,
        stores: mockStores,
        userRoles: mockUserRoles,
        productMap,
      });

      // A soma das comissões no ranking deve bater centavo por centavo com as comissões apuradas
      expect(ranking[0].comissoesVendas).toBe(270); // 120 + 150
      // Vendeu 2 aparelhos -> Patente Bronze (não atingiu Prata ainda)
      expect(ranking[0].patent.currentTier).toBe("bronze");
      expect(ranking[0].patent.bonusUnlocked).toBe(0);
    });
  });

  describe("4. Conciliação da Trilha de Acessórios & Taxa de Anexo", () => {
    it("deve conciliar o faturamento de acessórios e calcular a taxa de anexo exata por loja", () => {
      const transactions = [
        {
          id: "tx-1",
          store_id: "store-matriz",
          type: "income",
          category: "acessorio",
          amount: 150,
          created_by: "user-vendedora-1",
          metadata: { cart: [{ id: "acc1", qty: 2 }, { id: "acc2", qty: 1 }] }, // 3 peças
        },
        {
          id: "tx-2",
          store_id: "store-matriz",
          type: "income",
          category: "acessorio",
          amount: 80,
          created_by: "user-vendedora-1",
          metadata: { cart: [{ id: "acc3", qty: 1 }] }, // 1 peça
        },
        {
          id: "tx-3",
          store_id: "store-filial",
          type: "income",
          category: "acessorio",
          amount: 120,
          created_by: "user-vendedora-2",
          metadata: { cart: [{ id: "acc4", qty: 2 }] }, // 2 peças
        },
      ];

      const sales = [
        { id: "s1", store_id: "store-matriz", sale_price: 3000 },
        { id: "s2", store_id: "store-matriz", sale_price: 3500 },
      ];

      // DRE: Soma de transactions tipo income, categoria acessorio
      const dreReceitaAcessorios = transactions.reduce((acc, t) => acc + t.amount, 0);

      const { ranking, storeMetrics } = aggregateAccessoryRanking({
        transactions,
        sales,
        profiles: mockProfiles,
        stores: mockStores,
        userRoles: mockUserRoles,
        filterStoreId: "all",
      });

      const rankingFaturadoAcessorios = ranking.reduce((acc, r) => acc + r.totalFaturado, 0);

      // Conciliação de faturamento
      expect(rankingFaturadoAcessorios).toBe(dreReceitaAcessorios);
      expect(rankingFaturadoAcessorios).toBe(350); // 150 + 80 + 120

      // Taxa de Anexo na Matriz:
      // Total de peças vendidas na Matriz = 3 + 1 = 4 peças
      // Total de celulares vendidos na Matriz = 2
      // Taxa de anexo = 4 peças / 2 celulares = 2.0x
      expect(storeMetrics["store-matriz"].qtdPecas).toBe(4);
      expect(storeMetrics["store-matriz"].totalCelularesLoja).toBe(2);
      expect(storeMetrics["store-matriz"].taxaAnexo).toBe(2.0);
    });
  });

  describe("5. Dedução Atômica de Vendas Canceladas (Estornos no Caixa)", () => {
    it("deve deduzir imediatamente do volume, faturamento e lucro quando uma venda for cancelada", () => {
      const sale1 = {
        id: "sale-ok",
        store_id: "store-matriz",
        created_by: "user-vendedora-1",
        product_id: "prod-iphone-13",
        sale_price: 3800,
        commission_value: 114,
      };

      const sale2 = {
        id: "sale-cancelada",
        store_id: "store-matriz",
        created_by: "user-vendedora-1",
        product_id: "prod-iphone-14",
        sale_price: 4500,
        commission_value: 135,
      };

      // Estado 1: 2 vendas ativas
      const rankingAntes = aggregatePhoneRanking({
        sales: [sale1, sale2],
        profiles: mockProfiles,
        stores: mockStores,
        userRoles: mockUserRoles,
        productMap,
      });

      expect(rankingAntes[0].qtdCelulares).toBe(2);
      expect(rankingAntes[0].totalVendas).toBe(8300);
      expect(rankingAntes[0].comissoesVendas).toBe(249);

      // Estado 2: Venda 2 é cancelada (simula DELETE FROM sales)
      const salesAposCancelamento = [sale1];

      const rankingDepois = aggregatePhoneRanking({
        sales: salesAposCancelamento,
        profiles: mockProfiles,
        stores: mockStores,
        userRoles: mockUserRoles,
        productMap,
      });

      expect(rankingDepois[0].qtdCelulares).toBe(1);
      expect(rankingDepois[0].totalVendas).toBe(3800);
      expect(rankingDepois[0].comissoesVendas).toBe(114);
      expect(rankingDepois[0].totalLucro).toBe(1000); // 3800 - 2800
    });
  });

  describe("6. Conciliação Histórica de Períodos ('Este Mês' vs. 'Mês Passado')", () => {
    it("deve garantir limites de corte exatos e não sobrepostos entre Este Mês e Mês Passado", () => {
      const datesThisMonth = getPeriodDates("month", "", "");
      const datesLastMonth = getPeriodDates("last_month", "", "");

      const startThis = new Date(datesThisMonth.start);
      const endLast = new Date(datesLastMonth.end);

      // O início deste mês deve ser o dia 1º
      expect(startThis.getDate()).toBe(1);

      // O fim do mês passado deve ser anterior ou contíguo ao início deste mês (sem sobreposição)
      expect(endLast.getTime()).toBeLessThan(startThis.getTime());

      // Label do mês passado deve conter o sufixo explicativo
      const labelLast = getPeriodLabel("last_month", "", "");
      expect(labelLast).toContain("Mês Passado");
    });
  });

  describe("7. Integridade da Customização do Admin (Metas & Patentes)", () => {
    it("deve aplicar metas e comissões extras personalizadas pelo admin mantendo conciliação", () => {
      // Admin customiza para meta menor: 5 aparelhos já é Ouro com 1% extra
      const customPhoneTiers: PhoneRuleTier[] = [
        { tier: "bronze", minQty: 0, maxQty: 2, bonusReais: 0, extraCommissionPct: 0, description: "Bronze" },
        { tier: "prata", minQty: 3, maxQty: 4, bonusReais: 200, extraCommissionPct: 0, description: "Prata" },
        { tier: "ouro", minQty: 5, maxQty: 8, bonusReais: 450, extraCommissionPct: 1.0, description: "Ouro" },
        { tier: "diamante", minQty: 9, maxQty: null, bonusReais: 900, extraCommissionPct: 2.0, description: "Diamante" },
      ];

      savePatentSettings({
        phoneTiers: customPhoneTiers,
        accessoryTiers: getPatentSettings().accessoryTiers,
      });

      const p5 = calculatePhonePatent(5, customPhoneTiers);
      expect(p5.currentTier).toBe("ouro");
      expect(p5.bonusUnlocked).toBe(450);
      expect(p5.extraCommissionPct).toBe(1.0);
    });
  });
});
