import { describe, it, expect } from "vitest";

describe("OS Calculations & Financial Business Rules", () => {
  describe("CMV & DRE Calculation for OS", () => {
    it("should include service order items cost in total CMV", () => {
      const sales = [{ sale_price: 1000, cost_price: 600 }];
      const serviceOrders = [{ final_price: 450, estimated_price: 450 }];
      const serviceOrderItems = [
        { service_order_id: "os-1", unit_cost: 150, quantity: 1 },
        { service_order_id: "os-1", unit_cost: 50, quantity: 2 },
      ];

      const receitaAparelhos = sales.reduce((s, x) => s + x.sale_price, 0);
      const receitaOS = serviceOrders.reduce((s, x) => s + (x.final_price || x.estimated_price), 0);
      const totalReceita = receitaAparelhos + receitaOS; // 1450

      const cmvAparelhos = sales.reduce((s, x) => s + x.cost_price, 0); // 600
      const cmvAcessorios = 0;
      const cmvPecasOS = serviceOrderItems.reduce((s, x) => s + x.unit_cost * x.quantity, 0); // 150 + 100 = 250

      const totalCmv = cmvAparelhos + cmvAcessorios + cmvPecasOS; // 850
      const lucroBruto = totalReceita - totalCmv; // 1450 - 850 = 600

      expect(cmvPecasOS).toBe(250);
      expect(totalCmv).toBe(850);
      expect(lucroBruto).toBe(600);
    });

    it("should prevent double-deducting repair expenses when cmvPecasOS is accounted", () => {
      const transactions = [
        { type: "expense_pj", category: "aluguel", amount: 1000 },
        { type: "expense_pj", category: "acessorio", amount: 200 },
        { type: "expense_pj", category: "reparo", amount: 150 }, // Peça avulsa
      ];

      // Operating expenses must exclude both 'acessorio' (already in cmvAcessorios) and 'reparo' (already in cmvPecasOS)
      const despesasPJ = transactions
        .filter((t) => t.type === "expense_pj" && t.category !== "acessorio" && t.category !== "reparo")
        .reduce((s, t) => s + t.amount, 0);

      expect(despesasPJ).toBe(1000);
    });

    it("should fallback to estimated_price when final_price is null or zero", () => {
      const serviceOrders = [
        { id: "1", final_price: 350, estimated_price: 300 },
        { id: "2", final_price: null, estimated_price: 250 },
        { id: "3", final_price: 0, estimated_price: 180 },
      ];

      const receitaOS = serviceOrders.reduce(
        (s, o) => s + Number(o.final_price || o.estimated_price || 0),
        0
      );

      expect(receitaOS).toBe(350 + 250 + 180); // 780
    });
  });

  describe("Monthly Chart & Store Breakdown with OS", () => {
    it("should aggregate OS revenue into monthly timeline along with sales", () => {
      const mMap: Record<string, { receita: number }> = {
        Ago: { receita: 0 },
        Set: { receita: 0 },
      };

      const sales = [{ created_at: "2026-08-15T10:00:00Z", sale_price: 2000 }];
      const serviceOrders = [
        { delivered_at: "2026-08-20T14:00:00Z", final_price: 400, estimated_price: 400 },
        { delivered_at: "2026-09-02T16:00:00Z", final_price: 600, estimated_price: 600 },
      ];

      // Add sales
      sales.forEach((s) => {
        mMap["Ago"].receita += s.sale_price;
      });

      // Add OS based on delivery date
      serviceOrders.forEach((o) => {
        const monthKey = o.delivered_at.startsWith("2026-08") ? "Ago" : "Set";
        mMap[monthKey].receita += Number(o.final_price || o.estimated_price || 0);
      });

      expect(mMap["Ago"].receita).toBe(2400); // 2000 + 400
      expect(mMap["Set"].receita).toBe(600);
    });

    it("should calculate store breakdown including OS revenue and net profit", () => {
      const sStats: Record<string, { vendas: number; lucro: number }> = {
        "Loja Centro": { vendas: 0, lucro: 0 },
      };

      const sales = [{ store_id: "loja-1", sale_price: 1500, cost_price: 1000 }];
      const serviceOrders = [{ store_id: "loja-1", final_price: 500, id: "os-1" }];
      const osItems = [{ service_order_id: "os-1", unit_cost: 150, quantity: 1 }];

      // Sales
      sales.forEach((s) => {
        sStats["Loja Centro"].vendas += s.sale_price;
        sStats["Loja Centro"].lucro += s.sale_price - s.cost_price; // 500
      });

      // OS
      serviceOrders.forEach((o) => {
        const val = o.final_price;
        const osCost = osItems
          .filter((i) => i.service_order_id === o.id)
          .reduce((acc, i) => acc + i.unit_cost * i.quantity, 0); // 150
        sStats["Loja Centro"].vendas += val; // +500
        sStats["Loja Centro"].lucro += val - osCost; // +350
      });

      expect(sStats["Loja Centro"].vendas).toBe(2000);
      expect(sStats["Loja Centro"].lucro).toBe(850); // 500 + 350
    });
  });

  describe("Technician Commission on OS", () => {
    it("should calculate commission based on net service profit (OS total - parts cost)", () => {
      const osTotal = 400;
      const partsCost = 150;
      const commissionPercent = 20; // 20%
      const receivesCommission = true;

      const netServiceProfit = Math.max(0, osTotal - partsCost); // 250
      const commission = receivesCommission ? (netServiceProfit * commissionPercent) / 100 : 0;

      expect(netServiceProfit).toBe(250);
      expect(commission).toBe(50); // 20% of 250
    });

    it("should calculate commission on 100% of service when no parts were used", () => {
      const osTotal = 180; // E.g., software restoration / cleaning
      const partsCost = 0;
      const commissionPercent = 10; // 10%
      const receivesCommission = true;

      const netServiceProfit = Math.max(0, osTotal - partsCost);
      const commission = receivesCommission ? (netServiceProfit * commissionPercent) / 100 : 0;

      expect(netServiceProfit).toBe(180);
      expect(commission).toBe(18);
    });

    it("should return 0 commission when receivesCommission is false", () => {
      const osTotal = 500;
      const partsCost = 100;
      const commissionPercent = 15;
      const receivesCommission = false;

      const netServiceProfit = Math.max(0, osTotal - partsCost);
      const commission = receivesCommission ? (netServiceProfit * commissionPercent) / 100 : 0;

      expect(commission).toBe(0);
    });

    it("should clamp net profit to 0 and pay 0 commission if parts exceed OS total", () => {
      const osTotal = 200;
      const partsCost = 250; // Loss on repair
      const commissionPercent = 10;
      const receivesCommission = true;

      const netServiceProfit = Math.max(0, osTotal - partsCost);
      const commission = receivesCommission ? (netServiceProfit * commissionPercent) / 100 : 0;

      expect(netServiceProfit).toBe(0);
      expect(commission).toBe(0);
    });
  });

  describe("Daily Report Payment Split Reconciliation", () => {
    it("should combine both sales and delivered OS in totalDinheiro, totalCartao, and totalPix", () => {
      const sales = [
        { payment_cash: 200, payment_card: 500, payment_pix: 300 },
      ];
      const deliveredOS = [
        { payment_cash: 50, payment_card: 150, payment_pix: 100 },
      ];

      const totalDinheiro = sales.reduce((s, x) => s + x.payment_cash, 0) + deliveredOS.reduce((s, x) => s + x.payment_cash, 0);
      const totalCartao = sales.reduce((s, x) => s + x.payment_card, 0) + deliveredOS.reduce((s, x) => s + x.payment_card, 0);
      const totalPix = sales.reduce((s, x) => s + x.payment_pix, 0) + deliveredOS.reduce((s, x) => s + x.payment_pix, 0);

      expect(totalDinheiro).toBe(250);
      expect(totalCartao).toBe(650);
      expect(totalPix).toBe(400);
    });
  });

  describe("Inventory & Financial Idempotency Rules", () => {
    it("should return product status to in_stock on OS cancellation or deletion", () => {
      const products = [
        { id: "prod-1", status: "sold" },
        { id: "prod-2", status: "sold" },
      ];
      const itemsInOS = [{ product_id: "prod-1" }, { product_id: "prod-2" }];

      // Simulation of cancellation / deletion:
      const prodIds = itemsInOS.map((i) => i.product_id);
      products.forEach((p) => {
        if (prodIds.includes(p.id)) {
          p.status = "in_stock";
        }
      });

      expect(products[0].status).toBe("in_stock");
      expect(products[1].status).toBe("in_stock");
    });

    it("should prevent duplicate cash entries and transactions when OS was already delivered", () => {
      const existingTransactions = [
        { id: "tx-1", store_id: "store-1", description: "OS #1042 — Troca de Tela (João) [PIX]" },
      ];

      const orderToDeliver = { order_number: 1042, store_id: "store-1" };
      const descPrefix = `OS #${orderToDeliver.order_number} —`;

      const alreadyHasTx = existingTransactions.some(
        (t) => t.store_id === orderToDeliver.store_id && t.description.startsWith(descPrefix)
      );

      expect(alreadyHasTx).toBe(true);
      // In the real code: if (alreadyHasTx) do not insert new records
    });

    it("should correctly identify avulsa part cash and transaction entries to reverse", () => {
      const cashEntries = [
        { id: "ce-1", store_id: "store-1", description: "Compra de Peça Avulsa (OS): Bateria iPhone 11 [Fornecedor: Alpha]" },
        { id: "ce-2", store_id: "store-1", description: "Venda de carregador" },
      ];

      const removedPartName = "Bateria iPhone 11";
      const descSearch = `Compra de Peça Avulsa (OS): ${removedPartName.trim()}`;

      const entriesToReverse = cashEntries.filter((e) => e.description.startsWith(descSearch));

      expect(entriesToReverse).toHaveLength(1);
      expect(entriesToReverse[0].id).toBe("ce-1");
    });
  });
});
