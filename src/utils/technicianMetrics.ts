import { calculateOSItemMetrics, type OSItemPart, type UserRoleData } from "./osCalculations";

export interface TechGoalConfig {
  targetOrders: number;
  targetCommission: number;
}

export interface TechProductivityResult {
  totalDelivered: number;
  totalCancelled: number;
  totalActiveInBench: number;
  successRate: number; // % de sucesso (0 a 100)
  avgTotalLeadTimeDays: number; // Tempo total (created_at -> delivered_at) em dias
  avgBenchTimeDays: number; // Tempo médio de bancada
  realizedCommission: number; // Comissão de OS entregues no período
  projectedCommission: number; // Comissão projetada (repairing, ready, waiting_approval com valor)
  totalLaborRevenue: number; // Margem bruta / mão de obra gerada para a loja
  ticketMedioLabor: number; // Média de mão de obra por OS entregue
}

export interface TimelineDataPoint {
  date: string; // YYYY-MM-DD
  label: string; // dd/MM
  orders: number;
  commission: number;
}

export interface TechGoalsProgress {
  ordersTarget: number;
  ordersCurrent: number;
  ordersPct: number;
  commissionTarget: number;
  commissionCurrent: number;
  commissionPct: number;
  isOrdersAchieved: boolean;
  isCommissionAchieved: boolean;
}

export interface TechRankingItem {
  techId: string;
  name: string;
  deliveredOrders: number;
  laborRevenue: number;
  rank: number;
  isMe: boolean;
}

/**
 * Status que possuem potencial real de faturamento para comissão projetada:
 * - "repairing" (em bancada executando)
 * - "ready" (reparo concluído aguardando retirada)
 * - "waiting_approval" (somente se já possuir valor estimado/final preenchido)
 */
export const PROJECTED_COMMISSION_STATUSES = ["repairing", "ready", "waiting_approval"] as const;

/**
 * Calcula a comissão projetada para ordens em andamento que têm potencial real de faturamento.
 * Exclui ordens canceladas, sem técnico ou sem valor.
 */
export function calculateProjectedCommission(
  activeOrders: Array<{
    status?: string | null;
    final_price?: number | string | null;
    estimated_price?: number | string | null;
    technician_id?: string | null;
  }>,
  parts: OSItemPart[] = [],
  userRoleData?: UserRoleData | null,
  techUserId?: string
): number {
  if (!userRoleData || !techUserId) return 0;
  const receivesCommission = userRoleData.commission_on_services ?? true;
  const commPercent = Number(userRoleData.commission_services_percent || 0);
  if (!receivesCommission || commPercent <= 0) return 0;

  let totalProjected = 0;

  activeOrders.forEach((o) => {
    // Deve pertencer ao técnico e estar em status elegível
    if (o.technician_id !== techUserId) return;
    if (!o.status || !(PROJECTED_COMMISSION_STATUSES as readonly string[]).includes(o.status)) return;

    const price = Number(o.final_price || o.estimated_price || 0);
    if (price <= 0) return;

    const osParts = parts.filter((p) => (p as any).service_order_id === (o as any).id);
    const custoPecas = osParts.reduce(
      (acc, p) => acc + (Number(p.unit_cost || 0) * Number(p.quantity || 1)),
      0
    );

    const margemProjetada = Math.max(0, price - custoPecas);
    totalProjected += (margemProjetada * commPercent) / 100;
  });

  return Math.round(totalProjected * 100) / 100;
}

/**
 * Calcula as métricas consolidadas de produtividade, SLA e ganhos do técnico.
 */
export function calculateTechProductivity(
  orders: Array<{
    id?: string;
    created_at: string;
    delivered_at?: string | null;
    status?: string | null;
    final_price?: number | string | null;
    estimated_price?: number | string | null;
    technician_id?: string | null;
  }>,
  parts: OSItemPart[] = [],
  userRoleData?: UserRoleData | null,
  techUserId?: string,
  startDate?: string,
  endDate?: string
): TechProductivityResult {
  const myOrders = orders.filter((o) => !techUserId || o.technician_id === techUserId);

  const start = startDate ? new Date(startDate).getTime() : 0;
  const end = endDate ? new Date(endDate).getTime() : Infinity;

  // OS entregues no período
  const delivered = myOrders.filter((o) => {
    if (o.status !== "delivered") return false;
    const targetDate = o.delivered_at ? new Date(o.delivered_at).getTime() : new Date(o.created_at).getTime();
    return targetDate >= start && targetDate <= end;
  });

  // OS canceladas no período
  const cancelled = myOrders.filter((o) => {
    if (o.status !== "cancelled") return false;
    const d = new Date(o.created_at).getTime();
    return d >= start && d <= end;
  });

  // OS ativas na bancada no momento
  const activeInBench = myOrders.filter((o) => !["delivered", "cancelled"].includes(o.status || ""));

  // Taxa de Sucesso (%)
  const totalFinished = delivered.length + cancelled.length;
  const successRate = totalFinished > 0 ? Math.round((delivered.length / totalFinished) * 100) : 100;

  // Lead Time Total (dias da abertura até a entrega)
  let totalLeadDays = 0;
  delivered.forEach((o) => {
    const created = new Date(o.created_at).getTime();
    const deliv = o.delivered_at ? new Date(o.delivered_at).getTime() : created;
    const diffDays = Math.max(0, (deliv - created) / (1000 * 60 * 60 * 24));
    totalLeadDays += diffDays;
  });
  const avgTotalLeadTimeDays = delivered.length > 0 ? Math.round((totalLeadDays / delivered.length) * 10) / 10 : 0;

  // Tempo de bancada estimado (média ponderada dos reparos em dias)
  const avgBenchTimeDays = Math.max(0.5, Math.round(avgTotalLeadTimeDays * 0.7 * 10) / 10);

  // Comissões e Receitas
  let realizedCommission = 0;
  let totalLaborRevenue = 0;

  delivered.forEach((o) => {
    const osParts = parts.filter((p) => p.service_order_id === o.id);
    const metrics = calculateOSItemMetrics(o, osParts, userRoleData);
    realizedCommission += metrics.comissaoTecnico;
    totalLaborRevenue += metrics.lucroBrutoOS;
  });

  const projectedCommission = calculateProjectedCommission(activeInBench, parts, userRoleData, techUserId);
  const ticketMedioLabor = delivered.length > 0 ? Math.round((totalLaborRevenue / delivered.length) * 100) / 100 : 0;

  return {
    totalDelivered: delivered.length,
    totalCancelled: cancelled.length,
    totalActiveInBench: activeInBench.length,
    successRate,
    avgTotalLeadTimeDays,
    avgBenchTimeDays,
    realizedCommission: Math.round(realizedCommission * 100) / 100,
    projectedCommission,
    totalLaborRevenue: Math.round(totalLaborRevenue * 100) / 100,
    ticketMedioLabor,
  };
}

/**
 * Agrupa os reparos entregues do técnico por data para timeline do gráfico.
 */
export function calculateTechTimeline(
  deliveredOrders: Array<{
    id?: string;
    created_at: string;
    delivered_at?: string | null;
    final_price?: number | string | null;
    estimated_price?: number | string | null;
    technician_id?: string | null;
  }>,
  parts: OSItemPart[] = [],
  userRoleData?: UserRoleData | null
): TimelineDataPoint[] {
  const map: Record<string, { orders: number; commission: number }> = {};

  deliveredOrders.forEach((o) => {
    const rawDate = o.delivered_at || o.created_at;
    const d = new Date(rawDate);
    const key = d.toISOString().split("T")[0]; // YYYY-MM-DD

    if (!map[key]) {
      map[key] = { orders: 0, commission: 0 };
    }

    map[key].orders += 1;
    const osParts = parts.filter((p) => p.service_order_id === o.id);
    const metrics = calculateOSItemMetrics(o, osParts, userRoleData);
    map[key].commission += metrics.comissaoTecnico;
  });

  const sortedKeys = Object.keys(map).sort();

  return sortedKeys.map((k) => {
    const [_, m, d] = k.split("-");
    return {
      date: k,
      label: `${d}/${m}`,
      orders: map[k].orders,
      commission: Math.round(map[k].commission * 100) / 100,
    };
  });
}

/**
 * Calcula o progresso de metas mensais do técnico (Gamificação).
 */
export function calculateTechGoalsProgress(
  currentOrders: number,
  currentCommission: number,
  goals: TechGoalConfig = { targetOrders: 40, targetCommission: 2500 }
): TechGoalsProgress {
  const ordersTarget = Math.max(1, goals.targetOrders);
  const commissionTarget = Math.max(1, goals.targetCommission);

  const ordersPct = Math.min(100, Math.round((currentOrders / ordersTarget) * 100));
  const commissionPct = Math.min(100, Math.round((currentCommission / commissionTarget) * 100));

  return {
    ordersTarget,
    ordersCurrent: currentOrders,
    ordersPct,
    commissionTarget,
    commissionCurrent: Math.round(currentCommission * 100) / 100,
    commissionPct,
    isOrdersAchieved: currentOrders >= ordersTarget,
    isCommissionAchieved: currentCommission >= commissionTarget,
  };
}

/**
 * Calcula a posição e ranking interno da equipe técnica da loja.
 */
export function calculateTechShopRanking(
  allShopDeliveredOrders: Array<{
    id?: string;
    technician_id?: string | null;
    final_price?: number | string | null;
    estimated_price?: number | string | null;
  }>,
  profileMap: Map<string, string>,
  myUserId: string,
  parts: OSItemPart[] = []
): { items: TechRankingItem[]; myRank: number; totalTechs: number } {
  const techAgg: Record<string, { deliveredOrders: number; laborRevenue: number }> = {};

  allShopDeliveredOrders.forEach((o) => {
    if (!o.technician_id) return;
    const uid = o.technician_id;
    if (!techAgg[uid]) {
      techAgg[uid] = { deliveredOrders: 0, laborRevenue: 0 };
    }
    techAgg[uid].deliveredOrders += 1;

    const osParts = parts.filter((p) => p.service_order_id === o.id);
    const price = Number(o.final_price || o.estimated_price || 0);
    const custoPecas = osParts.reduce(
      (acc, p) => acc + (Number(p.unit_cost || 0) * Number(p.quantity || 1)),
      0
    );
    techAgg[uid].laborRevenue += Math.max(0, price - custoPecas);
  });

  const sortedList = Object.entries(techAgg)
    .sort((a, b) => b[1].deliveredOrders - a[1].deliveredOrders || b[1].laborRevenue - a[1].laborRevenue)
    .map(([techId, data], index) => ({
      techId,
      name: profileMap.get(techId) || "Técnico",
      deliveredOrders: data.deliveredOrders,
      laborRevenue: Math.round(data.laborRevenue * 100) / 100,
      rank: index + 1,
      isMe: techId === myUserId,
    }));

  const myItem = sortedList.find((i) => i.isMe);
  const myRank = myItem ? myItem.rank : (sortedList.length > 0 ? sortedList.length + 1 : 1);

  return {
    items: sortedList,
    myRank,
    totalTechs: sortedList.length,
  };
}
