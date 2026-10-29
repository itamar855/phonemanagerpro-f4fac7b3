/**
 * rankingGamification.ts
 * Utilitário puro para regras de gamificação, cálculo de patentes, metas e pódios.
 * Desenvolvido cirurgicamente para as trilhas de Celulares (Geral) e Acessórios (Por Loja).
 */

export type PatentTier = "bronze" | "prata" | "ouro" | "diamante";

export interface PatentConfig {
  tier: PatentTier;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  textColor: string;
  badgeClass: string;
}

export const PATENT_CONFIGS: Record<PatentTier, PatentConfig> = {
  bronze: {
    tier: "bronze",
    label: "Bronze",
    icon: "🥉",
    color: "#cd7f32",
    bgColor: "bg-amber-950/20",
    borderColor: "border-amber-700/40",
    textColor: "text-amber-600 dark:text-amber-500",
    badgeClass: "bg-amber-500/10 text-amber-600 border-amber-600/30",
  },
  prata: {
    tier: "prata",
    label: "Prata",
    icon: "🥈",
    color: "#94a3b8",
    bgColor: "bg-slate-500/10",
    borderColor: "border-slate-400/40",
    textColor: "text-slate-600 dark:text-slate-300",
    badgeClass: "bg-slate-500/10 text-slate-600 dark:text-slate-300 border-slate-400/30",
  },
  ouro: {
    tier: "ouro",
    label: "Ouro",
    icon: "🥇",
    color: "#eab308",
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/40",
    textColor: "text-yellow-600 dark:text-yellow-400",
    badgeClass: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30",
  },
  diamante: {
    tier: "diamante",
    label: "Diamante",
    icon: "💎",
    color: "#38bdf8",
    bgColor: "bg-cyan-500/10",
    borderColor: "border-cyan-500/40",
    textColor: "text-cyan-600 dark:text-cyan-400",
    badgeClass: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30 shadow-sm shadow-cyan-500/20",
  },
};

// ── Metas e Regras da Trilha Celulares (Quantidade de Aparelhos) ─────────────────
export interface PhoneRuleTier {
  tier: PatentTier;
  minQty: number;
  maxQty: number | null;
  bonusReais: number;
  extraCommissionPct: number;
  description: string;
}

export const PHONE_TIERS: PhoneRuleTier[] = [
  {
    tier: "bronze",
    minQty: 0,
    maxQty: 5,
    bonusReais: 0,
    extraCommissionPct: 0,
    description: "Até 5 aparelhos vendidos. Comissão base da loja.",
  },
  {
    tier: "prata",
    minQty: 6,
    maxQty: 12,
    bonusReais: 150,
    extraCommissionPct: 0,
    description: "6 a 12 aparelhos. Meta Batida! Bônus de R$ 150 em dinheiro.",
  },
  {
    tier: "ouro",
    minQty: 13,
    maxQty: 20,
    bonusReais: 350,
    extraCommissionPct: 0.5,
    description: "13 a 20 aparelhos. Bônus de R$ 350 + 0,5% de comissão extra.",
  },
  {
    tier: "diamante",
    minQty: 21,
    maxQty: null,
    bonusReais: 700,
    extraCommissionPct: 1.0,
    description: "Mais de 20 aparelhos. Bônus de R$ 700 + 1,0% extra + Destaque da Rede.",
  },
];

// ── Metas e Regras da Trilha Acessórios (Faturamento em Reais) ───────────────────
export interface AccessoryRuleTier {
  tier: PatentTier;
  minAmount: number;
  maxAmount: number | null;
  bonusReais: number;
  description: string;
}

export const ACCESSORY_TIERS: AccessoryRuleTier[] = [
  {
    tier: "bronze",
    minAmount: 0,
    maxAmount: 2500,
    bonusReais: 0,
    description: "Até R$ 2.500 faturados em acessórios no mês.",
  },
  {
    tier: "prata",
    minAmount: 2500.01,
    maxAmount: 5000,
    bonusReais: 100,
    description: "R$ 2.501 a R$ 5.000. Meta 1 Batida! Bônus de R$ 100 em dinheiro.",
  },
  {
    tier: "ouro",
    minAmount: 5000.01,
    maxAmount: 8000,
    bonusReais: 250,
    description: "R$ 5.001 a R$ 8.000. Super Meta! Bônus de R$ 250 em dinheiro.",
  },
  {
    tier: "diamante",
    minAmount: 8000.01,
    maxAmount: null,
    bonusReais: 500,
    description: "Acima de R$ 8.000. Recorde de vendas! Bônus de R$ 500 em dinheiro.",
  },
];

// ── Tipos de Saída Estruturados ──────────────────────────────────────────────────
export interface SellerPatentProgress {
  currentTier: PatentTier;
  nextTier: PatentTier | null;
  currentValue: number;
  targetValue: number;
  remainingValue: number;
  progressPercent: number; // 0 a 100
  bonusUnlocked: number;
  nextBonus: number;
  extraCommissionPct: number;
}

export interface RankSellerPhone {
  uid: string;
  nome: string;
  role: "vendedor" | "tecnico" | "admin";
  isTechnician: boolean;
  storeId: string;
  storeName: string;
  qtdCelulares: number;
  totalVendas: number;
  totalLucro: number;
  comissoesVendas: number;
  tradeInCount: number;
  tradeInTotalValue: number;
  ticketMedio: number;
  patent: SellerPatentProgress;
}

export interface RankSellerAccessory {
  uid: string;
  nome: string;
  role: "vendedor" | "tecnico" | "admin";
  storeId: string;
  storeName: string;
  totalFaturado: number;
  qtdTransacoes: number;
  qtdPecas: number;
  ticketMedioTransacao: number;
  ticketMedioPeca: number;
  patent: SellerPatentProgress;
}

export interface StoreAccessoryMetrics {
  storeId: string;
  storeName: string;
  totalFaturado: number;
  qtdTransacoes: number;
  qtdPecas: number;
  ticketMedioTransacao: number;
  taxaAnexo: number; // peças de acessórios vendidas por celular vendido na loja
  totalCelularesLoja: number;
}

/**
 * Calcula a patente e a barra de progresso para a trilha de Celulares (com base na quantidade de aparelhos).
 */
export function calculatePhonePatent(qtdAparelhos: number): SellerPatentProgress {
  const count = Math.max(0, qtdAparelhos);

  if (count >= 21) {
    return {
      currentTier: "diamante",
      nextTier: null,
      currentValue: count,
      targetValue: 21,
      remainingValue: 0,
      progressPercent: 100,
      bonusUnlocked: 700,
      nextBonus: 0,
      extraCommissionPct: 1.0,
    };
  }

  if (count >= 13) {
    const target = 21;
    const remaining = target - count;
    const range = 21 - 13;
    const progress = Math.min(100, Math.round(((count - 13) / range) * 100));
    return {
      currentTier: "ouro",
      nextTier: "diamante",
      currentValue: count,
      targetValue: target,
      remainingValue: remaining,
      progressPercent: progress,
      bonusUnlocked: 350,
      nextBonus: 700,
      extraCommissionPct: 0.5,
    };
  }

  if (count >= 6) {
    const target = 13;
    const remaining = target - count;
    const range = 13 - 6;
    const progress = Math.min(100, Math.round(((count - 6) / range) * 100));
    return {
      currentTier: "prata",
      nextTier: "ouro",
      currentValue: count,
      targetValue: target,
      remainingValue: remaining,
      progressPercent: progress,
      bonusUnlocked: 150,
      nextBonus: 350,
      extraCommissionPct: 0,
    };
  }

  // Bronze
  const target = 6;
  const remaining = target - count;
  const progress = Math.min(100, Math.round((count / target) * 100));
  return {
    currentTier: "bronze",
    nextTier: "prata",
    currentValue: count,
    targetValue: target,
    remainingValue: remaining,
    progressPercent: progress,
    bonusUnlocked: 0,
    nextBonus: 150,
    extraCommissionPct: 0,
  };
}

/**
 * Calcula a patente e a barra de progresso para a trilha de Acessórios (com base no faturamento R$).
 */
export function calculateAccessoryPatent(totalAmount: number): SellerPatentProgress {
  const amount = Math.max(0, totalAmount);

  if (amount > 8000) {
    return {
      currentTier: "diamante",
      nextTier: null,
      currentValue: amount,
      targetValue: 8000,
      remainingValue: 0,
      progressPercent: 100,
      bonusUnlocked: 500,
      nextBonus: 0,
      extraCommissionPct: 0,
    };
  }

  if (amount > 5000) {
    const target = 8000;
    const remaining = target - amount;
    const range = 8000 - 5000;
    const progress = Math.min(100, Math.round(((amount - 5000) / range) * 100));
    return {
      currentTier: "ouro",
      nextTier: "diamante",
      currentValue: amount,
      targetValue: target,
      remainingValue: remaining,
      progressPercent: progress,
      bonusUnlocked: 250,
      nextBonus: 500,
      extraCommissionPct: 0,
    };
  }

  if (amount > 2500) {
    const target = 5000;
    const remaining = target - amount;
    const range = 5000 - 2500;
    const progress = Math.min(100, Math.round(((amount - 2500) / range) * 100));
    return {
      currentTier: "prata",
      nextTier: "ouro",
      currentValue: amount,
      targetValue: target,
      remainingValue: remaining,
      progressPercent: progress,
      bonusUnlocked: 100,
      nextBonus: 250,
      extraCommissionPct: 0,
    };
  }

  // Bronze
  const target = 2500;
  const remaining = target - amount;
  const progress = Math.min(100, Math.round((amount / target) * 100));
  return {
    currentTier: "bronze",
    nextTier: "prata",
    currentValue: amount,
    targetValue: target,
    remainingValue: remaining,
    progressPercent: progress,
    bonusUnlocked: 0,
    nextBonus: 100,
    extraCommissionPct: 0,
  };
}

/**
 * Agrega vendas de celulares em ranking unificado (Geral, todas as lojas, incluindo técnicos).
 */
export function aggregatePhoneRanking(params: {
  sales: any[];
  profiles: any[];
  stores: any[];
  userRoles: any[];
  productMap?: Map<string, any>;
}): RankSellerPhone[] {
  const { sales, profiles, stores, userRoles, productMap } = params;

  const profileMap = new Map<string, any>(profiles.map((p) => [p.user_id || p.id, p]));
  const storeMap = new Map<string, any>(stores.map((s) => [s.id, s]));
  const roleMap = new Map<string, any>(userRoles.map((r) => [r.user_id, r]));

  const map = new Map<string, {
    uid: string;
    nome: string;
    role: "vendedor" | "tecnico" | "admin";
    isTechnician: boolean;
    storeId: string;
    storeName: string;
    qtdCelulares: number;
    totalVendas: number;
    totalLucro: number;
    comissoesVendas: number;
    tradeInCount: number;
    tradeInTotalValue: number;
  }>();

  for (const s of sales) {
    // Vendedor canônico é seller_id ou created_by
    const sellerUid = s.seller_id || s.created_by;
    if (!sellerUid) continue;

    const profile = profileMap.get(sellerUid);
    const userRoleData = roleMap.get(sellerUid);
    const role = (userRoleData?.role || profile?.role || "vendedor") as "vendedor" | "tecnico" | "admin";
    const isTech = role === "tecnico";

    const store = storeMap.get(s.store_id);
    const storeName = store?.name || "Loja";

    const current = map.get(sellerUid) || {
      uid: sellerUid,
      nome: profile?.display_name || profile?.name || "Colaborador",
      role,
      isTechnician: isTech,
      storeId: s.store_id || "",
      storeName,
      qtdCelulares: 0,
      totalVendas: 0,
      totalLucro: 0,
      comissoesVendas: 0,
      tradeInCount: 0,
      tradeInTotalValue: 0,
    };

    const salePrice = Number(s.sale_price) || 0;
    const commVal = Number(s.commission_value) || 0;
    const p = productMap?.get(s.product_id);
    const costPrice = Number(p?.cost_price) || 0;
    const profit = salePrice - costPrice;

    current.qtdCelulares += 1;
    current.totalVendas += salePrice;
    current.totalLucro += profit;
    current.comissoesVendas += commVal;

    if (s.has_trade_in) {
      current.tradeInCount += 1;
      current.tradeInTotalValue += Number(s.trade_in_value) || 0;
    }

    map.set(sellerUid, current);
  }

  // Converter para array e calcular métricas derivadas + patentes
  const result: RankSellerPhone[] = Array.from(map.values()).map((item) => {
    const ticketMedio = item.qtdCelulares > 0 ? item.totalVendas / item.qtdCelulares : 0;
    const patent = calculatePhonePatent(item.qtdCelulares);

    return {
      ...item,
      ticketMedio,
      patent,
    };
  });

  // Ordenar por quantidade de aparelhos vendidos (critério principal) e desempate por total vendido
  result.sort((a, b) => {
    if (b.qtdCelulares !== a.qtdCelulares) {
      return b.qtdCelulares - a.qtdCelulares;
    }
    return b.totalVendas - a.totalVendas;
  });

  return result;
}

/**
 * Agrega vendas de acessórios (por loja e por vendedor).
 */
export function aggregateAccessoryRanking(params: {
  transactions: any[];
  sales: any[]; // Usado para calcular taxa de anexo
  profiles: any[];
  stores: any[];
  userRoles: any[];
  filterStoreId?: string; // Se 'all', traz todas
}): {
  ranking: RankSellerAccessory[];
  storeMetrics: Record<string, StoreAccessoryMetrics>;
} {
  const { transactions, sales, profiles, stores, userRoles, filterStoreId } = params;

  const profileMap = new Map<string, any>(profiles.map((p) => [p.user_id || p.id, p]));
  const storeMap = new Map<string, any>(stores.map((s) => [s.id, s]));
  const roleMap = new Map<string, any>(userRoles.map((r) => [r.user_id, r]));

  // Filtrar transações por loja se especificado
  const txList = transactions.filter((tx) => {
    if (!tx || tx.type !== "income" || tx.category !== "acessorio") return false;
    if (filterStoreId && filterStoreId !== "all") {
      return tx.store_id === filterStoreId;
    }
    return true;
  });

  // Agrupar por vendedor
  const sellerMap = new Map<string, {
    uid: string;
    nome: string;
    role: "vendedor" | "tecnico" | "admin";
    storeId: string;
    storeName: string;
    totalFaturado: number;
    qtdTransacoes: number;
    qtdPecas: number;
  }>();

  // Métricas por loja
  const storeAgg: Record<string, {
    totalFaturado: number;
    qtdTransacoes: number;
    qtdPecas: number;
  }> = {};

  for (const tx of txList) {
    const metadata = tx.metadata as any;
    const sellerUid = metadata?.seller_id || tx.created_by;
    if (!sellerUid) continue;

    const profile = profileMap.get(sellerUid);
    const userRoleData = roleMap.get(sellerUid);
    const role = (userRoleData?.role || profile?.role || "vendedor") as "vendedor" | "tecnico" | "admin";

    const sId = tx.store_id || "";
    const store = storeMap.get(sId);
    const storeName = store?.name || "Loja";

    // Extrair quantidade de peças do carrinho ou fallback
    let pecasCount = 0;
    if (Array.isArray(metadata?.cart)) {
      pecasCount = metadata.cart.reduce((sum: number, it: any) => sum + (Number(it.qty) || 1), 0);
    } else {
      pecasCount = 1; // Fallback caso não haja cart array
    }

    const amount = Number(tx.amount) || 0;

    // Acumulador de vendedor
    const currentSeller = sellerMap.get(sellerUid) || {
      uid: sellerUid,
      nome: profile?.display_name || profile?.name || "Colaborador",
      role,
      storeId: sId,
      storeName,
      totalFaturado: 0,
      qtdTransacoes: 0,
      qtdPecas: 0,
    };

    currentSeller.totalFaturado += amount;
    currentSeller.qtdTransacoes += 1;
    currentSeller.qtdPecas += pecasCount;
    sellerMap.set(sellerUid, currentSeller);

    // Acumulador de loja
    if (sId) {
      if (!storeAgg[sId]) {
        storeAgg[sId] = { totalFaturado: 0, qtdTransacoes: 0, qtdPecas: 0 };
      }
      storeAgg[sId].totalFaturado += amount;
      storeAgg[sId].qtdTransacoes += 1;
      storeAgg[sId].qtdPecas += pecasCount;
    }
  }

  // Contar celulares vendidos por loja para taxa de anexo
  const phonesByStore: Record<string, number> = {};
  for (const s of sales) {
    const sId = s.store_id || "";
    if (sId) {
      phonesByStore[sId] = (phonesByStore[sId] || 0) + 1;
    }
  }

  const storeMetrics: Record<string, StoreAccessoryMetrics> = {};
  for (const s of stores) {
    const agg = storeAgg[s.id] || { totalFaturado: 0, qtdTransacoes: 0, qtdPecas: 0 };
    const phones = phonesByStore[s.id] || 0;
    const ticketMedio = agg.qtdTransacoes > 0 ? agg.totalFaturado / agg.qtdTransacoes : 0;
    const taxaAnexo = phones > 0 ? agg.qtdPecas / phones : agg.qtdPecas;

    storeMetrics[s.id] = {
      storeId: s.id,
      storeName: s.name,
      totalFaturado: agg.totalFaturado,
      qtdTransacoes: agg.qtdTransacoes,
      qtdPecas: agg.qtdPecas,
      ticketMedioTransacao: ticketMedio,
      taxaAnexo: Number(taxaAnexo.toFixed(2)),
      totalCelularesLoja: phones,
    };
  }

  // Criar array e calcular patentes
  const ranking: RankSellerAccessory[] = Array.from(sellerMap.values()).map((item) => {
    const ticketMedioTransacao = item.qtdTransacoes > 0 ? item.totalFaturado / item.qtdTransacoes : 0;
    const ticketMedioPeca = item.qtdPecas > 0 ? item.totalFaturado / item.qtdPecas : 0;
    const patent = calculateAccessoryPatent(item.totalFaturado);

    return {
      ...item,
      ticketMedioTransacao,
      ticketMedioPeca,
      patent,
    };
  });

  // Ordenar por total faturado (critério principal de acessórios)
  ranking.sort((a, b) => b.totalFaturado - a.totalFaturado);

  return { ranking, storeMetrics };
}
