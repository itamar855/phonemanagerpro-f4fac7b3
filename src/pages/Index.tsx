import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Package, TrendingUp, TrendingDown, Wrench,
  AlertTriangle, Zap, Store, Users,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from "recharts";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const COLORS = ["hsl(152, 60%, 45%)", "hsl(38, 92%, 50%)", "hsl(0, 62%, 50%)", "hsl(220, 25%, 50%)", "hsl(280, 50%, 50%)"];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const getPeriodDates = (period: string, customStart: string, customEnd: string) => {
  const now = new Date();
  if (period === "custom") {
    return {
      start: customStart ? new Date(customStart).toISOString() : new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      end: customEnd ? new Date(customEnd + "T23:59:59").toISOString() : now.toISOString(),
    };
  }
  if (period === "week") { const d = new Date(now); d.setDate(d.getDate() - 7); return { start: d.toISOString(), end: now.toISOString() }; }
  if (period === "month") return { start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(), end: now.toISOString() };
  if (period === "quarter") { const q = Math.floor(now.getMonth() / 3) * 3; return { start: new Date(now.getFullYear(), q, 1).toISOString(), end: now.toISOString() }; }
  return { start: new Date(now.getFullYear(), 0, 1).toISOString(), end: now.toISOString() };
};

const Dashboard = () => {
  const { user, userRole, userPermissions, activeStoreId, setActiveStoreId, userStoreIds } = useAuth();

  const isAdmin = userRole === "admin";
  const canSeeFinancials = isAdmin || userRole === "gerente";
  const can = (key: string) => isAdmin || (userPermissions?.[key] === true);

  const [activeStoreName, setActiveStoreName] = useState<string>(
    () => localStorage.getItem("cellmanager-active-store-name") || "Todas as lojas"
  );

  const [period, setPeriod] = useState("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Re-fetch quando os contextos essenciais carregam ou a loja ativa muda
  useEffect(() => { 
    if (userPermissions !== null && userStoreIds !== undefined) {
      fetchData(); 
    }
  }, [activeStoreId, userPermissions, userStoreIds, userRole, period, customStart, customEnd]);

  const [stats, setStats] = useState({
    totalStock: 0, totalInvested: 0, totalInvestedAcc: 0,
    totalSalesRevenue: 0, totalProfit: 0,
    expensesPJ: 0, expensesPF: 0, storeCount: 0, openOS: 0, salesCount: 0,
    totalAccessories: 0, totalLeads: 0,
    faturamentoBruto: 0, faturamentoLiquido: 0, custoPecasOS: 0, custoPecasReparos: 0, lucroServicos: 0,
    receitaAparelhos: 0, receitaAcessorios: 0, receitaOS: 0,
  });
  const [storeData, setStoreData] = useState<{ name: string; aparelhos: number; acessorios: number; investido: number }[]>([]);
  const [dailySales, setDailySales] = useState<{ date: string; total: number }[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [lowStockStores, setLowStockStores] = useState<{ name: string; count: number }[]>([]);
  const [lowStockAcc, setLowStockAcc] = useState<{ name: string; qty: number; min: number }[]>([]);
  const [stores, setStores] = useState<any[]>([]);

  const fetchData = async () => {
    // Só prossegue quando AuthContext estiver 100% carregado
    if (!userPermissions) return;

    const effectiveStoreId = !isAdmin && (!activeStoreId || activeStoreId === "all") 
      ? (userStoreIds.length > 0 ? userStoreIds[0] : null) 
      : activeStoreId;

    // isFiltered garante que force o filtro caso a loja efetiva seja definida
    const isFiltered = effectiveStoreId && effectiveStoreId !== "all";

    const { start, end } = getPeriodDates(period, customStart, customEnd);

    // Mantenha array de promessas
    const fetches = [
      can("estoque") 
        ? (!isFiltered ? supabase.from("products").select("*") : supabase.from("products").select("*").eq("store_id", effectiveStoreId))
        : Promise.resolve({ data: [] }),
      (can("transacoes") || can("caixa"))
        ? (!isFiltered 
            ? supabase.from("transactions").select("*").gte("created_at", start).lte("created_at", end) 
            : supabase.from("transactions").select("*").eq("store_id", effectiveStoreId).gte("created_at", start).lte("created_at", end))
        : Promise.resolve({ data: [] }),
      supabase.from("stores").select("*"),
      can("vendas")
        ? (!isFiltered 
            ? supabase.from("sales").select("*").gte("created_at", start).lte("created_at", end) 
            : supabase.from("sales").select("*").eq("store_id", effectiveStoreId).gte("created_at", start).lte("created_at", end))
        : Promise.resolve({ data: [] }),
      can("os")
        ? (!isFiltered 
            ? supabase.from("service_orders").select("id, status, store_id, created_at, final_price, estimated_price").gte("created_at", start).lte("created_at", end) 
            : supabase.from("service_orders").select("id, status, store_id, created_at, final_price, estimated_price").eq("store_id", effectiveStoreId).gte("created_at", start).lte("created_at", end))
        : Promise.resolve({ data: [] }),
      can("estoque") 
        ? (!isFiltered ? supabase.from("accessories" as any).select("*") : supabase.from("accessories" as any).select("*").eq("store_id", effectiveStoreId))
        : Promise.resolve({ data: [] }),
      can("leads")
        ? (!isFiltered 
            ? supabase.from("leads").select("id, created_at").gte("created_at", start).lte("created_at", end) 
            : supabase.from("leads").select("id, created_at").or(`store_id.eq.${effectiveStoreId},store_id.is.null`).gte("created_at", start).lte("created_at", end))
        : Promise.resolve({ data: [] }),
    ];

    const [productsRes, transactionsRes, storesRes, salesRes, osRes, accRes, leadsRes] = await Promise.all(fetches);

    const stores = storesRes.data ?? [];
    setStores(stores);
    const products = productsRes.data ?? [];
    const transactions = transactionsRes.data ?? [];
    const sales = salesRes.data ?? [];
    const serviceOrders = osRes.data ?? [];
    const accessories = (accRes.data ?? []) as any[];
    const leads = leadsRes.data ?? [];

    // Fetch service order items for the service orders in the period
    let serviceOrderItems: any[] = [];
    if (can("os") && serviceOrders.length > 0) {
      const osIds = serviceOrders.map((o: any) => o.id);
      const { data: itemsData } = await supabase
        .from("service_order_items" as any)
        .select("service_order_id, unit_cost, quantity")
        .in("service_order_id", osIds);
      serviceOrderItems = itemsData ?? [];
    }

    // Fetch product repairs and repair items for internal store devices during the period
    let productRepairItems: any[] = [];
    if (can("estoque")) {
      const repairQuery = supabase
        .from("product_repairs" as any)
        .select("id, status, created_at")
        .gte("created_at", start)
        .lte("created_at", end);
      
      if (effectiveStoreId) {
        repairQuery.eq("store_id", effectiveStoreId);
      }
      
      const { data: repairsData } = await repairQuery;
      const productRepairs = repairsData ?? [];
      
      if (productRepairs.length > 0) {
        const repairIds = productRepairs.map((r: any) => r.id);
        const { data: itemsData } = await supabase
          .from("product_repair_items" as any)
          .select("repair_id, unit_cost, quantity")
          .in("repair_id", repairIds);
        productRepairItems = itemsData ?? [];
      }
    }

    const inStock = products.filter((p: any) => p.status === "in_stock");
    const totalInvested = inStock.reduce((sum: number, p: any) => sum + Number(p.cost_price), 0);
    const totalInvestedAcc = accessories.reduce((sum: number, a: any) => sum + Number(a.cost_price) * a.quantity, 0);

    const totalSalesRevenue = sales.reduce((sum: number, s: any) => sum + Number(s.sale_price), 0);
    const totalProfit = sales.reduce((sum: number, s: any) => {
      const product = products.find((p: any) => p.id === s.product_id);
      return sum + (Number(s.sale_price) - Number(product?.cost_price || 0));
    }, 0);

    const expensesPJ = transactions.filter((t: any) => t.type === "expense_pj").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const expensesPF = transactions.filter((t: any) => t.type === "expense_pf" || t.type === "pro_labore").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const openOS = serviceOrders.filter((o: any) => !["delivered", "cancelled"].includes(o.status)).length;

    // Calcular faturamento e custos consolidados
    const receitaAparelhos = sales.reduce((sum: number, s: any) => sum + Number(s.sale_price), 0);
    const accSales = transactions.filter((t: any) => t.type === "income" && t.category === "acessorio");
    const receitaAcessorios = accSales.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    
    // Receita de serviços concluídos (status entregue)
    const osDelivered = serviceOrders.filter((o: any) => o.status === "delivered");
    const receitaOS = osDelivered.reduce((sum: number, o: any) => sum + Number(o.final_price || o.estimated_price || 0), 0);

    const faturamentoBruto = receitaAparelhos + receitaAcessorios + receitaOS;

    // Custos de aparelhos vendidos
    const cmvAparelhos = sales.reduce((sum: number, s: any) => {
      const product = products.find((p: any) => p.id === s.product_id);
      return sum + Number(product?.cost_price || 0);
    }, 0);
    // Custos de acessórios vendidos (DRE)
    const cmvAcessorios = transactions.filter((t: any) => t.type === "expense_pj" && t.category === "acessorio").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    
    // Custo de peças de serviços (OS não canceladas)
    const activeOSIds = new Set(serviceOrders.filter((o: any) => o.status !== "cancelled").map((o: any) => o.id));
    const custoPecasOS = serviceOrderItems
      .filter((item: any) => activeOSIds.has(item.service_order_id))
      .reduce((sum: number, item: any) => sum + (Number(item.unit_cost) * Number(item.quantity || 1)), 0);

    // Custo de peças usadas em reparos internos de aparelhos da loja
    const custoPecasReparos = productRepairItems.reduce((sum: number, item: any) => sum + (Number(item.unit_cost) * Number(item.quantity || 1)), 0);

    // Lucro de serviços = receita das OS entregues - custo das peças nessas OS
    const deliveredOSIds = new Set(osDelivered.map((o: any) => o.id));
    const custoPecasDelivered = serviceOrderItems
      .filter((item: any) => deliveredOSIds.has(item.service_order_id))
      .reduce((sum: number, item: any) => sum + (Number(item.unit_cost) * Number(item.quantity || 1)), 0);
    const lucroServicos = receitaOS - custoPecasDelivered;

    // Despesas PJ adicionais (que não sejam compra de acessório já contabilizado no CMV)
    const despesasPJAdicionais = transactions.filter((t: any) => t.type === "expense_pj" && t.category !== "acessorio").reduce((sum: number, t: any) => sum + Number(t.amount), 0);
    const despesasPFTotal = transactions.filter((t: any) => t.type === "expense_pf" || t.type === "pro_labore").reduce((sum: number, t: any) => sum + Number(t.amount), 0);

    // Consideramos custo de peças internos como redução do faturamento líquido também (já que foi gasto em peças de reparos internos)
    const faturamentoLiquido = faturamentoBruto - cmvAparelhos - cmvAcessorios - custoPecasOS - custoPecasReparos - despesasPJAdicionais - despesasPFTotal;

    setStats({
      totalStock: inStock.length, totalInvested, totalInvestedAcc,
      totalSalesRevenue, totalProfit, expensesPJ, expensesPF,
      storeCount: stores.filter((s: any) => s.status === "active").length,
      openOS, salesCount: sales.length,
      totalAccessories: accessories.reduce((sum: number, a: any) => sum + a.quantity, 0),
      totalLeads: leads.length,
      faturamentoBruto,
      faturamentoLiquido,
      custoPecasOS,
      custoPecasReparos,
      lucroServicos,
      receitaAparelhos,
      receitaAcessorios,
      receitaOS,
    });

    if (isAdmin) {
      const storeMap = new Map(stores.map((s: any) => [s.id, s.name]));
      const allProductsRes = await supabase.from("products").select("*").eq("status", "in_stock");
      const allAccRes = await supabase.from("accessories" as any).select("*");
      const allProducts = (allProductsRes.data ?? []).filter((p: any) => p.status === "in_stock");
      const allAcc = (allAccRes.data ?? []) as any[];
      const storeProducts: Record<string, { aparelhos: number; acessorios: number; investido: number }> = {};
      allProducts.forEach((p: any) => {
        const name = storeMap.get(p.store_id) || "Sem loja";
        if (!storeProducts[name]) storeProducts[name] = { aparelhos: 0, acessorios: 0, investido: 0 };
        storeProducts[name].aparelhos++;
        storeProducts[name].investido += Number(p.cost_price);
      });
      allAcc.forEach((a: any) => {
        const name = storeMap.get(a.store_id) || "Sem loja";
        if (!storeProducts[name]) storeProducts[name] = { aparelhos: 0, acessorios: 0, investido: 0 };
        storeProducts[name].acessorios += a.quantity;
        storeProducts[name].investido += Number(a.cost_price) * a.quantity;
      });
      setStoreData(Object.entries(storeProducts).map(([name, data]) => ({ name, ...data })));
    }

    if (can("estoque")) {
      const catMap: Record<string, number> = {};
      accessories.forEach((a: any) => { catMap[a.category] = (catMap[a.category] || 0) + a.quantity; });
      setCategoryBreakdown(Object.entries(catMap).map(([name, value]) => ({ name, value })));

      const storeStockCounts: Record<string, number> = {};
      inStock.forEach((p: any) => { storeStockCounts[p.store_id] = (storeStockCounts[p.store_id] || 0) + 1; });
      setLowStockStores(stores
        .filter((s: any) => !isFiltered ? (storeStockCounts[s.id] || 0) <= 3 : s.id === effectiveStoreId && (storeStockCounts[s.id] || 0) <= 3)
        .map((s: any) => ({ name: s.name, count: storeStockCounts[s.id] || 0 })));
      setLowStockAcc(accessories.filter((a: any) => a.quantity <= a.min_quantity).map((a: any) => ({ name: a.name, qty: a.quantity, min: a.min_quantity })));
    }

    if (can("vendas")) {
      const last30 = new Date();
      last30.setDate(last30.getDate() - 30);
      const dailyMap: Record<string, number> = {};
      sales.filter((s: any) => new Date(s.created_at) >= last30).forEach((s: any) => {
        const day = new Date(s.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
        dailyMap[day] = (dailyMap[day] || 0) + Number(s.sale_price);
      });
      setDailySales(Object.entries(dailyMap).map(([date, total]) => ({ date, total })));

      const totalCash = sales.reduce((s: number, sale: any) => s + Number(sale.payment_cash), 0);
      const totalCard = sales.reduce((s: number, sale: any) => s + Number(sale.payment_card), 0);
      const totalPix = sales.reduce((s: number, sale: any) => s + Number(sale.payment_pix), 0);
      const totalTradeIn = sales.filter((s: any) => s.has_trade_in).reduce((s: number, sale: any) => s + Number(sale.trade_in_value || 0), 0);
      setPaymentBreakdown([
        { name: "Dinheiro", value: totalCash },
        { name: "Cartão", value: totalCard },
        { name: "Pix", value: totalPix },
        { name: "Trade-in", value: totalTradeIn },
      ].filter(p => p.value > 0));
    }
  };

  const totalInvestedAll = stats.totalInvested + stats.totalInvestedAcc;

  const hasAnyData = can("estoque") || can("vendas") || can("os") || can("transacoes") || can("caixa");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {activeStoreId !== "all"
              ? `Dados da unidade: ${activeStoreName}`
              : "Visão consolidada de todas as lojas"}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Período</Label>
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="h-9 w-[140px] border-border/50 bg-card shadow-sm text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Esta Semana</SelectItem>
                <SelectItem value="month">Este Mês</SelectItem>
                <SelectItem value="quarter">Trimestre</SelectItem>
                <SelectItem value="year">Este Ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {period === "custom" && (
            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground font-semibold">De</Label>
                <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-9 w-[130px] border-border/50 bg-card text-xs" />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Até</Label>
                <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-9 w-[130px] border-border/50 bg-card text-xs" />
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="space-y-1">
              <Label className="text-[10px] uppercase text-muted-foreground font-semibold">Loja</Label>
              <Select value={activeStoreId} onValueChange={(v) => {
                setActiveStoreId(v);
                const s = stores.find(s => s.id === v);
                window.dispatchEvent(new CustomEvent("store-changed", { detail: { id: v, name: s?.name || "Todas as lojas" } }));
              }}>
                <SelectTrigger className="w-[180px] h-9 border-border/50 bg-card shadow-sm text-xs">
                  <SelectValue placeholder="Escolher Loja" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Lojas</SelectItem>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {!isAdmin && activeStoreId !== "all" && (
            <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-3 py-1.5 self-end mb-[2px]">
              <Store className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold text-primary">{activeStoreName}</span>
            </div>
          )}
        </div>
      </div>

      {can("estoque") && (lowStockStores.length > 0 || lowStockAcc.length > 0) && (
        <div className="space-y-2">
          {lowStockStores.map(s => (
            <div key={s.name} className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs"><span className="font-semibold">{s.name}</span>: estoque baixo — apenas <span className="font-bold text-destructive">{s.count}</span> aparelhos</p>
            </div>
          ))}
          {lowStockAcc.map(a => (
            <div key={a.name} className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
              <p className="text-xs"><span className="font-semibold">{a.name}</span>: apenas <span className="font-bold text-yellow-500">{a.qty}</span> unidades (mín: {a.min})</p>
            </div>
          ))}
        </div>
      )}

      {/* 📊 FINANCEIRO CONSOLIDADO */}
      {canSeeFinancials && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 border-b border-border/50 pb-1">
            <TrendingUp className="h-4 w-4 text-emerald-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Resultado Financeiro Geral</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-border/50 shadow-lg shadow-black/10 bg-gradient-to-br from-card to-card/50">
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Faturamento Bruto</p>
                <p className="font-display text-xl font-bold text-emerald-500 mt-1">{formatCurrency(stats.faturamentoBruto)}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Aparelhos + Acessórios + Serviços</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-lg shadow-black/10 bg-gradient-to-br from-card to-card/50">
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Faturamento Líquido</p>
                <p className="font-display text-xl font-bold text-blue-500 mt-1">{formatCurrency(stats.faturamentoLiquido)}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Lucro líquido após CMV e Despesas</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-lg shadow-black/10 bg-gradient-to-br from-card to-card/50">
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Investido (Estoque)</p>
                <p className="font-display text-xl font-bold text-orange-400 mt-1">{formatCurrency(totalInvestedAll)}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">Aparelhos: {formatCurrency(stats.totalInvested)} · Acessórios: {formatCurrency(stats.totalInvestedAcc)}</p>
              </CardContent>
            </Card>
            <Card className="border-border/50 shadow-lg shadow-black/10 bg-gradient-to-br from-card to-card/50">
              <CardContent className="p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Despesas Totais (PJ + PF)</p>
                <p className="font-display text-xl font-bold text-destructive mt-1">{formatCurrency(stats.expensesPJ + stats.expensesPF)}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5">PJ: {formatCurrency(stats.expensesPJ)} · PF: {formatCurrency(stats.expensesPF)}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* 📱 APARELHOS & CELULARES */}
      {(can("estoque") || can("vendas")) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 border-b border-border/50 pb-1">
            <Store className="h-4 w-4 text-primary" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Celulares & Aparelhos</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Card className="border-border/50 shadow-md">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Estoque de Aparelhos</p>
                <p className="font-display text-lg font-bold text-primary mt-0.5">{stats.totalStock} <span className="text-xs font-normal text-muted-foreground">unidades</span></p>
              </CardContent>
            </Card>
            {canSeeFinancials && (
              <>
                <Card className="border-border/50 shadow-md">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Valor Investido</p>
                    <p className="font-display text-lg font-bold text-primary mt-0.5">{formatCurrency(stats.totalInvested)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-md">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Receita de Aparelhos</p>
                    <p className="font-display text-lg font-bold text-primary mt-0.5">{formatCurrency(stats.receitaAparelhos)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-md">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Lucro de Vendas</p>
                    <p className="font-display text-lg font-bold text-primary mt-0.5">{formatCurrency(stats.totalProfit)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-md">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Reparos Internos (Peças)</p>
                    <p className="font-display text-lg font-bold text-orange-400 mt-0.5">{formatCurrency(stats.custoPecasReparos)}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* 🔌 ACESSÓRIOS */}
      {(can("estoque") || can("vendas")) && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 border-b border-border/50 pb-1">
            <Zap className="h-4 w-4 text-accent" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Acessórios</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <Card className="border-border/50 shadow-md">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase">Estoque de Acessórios</p>
                <p className="font-display text-lg font-bold text-accent mt-0.5">{stats.totalAccessories} <span className="text-xs font-normal text-muted-foreground">unidades</span></p>
              </CardContent>
            </Card>
            {canSeeFinancials && (
              <>
                <Card className="border-border/50 shadow-md">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Valor Investido</p>
                    <p className="font-display text-lg font-bold text-accent mt-0.5">{formatCurrency(stats.totalInvestedAcc)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-md">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Receita de Acessórios</p>
                    <p className="font-display text-lg font-bold text-accent mt-0.5">{formatCurrency(stats.receitaAcessorios)}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      {/* 🔧 SERVIÇOS & CONSERTOS */}
      {can("os") && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 border-b border-border/50 pb-1">
            <Wrench className="h-4 w-4 text-violet-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-foreground">Serviços & Ordens de Serviço (OS)</h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Card className="border-border/50 shadow-md">
              <CardContent className="p-3">
                <p className="text-[10px] text-muted-foreground uppercase">OS Abertas (Em Andamento)</p>
                <p className="font-display text-lg font-bold text-violet-400 mt-0.5">{stats.openOS} <span className="text-xs font-normal text-muted-foreground">unidades</span></p>
              </CardContent>
            </Card>
            {canSeeFinancials && (
              <>
                <Card className="border-border/50 shadow-md">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Receita de Serviços (Entregues)</p>
                    <p className="font-display text-lg font-bold text-violet-400 mt-0.5">{formatCurrency(stats.receitaOS)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-md">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Pago em Peças (OS)</p>
                    <p className="font-display text-lg font-bold text-orange-400 mt-0.5">{formatCurrency(stats.custoPecasOS)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50 shadow-md">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Lucro de Serviços</p>
                    <p className="font-display text-lg font-bold text-violet-400 mt-0.5">{formatCurrency(stats.lucroServicos)}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {can("vendas") && (
          <Card className="border-border/50 shadow-lg shadow-black/10">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">Vendas (últimos 30 dias)</CardTitle>
            </CardHeader>
            <CardContent>
              {dailySales.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={dailySales}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    <Line type="monotone" dataKey="total" stroke="hsl(152, 60%, 45%)" strokeWidth={2} dot={false} name="Vendas" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">Registre vendas para ver o gráfico</div>
              )}
            </CardContent>
          </Card>
        )}

        {isAdmin && (
          <Card className="border-border/50 shadow-lg shadow-black/10">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">Comparativo Entre Lojas</CardTitle>
            </CardHeader>
            <CardContent>
              {storeData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={storeData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="aparelhos" fill="hsl(152, 60%, 45%)" radius={[4, 4, 0, 0]} name="Aparelhos" />
                    <Bar dataKey="acessorios" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} name="Acessórios" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">Cadastre produtos para ver o gráfico</div>
              )}
            </CardContent>
          </Card>
        )}

        {can("vendas") && (
          <Card className="border-border/50 shadow-lg shadow-black/10">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">Formas de Pagamento</CardTitle>
            </CardHeader>
            <CardContent>
              {paymentBreakdown.length > 0 ? (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="50%" height={160}>
                    <PieChart>
                      <Pie data={paymentBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="value">
                        {paymentBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => formatCurrency(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {paymentBreakdown.map((p, i) => (
                      <div key={p.name} className="flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                        <div>
                          <p className="text-xs font-medium">{p.name}</p>
                          <p className="text-[10px] text-muted-foreground">{formatCurrency(p.value)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-[160px] text-muted-foreground text-xs">Sem vendas registradas</div>
              )}
            </CardContent>
          </Card>
        )}

        {can("estoque") && (
          <Card className="border-border/50 shadow-lg shadow-black/10">
            <CardHeader className="pb-2">
              <CardTitle className="font-display text-sm">Acessórios por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              {categoryBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={categoryBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={70} />
                    <Tooltip />
                    <Bar dataKey="value" fill="hsl(38, 92%, 50%)" radius={[0, 4, 4, 0]} name="Qtd" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-[160px] text-muted-foreground text-xs">Cadastre acessórios para ver o gráfico</div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {!hasAnyData && (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Store className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium text-sm">Bem-vindo!</p>
            <p className="text-xs mt-1">Nenhum dado financeiro ou comercial disponível com suas permissões atuais.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
