import { describe, it, expect } from "vitest";
import {
  calculateOSItemMetrics,
  filterOSByDateMode,
  isOrderOnBench,
  BENCH_ACTIVE_STATUSES,
  resolveTechnicianIdOnUpdate,
  resolveTechnicianIdOnCreate,
  type OSItemPart,
  type UserRoleData,
} from "../../utils/osCalculations";
import {
  OS_STATUS_CONFIG,
  getStatusLabel,
  getStatusColor,
  ALL_OS_STATUSES,
} from "../../utils/osStatus";

describe("Módulo do Técnico e Relatórios — Regras de Negócio e Salvaguardas", () => {
  // ─── 1. ROLES & PERMISSIONS (Admin, Gerente, Vendedor, Técnico) ───────────
  describe("1. Roles e Permissões Padrão", () => {
    const defaultPermissions = (role: string) => {
      switch (role) {
        case "admin":
          return ["dashboard", "vendas", "estoque", "os", "clientes", "caixa", "relatorios", "usuarios", "transacoes", "leads", "fornecedores"];
        case "gerente":
          return ["dashboard", "vendas", "estoque", "os", "clientes", "caixa", "relatorios", "transacoes", "leads", "fornecedores"];
        case "vendedor":
          return ["vendas", "os", "clientes", "caixa"];
        case "tecnico":
          return ["os", "clientes", "dashboard"];
        default:
          return ["vendas", "clientes"];
      }
    };

    it("técnico deve possuir por padrão apenas OS, clientes e dashboard", () => {
      const tecnicoPerms = defaultPermissions("tecnico");
      expect(tecnicoPerms).toContain("os");
      expect(tecnicoPerms).toContain("clientes");
      expect(tecnicoPerms).toContain("dashboard");

      // Salvaguarda 3: Técnico NÃO deve receber estoque administrativo nem caixa por padrão
      expect(tecnicoPerms).not.toContain("estoque");
      expect(tecnicoPerms).not.toContain("caixa");
      expect(tecnicoPerms).not.toContain("relatorios");
      expect(tecnicoPerms).not.toContain("transacoes");
    });

    it("admin e gerente possuem permissões administrativas completas", () => {
      const adminPerms = defaultPermissions("admin");
      const gerentePerms = defaultPermissions("gerente");

      expect(adminPerms).toContain("estoque");
      expect(adminPerms).toContain("relatorios");
      expect(gerentePerms).toContain("estoque");
      expect(gerentePerms).toContain("relatorios");
    });

    it("vendedor não deve possuir permissão para relatórios ou estoque administrativo", () => {
      const vendedorPerms = defaultPermissions("vendedor");
      expect(vendedorPerms).toContain("vendas");
      expect(vendedorPerms).not.toContain("relatorios");
      expect(vendedorPerms).not.toContain("estoque");
    });
  });

  // ─── 2. OS COM TÉCNICO VS SEM TÉCNICO ──────────────────────────────────────
  describe("2. Comissão: OS com Técnico vs OS sem Técnico", () => {
    const roleTecnico: UserRoleData = {
      role: "tecnico",
      commission_on_services: true,
      commission_services_percent: 20, // 20% sobre o Lucro Bruto da OS
    };

    const parts: OSItemPart[] = [
      { service_order_id: "os-1", unit_cost: 100, quantity: 1 },
      { service_order_id: "os-1", unit_cost: 50, quantity: 1 },
    ]; // Custo total de peças = 150

    it("deve calcular comissão para o técnico quando houver technician_id atribuído", () => {
      const osComTecnico = {
        status: "delivered",
        final_price: 500,
        technician_id: "tech-123",
      };

      const metrics = calculateOSItemMetrics(osComTecnico, parts, roleTecnico);

      expect(metrics.receitaOS).toBe(500);
      expect(metrics.custoPecas).toBe(150);
      // Salvaguarda 2: Margem da OS / Lucro Bruto da OS = Receita - Peças (500 - 150 = 350)
      expect(metrics.lucroBrutoOS).toBe(350);
      // Comissão de 20% sobre 350 = 70
      expect(metrics.comissaoTecnico).toBe(70);
    });

    it("NÃO deve gerar comissão se technician_id for nulo (sem técnico)", () => {
      const osSemTecnico = {
        status: "delivered",
        final_price: 500,
        technician_id: null,
      };

      const metrics = calculateOSItemMetrics(osSemTecnico, parts, roleTecnico);

      expect(metrics.receitaOS).toBe(500);
      expect(metrics.custoPecas).toBe(150);
      expect(metrics.lucroBrutoOS).toBe(350);
      // Salvaguarda 1: Sem técnico = 0 comissão técnica (não transfere para created_by)
      expect(metrics.comissaoTecnico).toBe(0);
    });

    it("deve zerar comissão caso commission_on_services seja falso", () => {
      const roleSemComissao: UserRoleData = {
        role: "tecnico",
        commission_on_services: false,
        commission_services_percent: 20,
      };

      const osComTecnico = {
        status: "delivered",
        final_price: 500,
        technician_id: "tech-123",
      };

      const metrics = calculateOSItemMetrics(osComTecnico, parts, roleSemComissao);
      expect(metrics.comissaoTecnico).toBe(0);
    });
  });

  // ─── 3. STATUS DA OS: ENTREGUE VS CANCELADA ────────────────────────────────
  describe("3. Status da OS: Entregue vs Cancelada", () => {
    const roleTecnico: UserRoleData = {
      role: "tecnico",
      commission_on_services: true,
      commission_services_percent: 15,
    };

    const parts: OSItemPart[] = [
      { service_order_id: "os-1", unit_cost: 80, quantity: 2 }, // 160
    ];

    it("OS entregue gera receita, margem bruta e comissão", () => {
      const osEntregue = {
        status: "delivered",
        final_price: 600,
        technician_id: "tech-1",
      };

      const metrics = calculateOSItemMetrics(osEntregue, parts, roleTecnico);

      expect(metrics.receitaOS).toBe(600);
      expect(metrics.custoPecas).toBe(160);
      expect(metrics.lucroBrutoOS).toBe(440); // 600 - 160
      expect(metrics.comissaoTecnico).toBe(66); // 15% de 440
    });

    it("OS cancelada tem receita ZERO, margem ZERO e comissão ZERO", () => {
      const osCancelada = {
        status: "cancelled",
        final_price: 600,
        technician_id: "tech-1",
      };

      const metrics = calculateOSItemMetrics(osCancelada, parts, roleTecnico);

      expect(metrics.receitaOS).toBe(0);
      expect(metrics.custoPecas).toBe(160);
      expect(metrics.lucroBrutoOS).toBe(0);
      expect(metrics.comissaoTecnico).toBe(0);
    });

    it("OS ainda em andamento (não entregue) não gera comissão nem receita de conclusão", () => {
      const osEmReparo = {
        status: "repairing",
        final_price: 600,
        estimated_price: 600,
        technician_id: "tech-1",
      };

      const metrics = calculateOSItemMetrics(osEmReparo, parts, roleTecnico);

      expect(metrics.comissaoTecnico).toBe(0);
    });
  });

  // ─── 4. SEMÂNTICA DE DATAS (ENTRADA VS ENTREGA) ───────────────────────────
  describe("4. Semântica de Datas em Relatórios (Salvaguarda 4)", () => {
    const sampleOrders = [
      {
        id: "os-setembro-outubro",
        order_number: 101,
        status: "delivered",
        created_at: "2026-09-15T10:00:00.000Z", // Entrada em Setembro
        delivered_at: "2026-10-02T14:30:00.000Z", // Entrega em Outubro
        final_price: 400,
      },
      {
        id: "os-outubro-aberta",
        order_number: 102,
        status: "repairing",
        created_at: "2026-10-01T09:00:00.000Z", // Entrada em Outubro
        delivered_at: null, // Ainda em bancada
        estimated_price: 300,
      },
      {
        id: "os-outubro-concluida",
        order_number: 103,
        status: "delivered",
        created_at: "2026-10-01T11:00:00.000Z", // Entrada em Outubro
        delivered_at: "2026-10-03T16:00:00.000Z", // Entrega em Outubro
        final_price: 550,
      },
    ];

    const outubroStart = "2026-10-01T00:00:00.000Z";
    const outubroEnd = "2026-10-31T23:59:59.000Z";

    it("modo 'entry' (Data de Entrada) filtra pelo created_at (volume de recebidas)", () => {
      const entradasOutubro = filterOSByDateMode(sampleOrders, "entry", outubroStart, outubroEnd);

      // Deve incluir 102 e 103 (entradas em outubro), mas excluir 101 (entrada em setembro)
      expect(entradasOutubro.map((o) => o.order_number)).toEqual([102, 103]);
      expect(entradasOutubro.length).toBe(2);
    });

    it("modo 'delivery' (Data de Entrega) filtra pelo delivered_at (produtividade/receita)", () => {
      const entregasOutubro = filterOSByDateMode(sampleOrders, "delivery", outubroStart, outubroEnd);

      // Deve incluir 101 (entregue em out) e 103 (entregue em out), excluindo 102 (ainda não entregue)
      expect(entregasOutubro.map((o) => o.order_number)).toEqual([101, 103]);
      expect(entregasOutubro.length).toBe(2);

      const faturamentoEntregas = entregasOutubro.reduce((s, o) => s + (o.final_price || 0), 0);
      expect(faturamentoEntregas).toBe(400 + 550); // 950
    });
  });

  // ─── 5. FILTRO MINHAS OS ──────────────────────────────────────────────────
  describe("5. Filtro 'Minhas OS' (Isolamento por Técnico)", () => {
    const loggedInTechId = "tech-alice";

    const orders = [
      { id: "1", order_number: 201, technician_id: "tech-alice", status: "repairing" },
      { id: "2", order_number: 202, technician_id: "tech-bob", status: "repairing" },
      { id: "3", order_number: 203, technician_id: null, status: "received" },
      { id: "4", order_number: 204, technician_id: "tech-alice", status: "ready" },
    ];

    it("quando o técnico seleciona 'Minhas OS', exibe apenas as atribuídas a ele", () => {
      const filterMode = "me";
      const filtered = orders.filter((o) => {
        if (filterMode === "me") return o.technician_id === loggedInTechId;
        return true;
      });

      expect(filtered.length).toBe(2);
      expect(filtered.map((o) => o.order_number)).toEqual([201, 204]);
    });

    it("quando um gestor seleciona um técnico específico no dropdown", () => {
      const selectedTech = "tech-bob";
      const filtered = orders.filter((o) => o.technician_id === selectedTech);

      expect(filtered.length).toBe(1);
      expect(filtered[0].order_number).toBe(202);
    });
  });

  // ─── 6. MULTI-LOJA VS SINGLE-STORE ────────────────────────────────────────
  describe("6. Troca de Loja e Isolamento Multi-Loja", () => {
    const orders = [
      { id: "1", store_id: "store-centro", order_number: 301, final_price: 200 },
      { id: "2", store_id: "store-shopping", order_number: 302, final_price: 350 },
      { id: "3", store_id: "store-centro", order_number: 303, final_price: 450 },
    ];

    it("com activeStoreId = 'all', agrega todas as unidades", () => {
      const activeStoreId = "all";
      const filtered = orders.filter((o) => activeStoreId === "all" || o.store_id === activeStoreId);

      expect(filtered.length).toBe(3);
    });

    it("com activeStoreId específico, isola estritamente os dados daquela unidade", () => {
      const activeStoreId: string = "store-shopping";
      const filtered = orders.filter((o) => activeStoreId === "all" || o.store_id === activeStoreId);

      expect(filtered.length).toBe(1);
      expect(filtered[0].order_number).toBe(302);
      expect(filtered[0].final_price).toBe(350);
    });
  });

  // ─── 7. FONTE ÚNICA CANÔNICA DE STATUS (osStatus.ts) ───────────────────────
  describe("7. Consistência de Status em todo o sistema (Salvaguarda 5)", () => {
    it("deve conter todos os 8 status canônicos cadastrados no sistema", () => {
      expect(ALL_OS_STATUSES).toEqual([
        "open",
        "analyzing",
        "waiting_part",
        "repairing",
        "waiting_approval",
        "ready",
        "delivered",
        "cancelled",
      ]);
    });

    it("getStatusLabel deve retornar labels em português corretas", () => {
      expect(getStatusLabel("open")).toBe("Aberta");
      expect(getStatusLabel("analyzing")).toBe("Em Análise");
      expect(getStatusLabel("repairing")).toBe("Em Reparo");
      expect(getStatusLabel("waiting_part")).toBe("Aguardando Peça");
      expect(getStatusLabel("waiting_approval")).toBe("Aguardando Aprovação");
      expect(getStatusLabel("ready")).toBe("Pronta p/ Retirada");
      expect(getStatusLabel("delivered")).toBe("Entregue");
      expect(getStatusLabel("cancelled")).toBe("Cancelada");
    });

    it("getStatusColor deve retornar classes consistentes para badges", () => {
      expect(getStatusColor("ready")).toContain("text-emerald-400");
      expect(getStatusColor("waiting_part")).toContain("text-orange-400");
      expect(getStatusColor("cancelled")).toContain("text-destructive");
    });
  });

  // ─── 8. STATUS "EM BANCADA" (BANCADA TÉCNICA) ─────────────────────────────
  describe("8. Status 'Em Bancada' e Contagem de Trabalho Ativo", () => {
    it("analyzing conta em 'Em Bancada'", () => {
      expect(isOrderOnBench("analyzing")).toBe(true);
    });

    it("repairing conta em 'Em Bancada'", () => {
      expect(isOrderOnBench("repairing")).toBe(true);
    });

    it("waiting_part NÃO conta em 'Em Bancada'", () => {
      expect(isOrderOnBench("waiting_part")).toBe(false);
    });

    it("demais status não contam em 'Em Bancada'", () => {
      expect(isOrderOnBench("open")).toBe(false);
      expect(isOrderOnBench("waiting_approval")).toBe(false);
      expect(isOrderOnBench("ready")).toBe(false);
      expect(isOrderOnBench("delivered")).toBe(false);
      expect(isOrderOnBench("cancelled")).toBe(false);
      expect(isOrderOnBench(null)).toBe(false);
      expect(isOrderOnBench(undefined)).toBe(false);
    });

    it("BENCH_ACTIVE_STATUSES contém apenas os status canônicos de bancada", () => {
      expect(BENCH_ACTIVE_STATUSES).toEqual(["repairing", "analyzing"]);
    });
  });

  // ─── 9. ATRIBUIÇÃO E DESATRIBUIÇÃO DE TÉCNICO (CRIAÇÃO E EDIÇÃO) ───────────
  describe("9. Atribuição e Desatribuição de Técnico (Criação e Edição)", () => {
    it("criar OS sem técnico => technician_id NULL", () => {
      expect(resolveTechnicianIdOnCreate("none")).toBeNull();
      expect(resolveTechnicianIdOnCreate("")).toBeNull();
      expect(resolveTechnicianIdOnCreate(null)).toBeNull();
      expect(resolveTechnicianIdOnCreate(undefined)).toBeNull();
    });

    it("criar OS com técnico selecionado => UUID salvo", () => {
      const techUuid = "d87a71f8-0000-4000-8000-000000000001";
      expect(resolveTechnicianIdOnCreate(techUuid)).toBe(techUuid);
    });

    it("editar OS e selecionar 'Nenhum' => technician_id NULL", () => {
      const currentTechId = "d87a71f8-0000-4000-8000-000000000001";
      const result = resolveTechnicianIdOnUpdate("none", currentTechId);

      expect(result.shouldUpdate).toBe(true);
      expect(result.value).toBeNull();
    });

    it("editar OS mantendo técnico => UUID preservado", () => {
      const currentTechId = "d87a71f8-0000-4000-8000-000000000001";
      const result = resolveTechnicianIdOnUpdate(currentTechId, currentTechId);

      expect(result.shouldUpdate).toBe(true);
      expect(result.value).toBe(currentTechId);
    });

    it("editar outro campo sem mexer no técnico ('' ou undefined) => técnico NÃO é removido", () => {
      const currentTechId = "d87a71f8-0000-4000-8000-000000000001";

      const resultEmpty = resolveTechnicianIdOnUpdate("", currentTechId);
      expect(resultEmpty.shouldUpdate).toBe(false);
      expect(resultEmpty.value).toBe(currentTechId);

      const resultUndefined = resolveTechnicianIdOnUpdate(undefined, currentTechId);
      expect(resultUndefined.shouldUpdate).toBe(false);
      expect(resultUndefined.value).toBe(currentTechId);

      const resultNull = resolveTechnicianIdOnUpdate(null, currentTechId);
      expect(resultNull.shouldUpdate).toBe(false);
      expect(resultNull.value).toBe(currentTechId);
    });

    it("trocar técnico A -> técnico B => UUID B salvo", () => {
      const techA = "d87a71f8-0000-4000-8000-000000000001";
      const techB = "e98b82a9-0000-4000-8000-000000000002";

      const result = resolveTechnicianIdOnUpdate(techB, techA);

      expect(result.shouldUpdate).toBe(true);
      expect(result.value).toBe(techB);
    });

    it("OS sem técnico => comissão técnica = 0", () => {
      const roleTecnico: UserRoleData = {
        role: "tecnico",
        commission_on_services: true,
        commission_services_percent: 25,
      };

      const parts: OSItemPart[] = [
        { service_order_id: "os-sem-tec", unit_cost: 50, quantity: 1 },
      ];

      const osSemTecnico = {
        status: "delivered",
        final_price: 350,
        technician_id: null,
      };

      const metrics = calculateOSItemMetrics(osSemTecnico, parts, roleTecnico);

      expect(metrics.receitaOS).toBe(350);
      expect(metrics.lucroBrutoOS).toBe(300);
      expect(metrics.comissaoTecnico).toBe(0);
    });
  });
});
