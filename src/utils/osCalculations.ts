/**
 * Módulo Canônico de Cálculos de Ordens de Serviço (OS)
 * Centraliza as regras de negócio de receita, custo de peças, lucro bruto da OS e comissões.
 * Preserva estritamente as regras consolidadas do sistema (Salvaguardas 1, 2 e 4).
 */

export interface OSItemPart {
  service_order_id: string;
  unit_cost: number | string;
  quantity?: number;
}

export interface UserRoleData {
  commission_on_services?: boolean | null;
  commission_services_percent?: number | string | null;
  role?: string | null;
}

export interface OSMetricsResult {
  receitaOS: number;
  custoPecas: number;
  lucroBrutoOS: number; // "Lucro Bruto da OS" ou "Margem da OS" (Salvaguarda 2)
  comissaoTecnico: number;
}

/**
 * Calcula a receita, custo de peças, lucro bruto da OS e comissão do técnico
 * para uma ordem de serviço individual.
 */
export function calculateOSItemMetrics(
  order: {
    status?: string | null;
    final_price?: number | string | null;
    estimated_price?: number | string | null;
    technician_id?: string | null;
  },
  parts: OSItemPart[] = [],
  userRoleData?: UserRoleData | null
): OSMetricsResult {
  const isDelivered = order.status === "delivered";
  const isCancelled = order.status === "cancelled";

  // OS canceladas têm receita zero e comissão zero
  if (isCancelled) {
    const custoPecas = parts.reduce((acc, p) => acc + (Number(p.unit_cost || 0) * Number(p.quantity || 1)), 0);
    return {
      receitaOS: 0,
      custoPecas,
      lucroBrutoOS: 0,
      comissaoTecnico: 0,
    };
  }

  const receitaOS = Number(order.final_price || order.estimated_price || 0);

  const custoPecas = parts.reduce(
    (acc, p) => acc + (Number(p.unit_cost || 0) * Number(p.quantity || 1)),
    0
  );

  // Lucro Bruto da OS / Margem da OS = Receita menos Custo das Peças (mínimo zero)
  const lucroBrutoOS = Math.max(0, receitaOS - custoPecas);

  let comissaoTecnico = 0;

  // Apenas OS entregues com técnico explicitamente atribuído geram comissão (Salvaguarda 1 e 9)
  if (isDelivered && order.technician_id && userRoleData) {
    const receivesCommission = userRoleData.commission_on_services ?? true;
    const commPercent = Number(userRoleData.commission_services_percent || 0);

    if (receivesCommission && commPercent > 0) {
      comissaoTecnico = (lucroBrutoOS * commPercent) / 100;
    }
  }

  return {
    receitaOS,
    custoPecas,
    lucroBrutoOS,
    comissaoTecnico,
  };
}

export type OSDateFilterMode = "delivery" | "entry";

/**
 * Filtra ordens de serviço respeitando a semântica clara de datas (Salvaguarda 4):
 * - "delivery": filtra pelo campo `delivered_at` (usado para faturamento, comissões e produtividade entregue)
 * - "entry": filtra pelo campo `created_at` (usado para fluxo de entrada de aparelhos na assistência)
 */
export function filterOSByDateMode<T extends { created_at: string; delivered_at?: string | null; status?: string | null }>(
  orders: T[],
  mode: OSDateFilterMode,
  start: string,
  end: string
): T[] {
  const startDate = new Date(start);
  const endDate = new Date(end);

  return orders.filter((o) => {
    if (mode === "delivery") {
      // Para métricas de entrega, a OS deve estar entregue e possuir delivered_at no intervalo
      if (o.status !== "delivered") return false;
      const targetDate = o.delivered_at ? new Date(o.delivered_at) : new Date(o.created_at);
      return targetDate >= startDate && targetDate <= endDate;
    } else {
      // Para métricas de entrada/recepção, filtra por created_at
      const targetDate = new Date(o.created_at);
      return targetDate >= startDate && targetDate <= endDate;
    }
  });
}

/**
 * Status canônicos considerados como trabalho ativo na bancada técnica.
 * "analyzing" (Em Análise) e "repairing" (Em Reparo).
 */
export const BENCH_ACTIVE_STATUSES = ["repairing", "analyzing"] as const;

export function isOrderOnBench(status?: string | null): boolean {
  if (!status) return false;
  return (BENCH_ACTIVE_STATUSES as readonly string[]).includes(status);
}

/**
 * Resolve o technician_id para atualização de OS.
 * Salvaguardas:
 * - "none" selecionado explicitamente => { shouldUpdate: true, value: null }
 * - UUID válido informado => { shouldUpdate: true, value: UUID }
 * - "" ou undefined (não alterado / ausente) => { shouldUpdate: false, value: currentTechnicianId }
 */
export function resolveTechnicianIdOnUpdate(
  selectedTechnicianValue: string | undefined | null,
  currentTechnicianId?: string | null
): { shouldUpdate: boolean; value: string | null } {
  if (selectedTechnicianValue === "none") {
    return { shouldUpdate: true, value: null };
  }
  if (selectedTechnicianValue && selectedTechnicianValue.trim() !== "") {
    return { shouldUpdate: true, value: selectedTechnicianValue.trim() };
  }
  // Se for "" ou undefined, preserva o existente (não desatribui)
  return { shouldUpdate: false, value: currentTechnicianId ?? null };
}

/**
 * Resolve o technician_id para criação de nova OS.
 * Se "none", vazio ou nulo => retorna null.
 * Se UUID informado => retorna o UUID.
 */
export function resolveTechnicianIdOnCreate(
  selectedTechnicianValue: string | undefined | null
): string | null {
  if (!selectedTechnicianValue || selectedTechnicianValue === "none" || selectedTechnicianValue.trim() === "") {
    return null;
  }
  return selectedTechnicianValue.trim();
}
