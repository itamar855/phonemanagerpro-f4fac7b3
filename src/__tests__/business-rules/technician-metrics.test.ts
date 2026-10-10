import { describe, it, expect } from "vitest";
import {
  calculateProjectedCommission,
  calculateTechProductivity,
  calculateTechTimeline,
  calculateTechGoalsProgress,
  calculateTechShopRanking,
  PROJECTED_COMMISSION_STATUSES,
} from "../../utils/technicianMetrics";

describe("Módulo de Produtividade, SLA e Metas do Técnico (technicianMetrics.ts)", () => {
  const roleTecnico = {
    role: "tecnico",
    commission_on_services: true,
    commission_services_percent: 20, // 20% sobre lucro bruto
  };

  const techId = "tech-uuid-1";

  // ─── 1. COMISSÃO PROJETADA COM STATUS ELEGÍVEIS ─────────────────────────────
  describe("1. Comissão Projetada (Ganhos em Potencial na Bancada)", () => {
    it("inclui ordens em 'repairing', 'ready' e 'waiting_approval' com valor", () => {
      const activeOrders = [
        { id: "1", technician_id: techId, status: "repairing", final_price: 300 }, // 300 * 20% = 60
        { id: "2", technician_id: techId, status: "ready", final_price: 500 }, // 500 * 20% = 100
        { id: "3", technician_id: techId, status: "waiting_approval", estimated_price: 200 }, // 200 * 20% = 40
      ];

      const projected = calculateProjectedCommission(activeOrders, [], roleTecnico, techId);
      expect(projected).toBe(200); // 60 + 100 + 40
    });

    it("deduz custo de peças vinculadas da comissão projetada", () => {
      const activeOrders = [
        { id: "os-peca", technician_id: techId, status: "repairing", final_price: 400 },
      ];
      const parts = [
        { service_order_id: "os-peca", unit_cost: 100, quantity: 1 }, // Custo peça 100 -> Margem 300
      ];

      const projected = calculateProjectedCommission(activeOrders, parts, roleTecnico, techId);
      // 20% de 300 = 60
      expect(projected).toBe(60);
    });

    it("EXCLUI ordens canceladas da comissão projetada", () => {
      const orders = [
        { id: "1", technician_id: techId, status: "cancelled", final_price: 500 },
      ];

      const projected = calculateProjectedCommission(orders, [], roleTecnico, techId);
      expect(projected).toBe(0);
    });

    it("EXCLUI ordens de outros técnicos ou sem técnico", () => {
      const orders = [
        { id: "1", technician_id: "tech-uuid-2", status: "repairing", final_price: 500 },
        { id: "2", technician_id: null, status: "repairing", final_price: 500 },
      ];

      const projected = calculateProjectedCommission(orders, [], roleTecnico, techId);
      expect(projected).toBe(0);
    });

    it("PROJECTED_COMMISSION_STATUSES contém apenas status elegíveis", () => {
      expect(PROJECTED_COMMISSION_STATUSES).toEqual(["repairing", "ready", "waiting_approval"]);
    });
  });

  // ─── 2. PRODUTIVIDADE, SLA E TAXA DE SUCESSO ──────────────────────────────
  describe("2. Produtividade Técnica e SLA", () => {
    const sampleOrders = [
      {
        id: "os-1",
        technician_id: techId,
        status: "delivered",
        created_at: "2026-10-01T10:00:00.000Z",
        delivered_at: "2026-10-03T10:00:00.000Z", // 2 dias
        final_price: 400,
      },
      {
        id: "os-2",
        technician_id: techId,
        status: "delivered",
        created_at: "2026-10-02T10:00:00.000Z",
        delivered_at: "2026-10-06T10:00:00.000Z", // 4 dias
        final_price: 600,
      },
      {
        id: "os-3",
        technician_id: techId,
        status: "cancelled",
        created_at: "2026-10-05T10:00:00.000Z",
      },
      {
        id: "os-4",
        technician_id: techId,
        status: "repairing",
        created_at: "2026-10-07T10:00:00.000Z",
        final_price: 350,
      },
    ];

    it("calcula taxa de sucesso (% reparadas vs canceladas)", () => {
      const metrics = calculateTechProductivity(sampleOrders, [], roleTecnico, techId);
      // 2 entregues, 1 cancelada = 2/3 = 67%
      expect(metrics.totalDelivered).toBe(2);
      expect(metrics.totalCancelled).toBe(1);
      expect(metrics.successRate).toBe(67);
    });

    it("calcula lead time médio da OS em dias", () => {
      const metrics = calculateTechProductivity(sampleOrders, [], roleTecnico, techId);
      // OS 1 = 2 dias, OS 2 = 4 dias. Média = (2 + 4) / 2 = 3.0 dias
      expect(metrics.avgTotalLeadTimeDays).toBe(3);
      expect(metrics.avgBenchTimeDays).toBeGreaterThan(0);
    });

    it("calcula comissão realizada e projetada simultaneamente", () => {
      const metrics = calculateTechProductivity(sampleOrders, [], roleTecnico, techId);
      // Entregues: OS 1 (400) + OS 2 (600) = 1000. 20% de 1000 = 200
      expect(metrics.realizedCommission).toBe(200);
      expect(metrics.totalLaborRevenue).toBe(1000);
      expect(metrics.ticketMedioLabor).toBe(500);
      // Projetada em bancada: OS 4 (350 * 20%) = 70
      expect(metrics.projectedCommission).toBe(70);
      expect(metrics.totalActiveInBench).toBe(1);
    });
  });

  // ─── 3. METAS E GAMIFICAÇÃO ───────────────────────────────────────────────
  describe("3. Metas do Técnico e Gamificação", () => {
    it("calcula progresso percentual e status de metas", () => {
      const goals = { targetOrders: 50, targetCommission: 3000 };
      const currentOrders = 32;
      const currentCommission = 2400;

      const progress = calculateTechGoalsProgress(currentOrders, currentCommission, goals);

      expect(progress.ordersTarget).toBe(50);
      expect(progress.ordersCurrent).toBe(32);
      expect(progress.ordersPct).toBe(64); // 32 / 50 = 64%

      expect(progress.commissionTarget).toBe(3000);
      expect(progress.commissionCurrent).toBe(2400);
      expect(progress.commissionPct).toBe(80); // 2400 / 3000 = 80%

      expect(progress.isOrdersAchieved).toBe(false);
      expect(progress.isCommissionAchieved).toBe(false);
    });

    it("identifica meta atingida quando o valor alcança ou ultrapassa o alvo", () => {
      const goals = { targetOrders: 20, targetCommission: 1500 };
      const progress = calculateTechGoalsProgress(25, 1800, goals);

      expect(progress.ordersPct).toBe(100);
      expect(progress.commissionPct).toBe(100);
      expect(progress.isOrdersAchieved).toBe(true);
      expect(progress.isCommissionAchieved).toBe(true);
    });
  });

  // ─── 4. RANKING DA EQUIPE DA LOJA ─────────────────────────────────────────
  describe("4. Ranking da Equipe Técnica da Loja", () => {
    const profileMap = new Map([
      ["tech-1", "Carlos Silva"],
      ["tech-2", "Marcos Rocha"],
    ]);

    const shopOrders = [
      { id: "1", technician_id: "tech-1", final_price: 300 },
      { id: "2", technician_id: "tech-1", final_price: 400 },
      { id: "3", technician_id: "tech-2", final_price: 500 },
    ];

    it("classifica técnicos por volume de OS entregues e identifica posição do usuário", () => {
      const ranking = calculateTechShopRanking(shopOrders, profileMap, "tech-1");

      expect(ranking.items.length).toBe(2);
      expect(ranking.items[0].techId).toBe("tech-1");
      expect(ranking.items[0].deliveredOrders).toBe(2);
      expect(ranking.items[0].rank).toBe(1);
      expect(ranking.items[0].isMe).toBe(true);

      expect(ranking.myRank).toBe(1);
      expect(ranking.totalTechs).toBe(2);
    });
  });

  // ─── 5. TIMELINE TEMPORAL (GRÁFICO) ───────────────────────────────────────
  describe("5. Timeline Temporal para Gráficos", () => {
    it("agrupa ordens e comissões por data ordenadas", () => {
      const deliveredOrders = [
        { id: "1", status: "delivered", technician_id: "tech-1", created_at: "2026-10-02T10:00:00.000Z", delivered_at: "2026-10-02T14:00:00.000Z", final_price: 300 },
        { id: "2", status: "delivered", technician_id: "tech-1", created_at: "2026-10-02T11:00:00.000Z", delivered_at: "2026-10-02T16:00:00.000Z", final_price: 200 },
        { id: "3", status: "delivered", technician_id: "tech-1", created_at: "2026-10-05T09:00:00.000Z", delivered_at: "2026-10-05T15:00:00.000Z", final_price: 500 },
      ];

      const timeline = calculateTechTimeline(deliveredOrders, [], roleTecnico);

      expect(timeline.length).toBe(2);
      expect(timeline[0].date).toBe("2026-10-02");
      expect(timeline[0].orders).toBe(2);
      expect(timeline[0].commission).toBe(100); // 20% de (300 + 200)

      expect(timeline[1].date).toBe("2026-10-05");
      expect(timeline[1].orders).toBe(1);
      expect(timeline[1].commission).toBe(100); // 20% de 500
    });
  });
});
