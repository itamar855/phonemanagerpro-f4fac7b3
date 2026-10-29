import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  FileText, ShoppingBag, Wrench, Wallet, Trophy, Star, Users, Camera,
} from "lucide-react";
import { toast } from "sonner";
import { gerarNotaFiscalInterna, type NotaFiscalData } from "@/utils/notaFiscalInterna";
import { RelatorioDiarioTab } from "@/components/features/relatorios/RelatorioDiarioTab";
import { calculateOSItemMetrics } from "@/utils/osCalculations";
import {
  fetchSettledItemIds,
  fetchSettlementsHistory,
  type CommissionSettlement,
} from "@/utils/commissionSettlement";
import {
  formatCurrency,
  formatPct,
  MONTHS,
  COLORS,
  PDF_PRIMARY,
  PDF_GREEN,
  PDF_RED,
  pdfHeader,
  pdfFooter,
  pdfKpiRow,
  pdfTableHead,
  pdfTableRow,
  pdfCheckPage,
  exportCSV,
} from "@/components/features/relatorios/relatorioPdf";
import {
  getPeriodDates,
  getPeriodLabel,
  Filters,
  ExportBtns,
} from "@/components/features/relatorios/types";
import { ComissoesTab } from "@/components/features/relatorios/ComissoesTab";
import { DreTab } from "@/components/features/relatorios/DreTab";
import { VendasTab } from "@/components/features/relatorios/VendasTab";
import { OsTab } from "@/components/features/relatorios/OsTab";
import { CaixaTab } from "@/components/features/relatorios/CaixaTab";
import { RankingTab } from "@/components/features/relatorios/RankingTab";
import { FinanceiroTab } from "@/components/features/relatorios/FinanceiroTab";
import {
  aggregatePhoneRanking,
  aggregateAccessoryRanking,
  type RankSellerPhone,
  type RankSellerAccessory,
  type StoreAccessoryMetrics,
} from "@/utils/rankingGamification";

const Relatorios = () => {
  const { user, userRole, userPermissions, activeStoreId } = useAuth();
  const isAdmin = userRole === "admin";
  const canSettleCommissions = isAdmin || userPermissions?.gerenciar_financeiro === true;
  const [tab, setTab] = useState("dre");
  const [stores, setStores] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [period, setPeriod] = useState("today");
  const [storeId, setStoreId] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [specificDay, setSpecificDay] = useState(new Date().toISOString().split("T")[0]);
  const [rankPeriod, setRankPeriod] = useState("today");
  const [rankSpecificDay, setRankSpecificDay] = useState(new Date().toISOString().split("T")[0]);
  const [rankCustomStart] = useState("");
  const [rankCustomEnd] = useState("");
  const [notaLoading, setNotaLoading] = useState<string | null>(null);

  const [dre, setDre] = useState<any>({});
  const [monthlyData, setMonthlyData] = useState<any[]>([]);
  const [storeBreakdown, setStoreBreakdown] = useState<any[]>([]);
  const [salesDetail, setSalesDetail] = useState<any[]>([]);
  const [rankingProducts, setRankingProducts] = useState<any[]>([]);
  const [osData, setOsData] = useState<any[]>([]);
  const [osStats, setOsStats] = useState<any>({});
  const [osFilterTechId, setOsFilterTechId] = useState("all");
  const [osFilterStatus, setOsFilterStatus] = useState("all");
  const [osDateMode, setOsDateMode] = useState<"delivery" | "entry">("delivery");
  const [osSearch, setOsSearch] = useState("");
  const [caixaData, setCaixaData] = useState<any[]>([]);
  const [caixaStats, setCaixaStats] = useState<any>({});
  const [ranking, setRanking] = useState<any[]>([]);
  const [rankingPhones, setRankingPhones] = useState<RankSellerPhone[]>([]);
  const [rankingAccessories, setRankingAccessories] = useState<RankSellerAccessory[]>([]);
  const [storeAccessoryMetrics, setStoreAccessoryMetrics] = useState<Record<string, StoreAccessoryMetrics>>({});
  const [comissoes, setComissoes] = useState<any[]>([]);
  const [leadsData, setLeadsData] = useState<any>({ total: 0, bySource: [], conversion: 0 });
  const [customerMap, setCustomerMap] = useState<Map<string, any>>(new Map());
  const [financeiroData, setFinanceiroData] = useState<any[]>([]);
  const [financeiroStats, setFinanceiroStats] = useState<any>({ totalEntradas: 0, totalSaidas: 0, saldoLiquido: 0 });

  // ─ Liquidação de Comissões ──────────────────────────
  const [settledSaleIds, setSettledSaleIds] = useState<Set<string>>(new Set());
  const [settledOsIds, setSettledOsIds] = useState<Set<string>>(new Set());
  const [settlementsHistory, setSettlementsHistory] = useState<CommissionSettlement[]>([]);
  const [rawSalesForPayout, setRawSalesForPayout] = useState<any[]>([]);
  const [rawOsForPayout, setRawOsForPayout] = useState<any[]>([]);
  const [osItemsForPayout, setOsItemsForPayout] = useState<any[]>([]);
  const [roleMapForPayout, setRoleMapForPayout] = useState<Map<string, any>>(new Map());

  // ─ Diário ───────────────────────────────────────
  const [diarioDay, setDiarioDay] = useState(new Date().toISOString().split("T")[0]);
  const [diarioData, setDiarioData] = useState<any>(null);
  const [diarioLoading, setDiarioLoading] = useState(false);

  useEffect(() => {
    supabase.from("stores").select("*").then(r => setStores(r.data ?? []));
    supabase.from("profiles").select("*").then(r => setProfiles(r.data ?? []));
  }, []);

  useEffect(() => {
    if (activeStoreId && !isAdmin) setStoreId(activeStoreId);
  }, [activeStoreId, isAdmin]);

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.user_id, p.display_name ?? p.user_id])), [profiles]);
  const storeMap = useMemo(() => new Map(stores.map(s => [s.id, s])), [stores]);

  const currentStoreName = storeId !== "all" ? ((storeMap.get(storeId) as any)?.name ?? "Todas as Lojas") : "Todas as Lojas";
  const currentPeriodLabel = getPeriodLabel(period, customStart, customEnd, specificDay);
  const currentRankPeriodLabel = getPeriodLabel(rankPeriod, rankCustomStart, rankCustomEnd, rankSpecificDay);

  const filteredOSData = useMemo(() => {
    return osData.filter((o) => {
      if (osFilterTechId !== "all" && o.technician_id !== osFilterTechId) return false;
      if (osFilterStatus !== "all" && o.status !== osFilterStatus) return false;
      if (osSearch.trim()) {
        const q = osSearch.toLowerCase();
        const matchNum = String(o.order_number || "").includes(q);
        const matchCust = (o.customer_name || "").toLowerCase().includes(q);
        const matchDev = `${o.device_brand || ""} ${o.device_model || ""}`.toLowerCase().includes(q);
        if (!matchNum && !matchCust && !matchDev) return false;
      }
      return true;
    });
  }, [osData, osFilterTechId, osFilterStatus, osSearch]);

  const fetchDRE = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = isAdmin ? storeId : activeStoreId;
    const q = (t: any) => effectiveStoreId && effectiveStoreId !== "all" ? t.eq("store_id", effectiveStoreId) : t;
    const [salesRes, productsRes, txRes, osRes] = await Promise.all([
      q(supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end)),
      supabase.from("products").select("*"),
      q(supabase.from("transactions").select("*").gte("created_at", start).lte("created_at", end)),
      q(supabase.from("service_orders").select("*").eq("status", "delivered").or(`and(delivered_at.gte.${start},delivered_at.lte.${end}),and(delivered_at.is.null,created_at.gte.${start},created_at.lte.${end})`)),
    ]);
    const sales = salesRes.data ?? [];
    const products = productsRes.data ?? [];
    const tx = txRes.data ?? [];
    const os = osRes.data ?? [];
    const productMap = new Map(products.map((p: any) => [p.id, p]));

    // Fetch peças usadas nas OSs entregues no período
    let osItems: any[] = [];
    if (os.length > 0) {
      const { data: itemsData } = await supabase
        .from("service_order_items" as any)
        .select("service_order_id, unit_cost, quantity")
        .in("service_order_id", os.map((o: any) => o.id));
      osItems = itemsData ?? [];
    }

    const receitaAparelhos = sales.reduce((s: number, x: any) => s + Number(x.sale_price), 0);
    const receitaOS = os.reduce((s: number, x: any) => s + Number(x.final_price || x.estimated_price || 0), 0);
    const accSales = tx.filter((t: any) => t.type === "income" && t.category === "acessorio");
    const receitaAcessorios = accSales.reduce((s: number, t: any) => s + Number(t.amount), 0);

    const cmvAparelhos = sales.reduce((s: number, x: any) => s + Number((productMap.get(x.product_id) as any)?.cost_price || 0), 0);
    const cmvAcessorios = tx.filter((t: any) => t.type === "expense_pj" && t.category === "acessorio").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const cmvPecasOS = osItems.reduce((sum: number, item: any) => sum + (Number(item.unit_cost || 0) * Number(item.quantity || 1)), 0);

    const totalReceita = receitaAparelhos + receitaAcessorios + receitaOS;
    const totalCmv = cmvAparelhos + cmvAcessorios + cmvPecasOS;
    // Exclui 'reparo' de despesas PJ para evitar duplicidade de dedução com cmvPecasOS
    const despesasPJ = tx.filter((t: any) => t.type === "expense_pj" && t.category !== "acessorio" && t.category !== "reparo").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const despesasPF = tx.filter((t: any) => t.type === "expense_pf").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const proLabore = tx.filter((t: any) => t.type === "pro_labore").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const lucroBruto = totalReceita - totalCmv;
    const totalDespesas = despesasPJ + despesasPF + proLabore;
    const lucroLiquido = lucroBruto - totalDespesas;
    setDre({ receitaAparelhos, receitaAcessorios, receitaOS, totalReceita, cmvAparelhos, cmvAcessorios, cmvPecasOS, totalCmv, lucroBruto, despesasPJ, despesasPF, proLabore, totalDespesas, lucroLiquido, qtdVendasAparelhos: sales.length, qtdVendasAcessorios: accSales.length, qtdOS: os.length });

    const now = new Date();
    const mMap: Record<string, any> = {};
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); mMap[MONTHS[d.getMonth()].substring(0, 3)] = { receita: 0, despesa: 0 }; }
    sales.forEach((s: any) => { const k = MONTHS[new Date(s.created_at).getMonth()].substring(0, 3); if (mMap[k]) mMap[k].receita += Number(s.sale_price); });
    os.forEach((o: any) => { const k = MONTHS[new Date(o.delivered_at || o.created_at).getMonth()].substring(0, 3); if (mMap[k]) mMap[k].receita += Number(o.final_price || o.estimated_price || 0); });
    tx.forEach((t: any) => { if (t.type !== "sale" && t.type !== "income") { const k = MONTHS[new Date(t.created_at).getMonth()].substring(0, 3); if (mMap[k]) mMap[k].despesa += Number(t.amount); } });
    setMonthlyData(Object.entries(mMap).map(([name, d]) => ({ name, receita: d.receita, despesa: d.despesa, lucro: d.receita - d.despesa })));

    const sStats: Record<string, any> = {};
    sales.forEach((s: any) => {
      const name = (storeMap.get(s.store_id) as any)?.name || "Sem loja";
      if (!sStats[name]) sStats[name] = { vendas: 0, lucro: 0 };
      sStats[name].vendas += Number(s.sale_price);
      sStats[name].lucro += Number(s.sale_price) - Number((productMap.get(s.product_id) as any)?.cost_price || 0);
    });
    os.forEach((o: any) => {
      const name = (storeMap.get(o.store_id) as any)?.name || "Sem loja";
      if (!sStats[name]) sStats[name] = { vendas: 0, lucro: 0 };
      const val = Number(o.final_price || o.estimated_price || 0);
      sStats[name].vendas += val;
      const osCost = osItems.filter((i: any) => i.service_order_id === o.id).reduce((acc: number, i: any) => acc + (Number(i.unit_cost || 0) * Number(i.quantity || 1)), 0);
      sStats[name].lucro += (val - osCost);
    });
    setStoreBreakdown(Object.entries(sStats).map(([name, d]: any) => ({ name, ...d })));
  }, [period, storeId, customStart, customEnd, specificDay]);

  const fetchVendas = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = isAdmin ? storeId : activeStoreId;
    const [salesRes, productsRes, customersRes] = await Promise.all([
      supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }),
      supabase.from("products").select("*"),
      supabase.from("customers").select("*"),
    ]);
    const sales = (salesRes.data ?? []).filter((s: any) => effectiveStoreId === "all" || s.store_id === effectiveStoreId);
    const productMap = new Map((productsRes.data ?? []).map((p: any) => [p.id, p]));
    const cMap = new Map((customersRes.data ?? []).map((c: any) => [c.id, c]));
    setCustomerMap(cMap);
    const rows = sales.map((s: any) => {
      const p: any = productMap.get(s.product_id);
      const lucro = Number(s.sale_price) - Number(p?.cost_price || 0);
      return { _raw: s, _product: p, data: new Date(s.created_at).toLocaleDateString("pt-BR"), produto: p?.name ?? "—", marca: p?.brand ?? "—", loja: (storeMap.get(s.store_id) as any)?.name ?? "—", cliente: s.customer_name ?? "—", valor: Number(s.sale_price), custo: Number(p?.cost_price || 0), lucro, margem: Number(s.sale_price) > 0 ? (lucro / Number(s.sale_price)) * 100 : 0, dinheiro: Number(s.payment_cash), cartao: Number(s.payment_card), pix: Number(s.payment_pix), troca: s.has_trade_in ? "Sim ("+formatCurrency(Number(s.trade_in_value || 0))+")" : "Nao", comissao: formatCurrency(Number(s.commission_value || 0)) };
    });
    setSalesDetail(rows);
    const prodRank: Record<string, any> = {};
    rows.forEach(r => { if (!prodRank[r.produto]) prodRank[r.produto] = { produto: r.produto, marca: r.marca, qtd: 0, total: 0, lucro: 0 }; prodRank[r.produto].qtd++; prodRank[r.produto].total += r.valor; prodRank[r.produto].lucro += r.lucro; });
    setRankingProducts(Object.values(prodRank).sort((a, b) => b.total - a.total).slice(0, 10));
  }, [period, storeId, customStart, customEnd, specificDay]);

  const fetchOS = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = isAdmin ? storeId : activeStoreId;
    let query = supabase.from("service_orders").select("*");
    if (effectiveStoreId && effectiveStoreId !== "all") {
      query = query.eq("store_id", effectiveStoreId);
    }
    const { data: allRaw } = await query
      .or(`and(delivered_at.gte.${start},delivered_at.lte.${end}),and(created_at.gte.${start},created_at.lte.${end})`)
      .order("created_at", { ascending: false });
    const all = ((allRaw ?? []) as any[]);

    // Fetch peças usadas para apurar custo real e margem da OS
    let osItems: any[] = [];
    if (all.length > 0) {
      const { data: itemsData } = await supabase
        .from("service_order_items" as any)
        .select("service_order_id, unit_cost, quantity")
        .in("service_order_id", all.map((o: any) => o.id));
      osItems = itemsData ?? [];
    }

    const { data: rolesData } = await supabase
      .from("user_roles")
      .select("user_id, role, commission_services_percent, commission_on_services");
    const roleMap = new Map((rolesData ?? []).map((r: any) => [r.user_id, r]));

    const startDate = new Date(start);
    const endDate = new Date(end);

    const recebidasNoPeriodo = all.filter((o) => {
      const d = new Date(o.created_at);
      return d >= startDate && d <= endDate;
    });

    const entreguesNoPeriodo = all.filter((o) => {
      if (o.status !== "delivered") return false;
      const d = o.delivered_at ? new Date(o.delivered_at) : new Date(o.created_at);
      return d >= startDate && d <= endDate;
    });

    const entreguesIds = new Set(entreguesNoPeriodo.map((o) => o.id));

    const totalReceitaOS = entreguesNoPeriodo.reduce(
      (s, o) => s + Number(o.final_price || o.estimated_price || 0),
      0
    );

    const custoPecasOS = osItems
      .filter((item: any) => entreguesIds.has(item.service_order_id))
      .reduce((s: number, item: any) => s + (Number(item.unit_cost || 0) * Number(item.quantity || 1)), 0);

    const lucroBrutoOS = Math.max(0, totalReceitaOS - custoPecasOS);

    const techStats: Record<string, any> = {};
    all.forEach((o) => {
      const techId = o.technician_id;
      const name = techId ? (profileMap.get(techId) ?? "Técnico") : "Sem técnico";
      if (!techStats[name]) {
        techStats[name] = {
          tecnico: name,
          techId,
          total: 0,
          entregues: 0,
          receita: 0,
          custoPecas: 0,
          lucroBruto: 0,
          comissao: 0,
        };
      }
      techStats[name].total++;

      if (entreguesIds.has(o.id)) {
        techStats[name].entregues++;
        const osParts = osItems.filter((i: any) => i.service_order_id === o.id);
        const metrics = calculateOSItemMetrics(o, osParts, techId ? roleMap.get(techId) : null);
        techStats[name].receita += metrics.receitaOS;
        techStats[name].custoPecas += metrics.custoPecas;
        techStats[name].lucroBruto += metrics.lucroBrutoOS;
        techStats[name].comissao += metrics.comissaoTecnico;
      }
    });

    const serviceStats: Record<string, number> = {};
    all.forEach((o) => {
      if (o.requested_service) {
        serviceStats[o.requested_service] = (serviceStats[o.requested_service] || 0) + 1;
      }
    });

    setOsData(all);
    setOsStats({
      total: all.length,
      recebidas: recebidasNoPeriodo.length,
      delivered: entreguesNoPeriodo.length,
      cancelled: all.filter((o) => o.status === "cancelled").length,
      open: all.filter((o) => !["delivered", "cancelled"].includes(o.status)).length,
      totalReceita: totalReceitaOS,
      custoPecas: custoPecasOS,
      lucroBruto: lucroBrutoOS,
      ticketMedio: entreguesNoPeriodo.length > 0 ? totalReceitaOS / entreguesNoPeriodo.length : 0,
      byTech: Object.values(techStats).sort((a: any, b: any) => b.receita - a.receita),
      byService: Object.entries(serviceStats).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
    });
  }, [period, storeId, customStart, customEnd, specificDay, profileMap, userRole, activeStoreId]);

  const fetchCaixa = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = isAdmin ? storeId : activeStoreId;
    const { data: registers } = await supabase.from("cash_registers" as any).select("*").gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false });
    const all = ((registers ?? []) as any[]).filter(r => effectiveStoreId === "all" || r.store_id === effectiveStoreId);
    const closed = all.filter(r => r.status === "closed");
    setCaixaData(all.map(r => ({ data: new Date(r.created_at).toLocaleDateString("pt-BR"), loja: (storeMap.get(r.store_id) as any)?.name ?? "—", status: r.status === "open" ? "Aberto" : "Fechado", abertura: Number(r.opening_amount || 0), fechamento: Number(r.closing_amount || 0), esperado: Number(r.expected_amount || 0), diferenca: Number(r.difference || 0), motivo: r.difference_reason ?? "" })));
    setCaixaStats({ total: all.length, abertos: all.filter(r => r.status === "open").length, fechados: closed.length, totalDiferenca: closed.reduce((s, r) => s + Number(r.difference || 0), 0), comDiferenca: closed.filter(r => Math.abs(Number(r.difference || 0)) > 5).length });
  }, [period, storeId, customStart, customEnd, specificDay]);

  const fetchRanking = useCallback(async () => {
    const { start, end } = getPeriodDates(rankPeriod, rankCustomStart, rankCustomEnd, rankSpecificDay);
    const effectiveStoreId = isAdmin ? storeId : activeStoreId;
    const [salesRes, productsRes, osRes, rolesRes, settledIdsRes, historyRes, accTxRes] = await Promise.all([
      supabase.from("sales").select("*, products(*)").gte("created_at", start).lte("created_at", end),
      supabase.from("products").select("*"),
      supabase.from("service_orders").select("*").eq("status", "delivered").or(`and(delivered_at.gte.${start},delivered_at.lte.${end}),and(delivered_at.is.null,created_at.gte.${start},created_at.lte.${end})`),
      supabase.from("user_roles").select("*"),
      fetchSettledItemIds(),
      fetchSettlementsHistory(effectiveStoreId),
      supabase.from("transactions").select("*").eq("type", "income").eq("category", "acessorio").gte("created_at", start).lte("created_at", end),
    ]);
    const allSales = ((salesRes.data ?? []) as any[]);
    const sales = allSales.filter(s => effectiveStoreId === "all" || s.store_id === effectiveStoreId);
    const productMap = new Map((productsRes.data ?? []).map((p: any) => [p.id, p]));
    const os = ((osRes.data ?? []) as any[]).filter(o => effectiveStoreId === "all" || o.store_id === effectiveStoreId);
    const roles = (rolesRes.data ?? []) as any[];
    const roleMap = new Map(roles.map((r: any) => [r.user_id, r]));
    const allAccTx = (accTxRes.data ?? []) as any[];

    const { settledSaleIds: sSaleIds, settledOsIds: sOsIds } = settledIdsRes;
    setSettledSaleIds(sSaleIds);
    setSettledOsIds(sOsIds);
    setSettlementsHistory(historyRes);

    // Gamification: Ranking Geral de Celulares (Vendedoras + Técnicos)
    const phoneRanking = aggregatePhoneRanking({
      sales: allSales,
      profiles,
      stores,
      userRoles: roles,
      productMap,
    });
    setRankingPhones(phoneRanking);

    // Gamification: Ranking de Acessórios (Por Loja / Metas Locais)
    const { ranking: accRanking, storeMetrics: accMetrics } = aggregateAccessoryRanking({
      transactions: allAccTx,
      sales: allSales,
      profiles,
      stores,
      userRoles: roles,
      filterStoreId: effectiveStoreId,
    });
    setRankingAccessories(accRanking);
    setStoreAccessoryMetrics(accMetrics);

    // Fetch peças usadas para apurar margem líquida dos reparos
    let osItems: any[] = [];
    if (os.length > 0) {
      const { data: itemsData } = await supabase
        .from("service_order_items" as any)
        .select("service_order_id, unit_cost, quantity")
        .in("service_order_id", os.map((o: any) => o.id));
      osItems = itemsData ?? [];
    }

    setRawSalesForPayout(sales);
    setRawOsForPayout(os);
    setOsItemsForPayout(osItems);
    setRoleMapForPayout(roleMap);

    const stats: Record<string, any> = {};
    const ensure = (uid: string) => {
      if (!stats[uid]) {
        const role = roleMap.get(uid)?.role || "vendedor";
        stats[uid] = {
          uid,
          nome: profileMap.get(uid) ?? "Usuário",
          role,
          totalVendas: 0,
          qtdVendas: 0,
          lucro: 0,
          comissoes: 0,
          comissoesPendentes: 0,
          comissoesLiquidadas: 0,
          comissoesVendas: 0,
          comissoesOS: 0,
          osEntregues: 0,
          totalServicos: 0,
        };
      }
    };
    
    // CANONICAL_SALES_COMMISSION_OWNER = created_by
    sales.forEach((s: any) => { 
      ensure(s.created_by); 
      stats[s.created_by].totalVendas += Number(s.sale_price); 
      stats[s.created_by].qtdVendas++; 
      const p: any = productMap.get(s.product_id); 
      stats[s.created_by].lucro += Number(s.sale_price) - Number(p?.cost_price || 0); 
      const comm = Number(s.commission_value || 0);
      stats[s.created_by].comissoes += comm; 
      stats[s.created_by].comissoesVendas += comm;

      if (sSaleIds.has(s.id)) {
        stats[s.created_by].comissoesLiquidadas += comm;
      } else {
        stats[s.created_by].comissoesPendentes += comm;
      }
    });

    os.forEach((o: any) => { 
      // OS sem técnico NÃO gera comissão técnica para atendente (Salvaguarda 1 e 9)
      if (o.technician_id) {
        const uid = o.technician_id;
        ensure(uid); 
        stats[uid].osEntregues++;
        const osTotal = Number(o.final_price || o.estimated_price || 0);
        stats[uid].totalServicos += osTotal;
        stats[uid].totalVendas += osTotal;

        const osParts = osItems.filter((item: any) => item.service_order_id === o.id);
        const userRoleData = roleMap.get(uid);
        const metrics = calculateOSItemMetrics(o, osParts, userRoleData);

        stats[uid].lucro += metrics.lucroBrutoOS;
        stats[uid].comissoes += metrics.comissaoTecnico;
        stats[uid].comissoesOS += metrics.comissaoTecnico;

        if (sOsIds.has(o.id)) {
          stats[uid].comissoesLiquidadas += metrics.comissaoTecnico;
        } else {
          stats[uid].comissoesPendentes += metrics.comissaoTecnico;
        }
      }
    });

    const sorted = Object.values(stats).sort((a, b) => b.totalVendas - a.totalVendas);
    setRanking(sorted);
    setComissoes(sorted.filter(s => s.comissoes > 0).sort((a, b) => b.comissoes - a.comissoes));
  }, [rankPeriod, storeId, rankCustomStart, rankCustomEnd, rankSpecificDay, profileMap, isAdmin, activeStoreId, profiles, stores]);

  const fetchLeads = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = isAdmin ? storeId : activeStoreId;
    let q = supabase.from("leads").select("*").gte("created_at", start).lte("created_at", end);
    if (effectiveStoreId && effectiveStoreId !== "all") q = q.eq("store_id", effectiveStoreId);
    const { data } = await q;
    if (!data) return;
    const total = data.length;
    const sourceMap: Record<string, number> = {};
    data.forEach(l => { const src = l.source || "outro"; sourceMap[src] = (sourceMap[src] || 0) + 1; });
    const bySource = Object.entries(sourceMap).map(([name, value]) => ({ name, value }));
    const converted = data.filter(l => l.status === "concluido").length;
    setLeadsData({ total, bySource, conversion: total > 0 ? (converted / total) * 100 : 0 });
  }, [period, storeId, customStart, customEnd, specificDay]);

  const fetchFinanceiro = useCallback(async () => {
    const { start, end } = getPeriodDates(period, customStart, customEnd, specificDay);
    const effectiveStoreId = isAdmin ? storeId : activeStoreId;
    
    let q = supabase
      .from("transactions")
      .select("*")
      .gte("created_at", start)
      .lte("created_at", end)
      .order("created_at", { ascending: false });
      
    if (effectiveStoreId && effectiveStoreId !== "all") {
      q = q.eq("store_id", effectiveStoreId);
    }
    
    const { data: txs, error } = await q;
    if (error) {
      console.error("Error fetching transactions for financeiro:", error);
      return;
    }
    
    const { data: accounts } = await supabase.from("store_bank_accounts").select("id, bank_name, owner_type");
    const accountMap = new Map((accounts ?? []).map(a => [a.id, a]));
    
    let totalEntradas = 0;
    let totalSaidas = 0;
    
    const mapped = (txs ?? []).map((t: any) => {
      const amt = Number(t.amount) || 0;
      const isEntrada = ["income", "sale", "entrada"].includes(t.type);
      if (isEntrada) {
        totalEntradas += amt;
      } else {
        totalSaidas += amt;
      }
      
      const srcAcc = t.source_account_id ? accountMap.get(t.source_account_id) : null;
      const destAcc = t.destination_account_id ? accountMap.get(t.destination_account_id) : null;
      const contaText = srcAcc 
        ? `${srcAcc.bank_name} (${srcAcc.owner_type})` 
        : destAcc 
          ? `${destAcc.bank_name} (${destAcc.owner_type})` 
          : "Dinheiro (Gaveta)";
          
      const tipoLabel = isEntrada ? "Entrada" : "Saída";
      
      return {
        _raw: t,
        data: new Date(t.created_at).toLocaleDateString("pt-BR"),
        descricao: t.description || t.category || "Sem descrição",
        categoria: t.category || "Outros",
        tipo: tipoLabel,
        isEntrada,
        conta: contaText,
        valor: amt
      };
    });
    
    setFinanceiroData(mapped);
    setFinanceiroStats({
      totalEntradas,
      totalSaidas,
      saldoLiquido: totalEntradas - totalSaidas
    });
  }, [period, storeId, customStart, customEnd, specificDay, activeStoreId, userRole]);

  useEffect(() => { if (tab === "dre") fetchDRE(); }, [tab, fetchDRE]);
  useEffect(() => { if (tab === "vendas") fetchVendas(); }, [tab, fetchVendas]);
  useEffect(() => { if (tab === "os") fetchOS(); }, [tab, fetchOS]);
  useEffect(() => { if (tab === "caixa") fetchCaixa(); }, [tab, fetchCaixa]);
  useEffect(() => { if (tab === "ranking" || tab === "comissoes") fetchRanking(); }, [tab, fetchRanking]);
  useEffect(() => { if (tab === "leads") fetchLeads(); }, [tab, fetchLeads]);
  useEffect(() => { if (tab === "financeiro") fetchFinanceiro(); }, [tab, fetchFinanceiro]);

  // Fetch diário consolidado
  const fetchDiario = useCallback(async () => {
    setDiarioLoading(true);
    const d = new Date(diarioDay + "T00:00:00");
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
    const end   = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
    const effectiveStoreId = isAdmin ? storeId : activeStoreId;
    const q = (t: any) => effectiveStoreId && effectiveStoreId !== "all" ? t.eq("store_id", effectiveStoreId) : t;

    const [salesRes, osRes, caixaRes, txRes] = await Promise.all([
      q(supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end)),
      q(supabase.from("service_orders").select("*").or(`and(delivered_at.gte.${start},delivered_at.lte.${end}),and(delivered_at.is.null,created_at.gte.${start},created_at.lte.${end})`)),
      q(supabase.from("cash_registers" as any).select("*").gte("created_at", start).lte("created_at", end)),
      q(supabase.from("transactions").select("*").gte("created_at", start).lte("created_at", end)),
    ]);

    const sales = salesRes.data ?? [];
    const os = osRes.data ?? [];
    const caixas = (caixaRes.data ?? []) as any[];
    const txs = txRes.data ?? [];

    const receitaVendas = sales.reduce((s: number, x: any) => s + Number(x.sale_price), 0);
    const receitaOS = (os as any[]).filter((o: any) => o.status === "delivered").reduce((s: number, o: any) => s + Number(o.final_price || o.estimated_price || 0), 0);
    const despesas = (txs as any[]).filter((t: any) => ["expense", "expense_pj", "expense_pf", "saida"].includes(t.type)).reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalCaixa = caixas.filter(c => c.status === "closed").reduce((s, c) => s + Number(c.closing_amount || 0), 0);

    // Cash entries totals (confirmed only)
    const cashIds = caixas.map((c: any) => c.id);
    let cashEntries: any[] = [];
    if (cashIds.length > 0) {
      const { data: ce } = await supabase.from("cash_entries" as any)
        .select("*")
        .in("cash_register_id", cashIds)
        .eq("confirmed", true);
      cashEntries = ce ?? [];
    }
    const entradas = cashEntries.filter((e: any) => ["entrada"].includes(e.type)).reduce((s, e) => s + Number(e.amount), 0);
    const saidas = cashEntries.filter((e: any) => ["saida", "sangria"].includes(e.type)).reduce((s, e) => s + Number(e.amount), 0);

    // Sales and OS by payment method
    const osDelivered = (os as any[]).filter((o: any) => o.status === "delivered");
    const totalDinheiro = sales.reduce((s: number, x: any) => s + Number(x.payment_cash || 0), 0)
                        + osDelivered.reduce((s: number, x: any) => s + Number(x.payment_cash || 0), 0);
    const totalCartao = sales.reduce((s: number, x: any) => s + Number(x.payment_card || 0), 0)
                      + osDelivered.reduce((s: number, x: any) => s + Number(x.payment_card || 0), 0);
    const totalPix = sales.reduce((s: number, x: any) => s + Number(x.payment_pix || 0), 0)
                   + osDelivered.reduce((s: number, x: any) => s + Number(x.payment_pix || 0), 0);

    // Top sellers
    const sellerMap: Record<string, number> = {};
    (sales as any[]).forEach((s: any) => {
      const uid = s.created_by;
      sellerMap[uid] = (sellerMap[uid] || 0) + Number(s.sale_price);
    });
    const topSellers = Object.entries(sellerMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([uid, total]) => ({ nome: profileMap.get(uid) ?? "Usuário", total }));

    setDiarioData({
      date: d.toLocaleDateString("pt-BR"),
      qtdVendas: sales.length,
      receitaVendas,
      qtdOS: os.length,
      osEntregues: (os as any[]).filter((o: any) => o.status === "delivered").length,
      receitaOS,
      receitaTotal: receitaVendas + receitaOS,
      despesas,
      lucro: receitaVendas + receitaOS - despesas,
      totalDinheiro, totalCartao, totalPix,
      caixasAbertos: caixas.filter(c => c.status === "open").length,
      caixasFechados: caixas.filter(c => c.status === "closed").length,
      totalCaixa,
      entradasCaixa: entradas,
      saidasCaixa: saidas,
      topSellers,
      qtdTxs: txs.length,
    });
    setDiarioLoading(false);
  }, [diarioDay, storeId, profileMap, userRole, activeStoreId]);

  useEffect(() => { if (tab === "diario") fetchDiario(); }, [tab, fetchDiario]);
  useEffect(() => { if (tab === "diario") fetchDiario(); }, [diarioDay]);

  const handleGerarNota = async (row: any, enviarWhatsApp = false) => {
    const sale = row._raw; const product = row._product;
    const store = storeMap.get(sale.store_id) as any;
    setNotaLoading(sale.id);
    try {
      const numeroNota = "VND-" + sale.id.slice(0, 8).toUpperCase();
      const customer = sale.customer_id ? customerMap.get(sale.customer_id) : null;
      const data: NotaFiscalData = {
        numeroNota, dataVenda: new Date(sale.created_at).toLocaleString("pt-BR"),
        lojaNome: store?.name ?? "Loja", lojaCnpj: store?.cnpj, lojaEndereco: store?.address,
        lojaTelefone: store?.phone, lojaWhatsapp: store?.whatsapp, lojaInstagram: store?.instagram, lojaLogoUrl: store?.logo_url,
        clienteNome: sale.customer_name || customer?.name || undefined,
        clienteCpf: sale.customer_cpf || customer?.cpf || undefined,
        clienteTelefone: sale.customer_phone || customer?.phone || undefined,
        clienteEndereco: sale.customer_address || customer?.address || undefined,
        produtoNome: product?.name ?? "Produto", produtoMarca: product?.brand ?? "",
        produtoModelo: product?.model, produtoImei: product?.imei ?? undefined, produtoCor: product?.color ?? undefined,
        valorVenda: Number(sale.sale_price), valorDinheiro: Number(sale.payment_cash) || undefined,
        valorCartao: Number(sale.payment_card) || undefined, valorPix: Number(sale.payment_pix) || undefined,
        tradeIn: sale.has_trade_in, tradeInValor: sale.trade_in_value ? Number(sale.trade_in_value) : undefined,
        tradeInNome: sale.trade_in_device_name ?? undefined, observacoes: sale.notes ?? undefined,
      };
      const doc = await gerarNotaFiscalInterna(data);
      if (enviarWhatsApp) {
        if (!sale.customer_phone) { toast.error("Cliente sem telefone!"); setNotaLoading(null); return; }
        const pdfBlob = doc.output("blob");
        const { data: uploadData, error } = await supabase.storage.from("comprovantes").upload("notas/"+numeroNota+"-"+Date.now()+".pdf", pdfBlob, { upsert: true, contentType: "application/pdf" });
        if (error) { toast.error("Erro ao enviar PDF"); setNotaLoading(null); return; }
        const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(uploadData.path);
        const phone = sale.customer_phone.replace(/\D/g, "");
        const msg = encodeURIComponent("Ola " + (sale.customer_name || "") + "! Segue o comprovante da sua compra. Comprovante No " + numeroNota + ": " + urlData.publicUrl);
        window.open("https://wa.me/55" + phone + "?text=" + msg, "_blank");
        toast.success("WhatsApp aberto!");
      } else {
        doc.save("nota-" + numeroNota + ".pdf");
        toast.success("Nota gerada!");
      }
    } catch { toast.error("Erro ao gerar nota."); }
    setNotaLoading(null);
  };

  const filterProps = { period, setPeriod, storeId, setStoreId, stores, customStart, setCustomStart, customEnd, setCustomEnd, specificDay, setSpecificDay, userRole };

  const dreLines = [
    { label: "Receita de Aparelhos", value: dre.receitaAparelhos ?? 0, sub: (dre.qtdVendasAparelhos ?? 0) + " vendas", type: "income" },
    { label: "Receita de Acessorios", value: dre.receitaAcessorios ?? 0, sub: (dre.qtdVendasAcessorios ?? 0) + " vendas", type: "income" },
    { label: "Receita de Servicos (OS)", value: dre.receitaOS ?? 0, sub: (dre.qtdOS ?? 0) + " entregues", type: "income" },
    { label: "= Receita Total", value: dre.totalReceita ?? 0, type: "total", bold: true },
    { label: "(-) CMV Aparelhos", value: -(dre.cmvAparelhos ?? 0), type: "expense" },
    { label: "(-) CMV Acessorios", value: -(dre.cmvAcessorios ?? 0), type: "expense" },
    { label: "(-) Custo Peças OS", value: -(dre.cmvPecasOS ?? 0), type: "expense" },
    { label: "= Total CMV", value: -(dre.totalCmv ?? 0), type: "total", bold: true },
    { label: "= Lucro Bruto", value: dre.lucroBruto ?? 0, type: "total", bold: true },
    { label: "(-) Despesas PJ (Operacionais)", value: -(dre.despesasPJ ?? 0), type: "expense" },
    { label: "(-) Despesas PF (Pessoais)", value: -(dre.despesasPF ?? 0), type: "expense" },
    { label: "(-) Pro-labore", value: -(dre.proLabore ?? 0), type: "expense" },
    { label: "= Total de Despesas", value: -(dre.totalDespesas ?? 0), type: "total", bold: true },
    { label: "= LUCRO LIQUIDO", value: dre.lucroLiquido ?? 0, type: "result", bold: true },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Relatorios</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Analises financeiras e operacionais</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 w-full">
          <TabsTrigger value="diario" className="text-xs gap-1.5">📅 Diário</TabsTrigger>
          <TabsTrigger value="dre" className="text-xs gap-1.5"><FileText className="h-3.5 w-3.5" /> DRE</TabsTrigger>
          <TabsTrigger value="financeiro" className="text-xs gap-1.5"><Wallet className="h-3.5 w-3.5" /> Financeiro</TabsTrigger>
          <TabsTrigger value="vendas" className="text-xs gap-1.5"><ShoppingBag className="h-3.5 w-3.5" /> Vendas</TabsTrigger>
          <TabsTrigger value="os" className="text-xs gap-1.5"><Wrench className="h-3.5 w-3.5" /> OS</TabsTrigger>
          <TabsTrigger value="caixa" className="text-xs gap-1.5"><Wallet className="h-3.5 w-3.5" /> Caixa</TabsTrigger>
          <TabsTrigger value="ranking" className="text-xs gap-1.5"><Trophy className="h-3.5 w-3.5" /> Ranking</TabsTrigger>
          <TabsTrigger value="comissoes" className="text-xs gap-1.5"><Star className="h-3.5 w-3.5" /> Comissoes</TabsTrigger>
          <TabsTrigger value="leads" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" /> Leads</TabsTrigger>
        </TabsList>

        {/* ── DIÁRIO ─────────────────────────────────────────── */}
        <TabsContent value="diario" className="space-y-4 mt-4">
          <RelatorioDiarioTab
            diarioDay={diarioDay}
            setDiarioDay={setDiarioDay}
            userRole={userRole}
            storeId={storeId}
            setStoreId={setStoreId}
            stores={stores}
            diarioLoading={diarioLoading}
            diarioData={diarioData}
            currentStoreName={currentStoreName}
            formatCurrency={formatCurrency}
            pdfHeader={pdfHeader}
            pdfKpiRow={pdfKpiRow}
            pdfTableHead={pdfTableHead}
            pdfCheckPage={pdfCheckPage}
            pdfTableRow={pdfTableRow}
            pdfFooter={pdfFooter}
            PDF_GREEN={PDF_GREEN}
            PDF_RED={PDF_RED}
            PDF_PRIMARY={PDF_PRIMARY}
          />
        </TabsContent>

        <TabsContent value="financeiro" className="space-y-4 mt-4">
          <FinanceiroTab
            filterProps={filterProps}
            financeiroData={financeiroData}
            financeiroStats={financeiroStats}
            currentPeriodLabel={currentPeriodLabel}
            currentStoreName={currentStoreName}
          />
        </TabsContent>

        <TabsContent value="leads" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end justify-between gap-3"><Filters {...filterProps} /></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-border/50"><CardHeader className="pb-2"><CardTitle className="text-sm font-display">Conversao de Leads</CardTitle></CardHeader>
              <CardContent className="flex flex-col items-center justify-center py-6">
                <div className="text-4xl font-bold text-primary">{leadsData.conversion.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground mt-1">Taxa de fechamento</p>
              </CardContent></Card>
            <Card className="border-border/50 md:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-sm font-display text-pink-500 flex items-center gap-2"><Camera className="h-4 w-4" /> Origem dos Leads</CardTitle></CardHeader>
              <CardContent><div className="h-[200px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={leadsData.bySource} layout="vertical"><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" hide /><YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="value" fill="hsl(330, 80%, 60%)" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div></CardContent></Card>
          </div>
          <div className="rounded-lg bg-pink-500/5 border border-pink-500/10 p-4">
            <h4 className="text-sm font-bold text-pink-700 mb-2">Dica de Performance</h4>
            <p className="text-xs text-pink-800/80">Leads vindos do Instagram costumam ter uma taxa de conversao 20% maior quando respondidos em menos de 5 minutos.</p>
          </div>
        </TabsContent>

        <TabsContent value="dre" className="space-y-4 mt-4">
          <DreTab
            filterProps={filterProps}
            dreLines={dreLines}
            dre={dre}
            currentPeriodLabel={currentPeriodLabel}
            currentStoreName={currentStoreName}
            monthlyData={monthlyData}
            storeBreakdown={storeBreakdown}
          />
        </TabsContent>

        <TabsContent value="vendas" className="space-y-4 mt-4">
          <VendasTab
            filterProps={filterProps}
            salesDetail={salesDetail}
            rankingProducts={rankingProducts}
            currentPeriodLabel={currentPeriodLabel}
            currentStoreName={currentStoreName}
            notaLoading={notaLoading}
            handleGerarNota={handleGerarNota}
          />
        </TabsContent>

        <TabsContent value="os" className="space-y-4 mt-4">
          <OsTab
            filterProps={filterProps}
            filteredOSData={filteredOSData}
            osStats={osStats}
            profileMap={profileMap}
            currentPeriodLabel={currentPeriodLabel}
            currentStoreName={currentStoreName}
            osFilterTechId={osFilterTechId}
            setOsFilterTechId={setOsFilterTechId}
            profiles={profiles}
            osFilterStatus={osFilterStatus}
            setOsFilterStatus={setOsFilterStatus}
            osDateMode={osDateMode}
            setOsDateMode={setOsDateMode}
            osSearch={osSearch}
            setOsSearch={setOsSearch}
          />
        </TabsContent>

        <TabsContent value="caixa" className="space-y-4 mt-4">
          <CaixaTab
            filterProps={filterProps}
            caixaData={caixaData}
            caixaStats={caixaStats}
            currentPeriodLabel={currentPeriodLabel}
            currentStoreName={currentStoreName}
          />
        </TabsContent>

        <TabsContent value="ranking" className="space-y-4 mt-4">
          <RankingTab
            rankPeriod={rankPeriod}
            setRankPeriod={setRankPeriod}
            rankSpecificDay={rankSpecificDay}
            setRankSpecificDay={setRankSpecificDay}
            isAdmin={isAdmin}
            storeId={storeId}
            setStoreId={setStoreId}
            stores={stores}
            ranking={ranking}
            rankingPhones={rankingPhones}
            rankingAccessories={rankingAccessories}
            storeAccessoryMetrics={storeAccessoryMetrics}
            currentRankPeriodLabel={currentRankPeriodLabel}
            currentStoreName={currentStoreName}
            activeStoreId={activeStoreId}
            currentUserId={user?.id}
          />
        </TabsContent>

        <TabsContent value="comissoes" className="space-y-4 mt-4">
          <ComissoesTab
            rankPeriod={rankPeriod}
            setRankPeriod={setRankPeriod}
            rankSpecificDay={rankSpecificDay}
            setRankSpecificDay={setRankSpecificDay}
            isAdmin={isAdmin}
            canSettleCommissions={canSettleCommissions}
            storeId={storeId}
            setStoreId={setStoreId}
            stores={stores}
            profiles={profiles}
            comissoes={comissoes}
            settlementsHistory={settlementsHistory}
            profileMap={profileMap}
            storeMap={storeMap}
            currentRankPeriodLabel={currentRankPeriodLabel}
            currentStoreName={currentStoreName}
            rawSalesForPayout={rawSalesForPayout}
            rawOsForPayout={rawOsForPayout}
            osItemsForPayout={osItemsForPayout}
            roleMapForPayout={roleMapForPayout}
            settledSaleIds={settledSaleIds}
            settledOsIds={settledOsIds}
            user={user}
            fetchRanking={fetchRanking}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Relatorios;
