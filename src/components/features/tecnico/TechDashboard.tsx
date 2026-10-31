import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import {
  Target,
  Trophy,
  Flame,
  Wrench,
  Clock,
  CheckCircle2,
  CheckCircle,
  Coins,
  Eye,
  ChevronRight,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  SlidersHorizontal,
  Timer,
  ShieldCheck,
  TrendingUp,
  Receipt,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { getStatusLabel, getStatusColor } from "@/utils/osStatus";
import { openComprovante } from "@/lib/storageHelper";
import {
  fetchSettlementsHistory,
  fetchSettlementItems,
  generateSettlementReceiptPDF,
  type CommissionSettlement,
} from "@/utils/commissionSettlement";
import { getPatentSettings } from "@/utils/rankingGamification";
import type {
  TechProductivityResult,
  TimelineDataPoint,
  TechGoalsProgress,
  TechGoalConfig,
  TechRankingItem,
} from "@/utils/technicianMetrics";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export interface TechDashboardProps {
  userId: string;
  productivity: TechProductivityResult;
  timeline: TimelineDataPoint[];
  goalsProgress: TechGoalsProgress;
  goalsConfig: TechGoalConfig;
  onUpdateGoals: (newGoals: TechGoalConfig) => void;
  shopRanking: { items: TechRankingItem[]; myRank: number; totalTechs: number };
  activeQueue: any[];
  onNavigateToOS: (osId?: string) => void;
  periodLabel: string;
}

export const TechDashboard: React.FC<TechDashboardProps> = ({
  userId,
  productivity,
  timeline,
  goalsProgress,
  goalsConfig,
  onUpdateGoals,
  shopRanking,
  activeQueue,
  onNavigateToOS,
  periodLabel,
}) => {
  const [isGoalsModalOpen, setIsGoalsModalOpen] = useState(false);
  const [tempOrdersTarget, setTempOrdersTarget] = useState(goalsConfig.targetOrders);
  const [tempCommissionTarget, setTempCommissionTarget] = useState(goalsConfig.targetCommission);
  const [queueFilter, setQueueFilter] = useState<"all" | "bench" | "waiting_part" | "waiting_approval" | "ready">("all");
  const [techSettlements, setTechSettlements] = useState<CommissionSettlement[]>([]);
  const [loadingSettlements, setLoadingSettlements] = useState(false);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let isMounted = true;
    setLoadingSettlements(true);
    fetchSettlementsHistory(undefined, userId)
      .then((data) => {
        if (isMounted) setTechSettlements(data);
      })
      .catch((err) => {
        console.error("Erro ao carregar liquidações do técnico:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingSettlements(false);
      });
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const comissaoLiquidadaPeriodo = productivity.settledCommission ?? 0;
  const comissaoPendentePeriodo = productivity.pendingCommission ?? productivity.realizedCommission;

  const totalHistoricoLiquidado = useMemo(() => {
    return techSettlements.reduce((acc, s) => acc + Number(s.total_amount || 0), 0);
  }, [techSettlements]);

  const handleSaveGoals = () => {
    const newConfig: TechGoalConfig = {
      targetOrders: Math.max(1, Number(tempOrdersTarget) || 40),
      targetCommission: Math.max(1, Number(tempCommissionTarget) || 2500),
    };
    onUpdateGoals(newConfig);
    setIsGoalsModalOpen(false);
  };

  // Helper para verificar status de prazo/SLA na fila
  const getDeadlineBadge = (estimatedCompletion?: string | null) => {
    if (!estimatedCompletion) {
      return (
        <span className="text-[11px] text-muted-foreground">Sem prazo definido</span>
      );
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(estimatedCompletion);
    deadline.setHours(0, 0, 0, 0);

    const diffDays = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return (
        <Badge variant="outline" className="border-red-500/40 bg-red-500/10 text-red-500 text-[10px] gap-1 font-semibold">
          <AlertCircle className="h-3 w-3" />
          Atrasado ({Math.abs(diffDays)}d)
        </Badge>
      );
    }
    if (diffDays === 0) {
      return (
        <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-500 text-[10px] gap-1 font-semibold">
          <Clock className="h-3 w-3" />
          Vence Hoje
        </Badge>
      );
    }
    if (diffDays === 1) {
      return (
        <Badge variant="outline" className="border-yellow-500/40 bg-yellow-500/10 text-yellow-500 text-[10px] gap-1">
          Vence Amanhã
        </Badge>
      );
    }
    return (
      <span className="text-[11px] text-muted-foreground">
        {deadline.toLocaleDateString("pt-BR")}
      </span>
    );
  };

  // Filtragem da fila por categoria operacional
  const filteredQueue = activeQueue.filter((o) => {
    if (queueFilter === "bench") return ["repairing", "analyzing"].includes(o.status);
    if (queueFilter === "waiting_part") return o.status === "waiting_part";
    if (queueFilter === "waiting_approval") return o.status === "waiting_approval";
    if (queueFilter === "ready") return o.status === "ready";
    return true;
  });

  // Premiação do Técnico Top 1 do Mês (+% extra de comissão)
  const techAwardPct = useMemo(() => {
    try {
      const s = getPatentSettings();
      return s.techAward?.top1ExtraCommissionPct ?? 2.0;
    } catch {
      return 2.0;
    }
  }, []);

  const isTop1 = shopRanking.myRank === 1 && (shopRanking.items[0]?.deliveredOrders || 0) > 0;
  const secondPlace = shopRanking.items[1];
  const leadOrders = secondPlace ? (shopRanking.items[0]?.deliveredOrders - secondPlace.deliveredOrders) : (shopRanking.items[0]?.deliveredOrders || 0);
  const top1Tech = shopRanking.items[0];
  const myItem = shopRanking.items.find((i) => i.isMe);
  const neededOrders = top1Tech ? Math.max(1, top1Tech.deliveredOrders - (myItem?.deliveredOrders || 0) + 1) : 1;

  return (
    <div className="space-y-6">
      {/* ── CARD DE LIDERANÇA / PRÊMIO TÉCNICO TOP 1 ── */}
      {isTop1 ? (
        <Card className="border-amber-500/40 bg-gradient-to-r from-amber-500/20 via-yellow-500/10 to-amber-500/5 p-4 shadow-sm relative overflow-hidden animate-in fade-in duration-300">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                🥇
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-sm md:text-base text-foreground">
                    Você é o Técnico Top 1 do Mês!
                  </h3>
                  <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/40 text-[10px] font-bold uppercase tracking-wider">
                    Líder da Bancada
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  Parabéns! Você lidera o ranking com <strong>{shopRanking.items[0]?.deliveredOrders} OSs entregues</strong>
                  {secondPlace ? ` (${leadOrders} à frente do 2º colocado)` : ""}.
                  O bônus de <strong>+{techAwardPct}% de comissão extra</strong> sobre todos os reparos está ativo para você!
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30 font-bold text-xs py-1 px-3">
                ✨ +{techAwardPct}% Comissão Extra Ativa
              </Badge>
            </div>
          </div>
        </Card>
      ) : shopRanking.items.length > 0 && (
        <Card className="border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent p-4 shadow-sm relative overflow-hidden animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                🎯
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-sm md:text-base text-foreground">
                    Corrida da Bancada — Prêmio Top 1
                  </h3>
                  <Badge variant="outline" className="text-[10px] border-indigo-500/30 text-indigo-400 font-semibold">
                    Sua Posição: {shopRanking.myRank}º Lugar
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                  O técnico que fechar o mês no topo ganha <strong>+{techAwardPct}% de comissão extra</strong> sobre todos os serviços!
                  {top1Tech ? (
                    <> Faltam <strong>{neededOrders} {neededOrders === 1 ? "OS" : "OSs"}</strong> para você alcançar a liderança de {top1Tech.name}.</>
                  ) : (
                    <> Conclua suas ordens de serviço e conquiste o primeiro lugar!</>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-xs font-semibold py-1 px-2.5">
                🏆 Top 1 Ganha +{techAwardPct}% Extra
              </Badge>
            </div>
          </div>
        </Card>
      )}
      {/* ─────────────────────────────────────────────────────────────
          1. METAS DO TÉCNICO & GAMIFICAÇÃO (DESTAQUE PREMIUM)
          ───────────────────────────────────────────────────────────── */}
      <Card className="border-primary/20 shadow-lg bg-gradient-to-br from-card via-card to-primary/5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="font-display text-lg flex items-center gap-2">
                  Metas do Mês
                  <Badge variant="secondary" className="gap-1 text-[11px] font-medium bg-primary/10 text-primary border-primary/20">
                    <Sparkles className="h-3 w-3" />
                    Gamificação Ativa
                  </Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Acompanhe seu avanço mensal e conquiste suas metas de produção e remuneração
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8 border-border/60 hover:bg-muted"
              onClick={() => {
                setTempOrdersTarget(goalsConfig.targetOrders);
                setTempCommissionTarget(goalsConfig.targetCommission);
                setIsGoalsModalOpen(true);
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Ajustar Metas
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Meta 1: OS Entregues */}
          <div className="p-4 rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-indigo-400" />
                OS Entregues no Mês
              </span>
              {goalsProgress.isOrdersAchieved ? (
                <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/30 text-[10px] gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Meta Batida! 🎯
                </Badge>
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">
                  Faltam {Math.max(0, goalsProgress.ordersTarget - goalsProgress.ordersCurrent)} OS
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-3xl font-extrabold text-foreground">
                  {goalsProgress.ordersCurrent}
                </span>
                <span className="text-sm font-semibold text-muted-foreground">
                  / {goalsProgress.ordersTarget} OS
                </span>
              </div>
              <span className="font-display text-xl font-bold text-indigo-400">
                {goalsProgress.ordersPct}%
              </span>
            </div>

            <Progress
              value={goalsProgress.ordersPct}
              className="h-2.5 bg-muted/80"
              indicatorClassName={
                goalsProgress.isOrdersAchieved
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                  : "bg-gradient-to-r from-indigo-500 to-violet-500"
              }
            />
          </div>

          {/* Meta 2: Meta de Comissão */}
          <div className="p-4 rounded-xl border border-border/50 bg-background/60 backdrop-blur-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-yellow-400" />
                Meta de Comissão
              </span>
              {goalsProgress.isCommissionAchieved ? (
                <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px] gap-1">
                  <Flame className="h-3 w-3" />
                  Meta Financeira Batida! ✨
                </Badge>
              ) : (
                <span className="text-xs font-semibold text-muted-foreground">
                  Falta {formatCurrency(Math.max(0, goalsProgress.commissionTarget - goalsProgress.commissionCurrent))}
                </span>
              )}
            </div>

            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-2xl font-extrabold text-yellow-400">
                  {formatCurrency(goalsProgress.commissionCurrent)}
                </span>
                <span className="text-xs font-semibold text-muted-foreground">
                  / {formatCurrency(goalsProgress.commissionTarget)}
                </span>
              </div>
              <span className="font-display text-xl font-bold text-yellow-500">
                {goalsProgress.commissionPct}%
              </span>
            </div>

            <Progress
              value={goalsProgress.commissionPct}
              className="h-2.5 bg-muted/80"
              indicatorClassName="bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-300"
            />
          </div>
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          2. GANHOS & REMUNERAÇÃO (REALIZADA VS PROJETADA)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Comissão Realizada */}
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/60 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Coins className="h-16 w-16 text-yellow-400" />
          </div>
          <CardContent className="p-4 space-y-1.5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] uppercase font-bold tracking-wider">Comissão Realizada</span>
              <Coins className="h-4 w-4 text-yellow-400" />
            </div>
            <div>
              <p className="font-display text-2xl font-black text-yellow-400">
                {formatCurrency(productivity.realizedCommission)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {productivity.totalDelivered} reparos entregues no período
              </p>
            </div>
            {productivity.realizedCommission > 0 && (
              <div className="pt-1 flex flex-wrap gap-1.5 text-[10px]">
                {comissaoLiquidadaPeriodo > 0 && (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                    Liquidado: {formatCurrency(comissaoLiquidadaPeriodo)}
                  </Badge>
                )}
                {comissaoPendentePeriodo > 0 && (
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/30">
                    A Pagar: {formatCurrency(comissaoPendentePeriodo)}
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Comissão Projetada na Bancada */}
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/60 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <TrendingUp className="h-16 w-16 text-emerald-400" />
          </div>
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] uppercase font-bold tracking-wider">Potencial na Bancada</span>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="font-display text-2xl font-black text-emerald-400">
              {formatCurrency(productivity.projectedCommission)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {productivity.totalActiveInBench} OS em andamento com valor
            </p>
          </CardContent>
        </Card>

        {/* Mão de Obra Gerada para a Loja */}
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/60 shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] uppercase font-bold tracking-wider">Mão de Obra Gerada</span>
              <Wrench className="h-4 w-4 text-primary" />
            </div>
            <p className="font-display text-2xl font-bold text-foreground">
              {formatCurrency(productivity.totalLaborRevenue)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Margem líquida de serviços entregues
            </p>
          </CardContent>
        </Card>

        {/* Ticket Médio de Mão de Obra */}
        <Card className="border-border/60 bg-gradient-to-br from-card to-card/60 shadow-sm">
          <CardContent className="p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] uppercase font-bold tracking-wider">Ticket Médio (Serviço)</span>
              <Sparkles className="h-4 w-4 text-indigo-400" />
            </div>
            <p className="font-display text-2xl font-bold text-indigo-400">
              {formatCurrency(productivity.ticketMedioLabor)}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Média por OS entregue com sucesso
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. SLA, TEMPOS DE CICLO & RANKING DA LOJA
          ───────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Indicadores de SLA e Eficiência */}
        <Card className="lg:col-span-2 border-border/60 bg-card shadow-sm">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-primary" />
                <CardTitle className="font-display text-base">
                  Indicadores de SLA & Eficiência Operacional
                </CardTitle>
              </div>
              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                {periodLabel}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Taxa de Sucesso */}
              <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] uppercase font-bold">Taxa de Sucesso</span>
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <p className="font-display text-2xl font-bold text-emerald-400">
                  {productivity.successRate}%
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {productivity.totalDelivered} entregues vs {productivity.totalCancelled} canceladas
                </p>
              </div>

              {/* Lead Time Total */}
              <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] uppercase font-bold">Lead Time Total</span>
                  <Clock className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <p className="font-display text-2xl font-bold text-blue-400">
                  {productivity.avgTotalLeadTimeDays} <span className="text-sm font-normal">dias</span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Ciclo completo: entrada até entrega ao cliente
                </p>
              </div>

              {/* Tempo Médio de Bancada */}
              <div className="p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-[10px] uppercase font-bold">Tempo na Bancada</span>
                  <Wrench className="h-3.5 w-3.5 text-violet-400" />
                </div>
                <p className="font-display text-2xl font-bold text-violet-400">
                  {productivity.avgBenchTimeDays} <span className="text-sm font-normal">dias</span>
                </p>
                <p className="text-[10px] text-muted-foreground">
                  Tempo efetivo de intervenção técnica
                </p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-primary/5 border border-primary/10 text-xs text-muted-foreground flex items-start gap-2">
              <Sparkles className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <span>
                <strong>Diferenciação Técnica:</strong> O <em>Lead Time Total</em> reflete toda a jornada do cliente (incluindo aprovação de orçamento e chegada de peças). O <em>Tempo de Bancada</em> mede estritamente sua velocidade e precisão no reparo.
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Ranking da Equipe Técnica da Loja */}
        <Card className="border-border/60 bg-card shadow-sm flex flex-col justify-between">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-amber-400" />
                <CardTitle className="font-display text-base">
                  Ranking da Loja
                </CardTitle>
              </div>
              <Badge variant="secondary" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20 font-bold">
                {shopRanking.myRank}º Lugar
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex-1 space-y-3">
            {shopRanking.items.length > 0 ? (
              <div className="space-y-2">
                {shopRanking.items.slice(0, 4).map((tech) => (
                  <div
                    key={tech.techId}
                    className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                      tech.isMe
                        ? "border-primary/40 bg-primary/10 font-bold text-primary"
                        : "border-border/40 bg-muted/20 text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-5 text-center font-bold">
                        {tech.rank === 1 ? "🥇" : tech.rank === 2 ? "🥈" : tech.rank === 3 ? "🥉" : `#${tech.rank}`}
                      </span>
                      <span className="truncate max-w-[120px]">
                        {tech.name} {tech.isMe ? "(Você)" : ""}
                      </span>
                      {tech.rank === 1 && (
                        <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 text-[9px] py-0 px-1 font-bold">
                          Top 1 (+{techAwardPct}%)
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="font-bold">{tech.deliveredOrders} OS</span>
                      <span className="text-[10px] text-muted-foreground block">
                        {formatCurrency(tech.laborRevenue)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground text-xs">
                Nenhum reparo concluído na loja no período selecionado.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. GRÁFICO DE EVOLUÇÃO TEMPORAL (TIMELINE)
          ───────────────────────────────────────────────────────────── */}
      <Card className="border-border/60 bg-card shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              <div>
                <CardTitle className="font-display text-base">
                  Evolução de Entregas & Comissões
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Desempenho diário de aparelhos entregues e valor de comissão gerado
                </p>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          {timeline.length > 0 ? (
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeline} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="techCommissionGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="hsl(38, 92%, 50%)" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="techOrdersGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(220, 70%, 55%)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(220, 70%, 55%)" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(val: any, name: string) => [
                      name === "commission" ? formatCurrency(Number(val)) : `${val} OS`,
                      name === "commission" ? "Comissão" : "Reparos Entregues",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="commission"
                    name="commission"
                    stroke="hsl(38, 92%, 50%)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#techCommissionGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="orders"
                    name="orders"
                    stroke="hsl(220, 70%, 55%)"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#techOrdersGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[180px] flex flex-col items-center justify-center text-muted-foreground text-xs">
              <Clock className="h-8 w-8 mb-2 opacity-40" />
              Nenhum dado de entrega registrado no período selecionado.
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          5. BANCADA INTELIGENTE: FILA DE TRABALHO COM ALERTAS DE SLA
          ───────────────────────────────────────────────────────────── */}
      <Card className="border-border/60 shadow-lg shadow-black/10">
        <CardHeader className="pb-3 border-b border-border/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Wrench className="h-4 w-4 text-primary" />
              <div>
                <CardTitle className="font-display text-base">
                  Minha Bancada de Trabalho ({filteredQueue.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Ordens ativas com monitoramento de urgência e prazos de entrega
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center bg-muted/40 p-1 rounded-lg border border-border/50 text-xs">
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    queueFilter === "all" ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                  onClick={() => setQueueFilter("all")}
                >
                  Todas ({activeQueue.length})
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    queueFilter === "bench" ? "bg-background font-semibold text-violet-400 shadow-sm" : "text-muted-foreground"
                  }`}
                  onClick={() => setQueueFilter("bench")}
                >
                  Em Bancada
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    queueFilter === "waiting_part" ? "bg-background font-semibold text-yellow-500 shadow-sm" : "text-muted-foreground"
                  }`}
                  onClick={() => setQueueFilter("waiting_part")}
                >
                  Peça
                </button>
                <button
                  type="button"
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    queueFilter === "ready" ? "bg-background font-semibold text-emerald-500 shadow-sm" : "text-muted-foreground"
                  }`}
                  onClick={() => setQueueFilter("ready")}
                >
                  Prontas
                </button>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8"
                onClick={() => onNavigateToOS()}
              >
                Ver Todas as OS
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-3">
          {filteredQueue.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">OS</th>
                    <th className="text-left py-2 px-2 font-medium">Aparelho</th>
                    <th className="text-left py-2 px-2 font-medium">Cliente</th>
                    <th className="text-left py-2 px-2 font-medium">Defeito / Serviço</th>
                    <th className="text-left py-2 px-2 font-medium">Status</th>
                    <th className="text-left py-2 px-2 font-medium">SLA / Prazo</th>
                    <th className="text-right py-2 px-2 font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredQueue.map((o) => (
                    <tr key={o.id} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 px-2 font-mono font-bold text-foreground">
                        #{o.order_number ?? "-"}
                      </td>
                      <td className="py-2.5 px-2 font-medium">
                        {o.device_brand} {o.device_model}
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground">
                        {o.customer_name}
                      </td>
                      <td className="py-2.5 px-2 max-w-[200px] truncate" title={o.reported_defect || o.requested_service}>
                        {o.requested_service || o.reported_defect || "—"}
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge variant="outline" className={`text-[10px] ${getStatusColor(o.status)}`}>
                          {getStatusLabel(o.status)}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        {getDeadlineBadge(o.estimated_completion)}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 hover:text-primary"
                          onClick={() => onNavigateToOS(o.id)}
                        >
                          <Eye className="h-3 w-3" />
                          Abrir
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mb-2 text-emerald-500 opacity-60" />
              <p className="font-semibold text-sm text-foreground">Bancada Livre!</p>
              <p className="text-xs mt-1">Você não possui nenhuma OS pendente nesta categoria.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─────────────────────────────────────────────────────────────
          HISTÓRICO & EXTRATO DE COMISSÕES LIQUIDADAS
          ───────────────────────────────────────────────────────────── */}
      {techSettlements.length > 0 && (
        <Card className="border-border/60 shadow-sm">
          <CardHeader className="pb-3 border-b border-border/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <Receipt className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="font-display text-base flex items-center gap-2">
                    Extrato de Comissões Recebidas
                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[10px]">
                      {techSettlements.length} {techSettlements.length === 1 ? "baixa" : "baixas"}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Histórico de pagamentos de comissão efetuados pela administração com comprovante
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-muted-foreground">Total Já Recebido:</span>
                <p className="font-mono font-bold text-emerald-500 text-base">
                  {formatCurrency(totalHistoricoLiquidado)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left py-2 px-2 font-medium">Data do Pagamento</th>
                    <th className="text-left py-2 px-2 font-medium">Forma</th>
                    <th className="text-left py-2 px-2 font-medium">Período de Apuração</th>
                    <th className="text-left py-2 px-2 font-medium">Itens</th>
                    <th className="text-right py-2 px-2 font-medium">Valor Pago</th>
                    <th className="text-right py-2 px-2 font-medium">Comprovante</th>
                  </tr>
                </thead>
                <tbody>
                  {techSettlements.map((s) => (
                    <tr key={s.id} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-2.5 px-2 whitespace-nowrap font-mono font-medium">
                        {new Date(s.paid_at || s.created_at).toLocaleDateString("pt-BR")}{" "}
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(s.paid_at || s.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {s.payment_method === "dinheiro" ? "💵 Dinheiro" : s.payment_method.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground">
                        {s.period_start && s.period_end ? (
                          <span>
                            {new Date(s.period_start + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
                            {new Date(s.period_end + "T00:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-muted-foreground">
                        {s.items_count ?? 1} {s.items_count === 1 ? "item" : "itens"}
                      </td>
                      <td className="py-2.5 px-2 text-right font-mono font-bold text-emerald-500 whitespace-nowrap">
                        {formatCurrency(Number(s.total_amount))}
                      </td>
                      <td className="py-2.5 px-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {s.receipt_url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs gap-1 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                              onClick={(e) => openComprovante(s.receipt_url, e)}
                              title="Ver comprovante bancário anexado"
                            >
                              <Receipt className="h-3 w-3" /> Comprovante
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={downloadingPdfId === s.id}
                            className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary hover:bg-primary/10"
                            onClick={async () => {
                              try {
                                setDownloadingPdfId(s.id);
                                const items = await fetchSettlementItems(s.id);
                                generateSettlementReceiptPDF({
                                  settlement: s,
                                  items,
                                  storeName: "Cell Pro 360",
                                  collaboratorName: "Técnico Responsável",
                                  managerName: "Gestão Financeira",
                                });
                                toast.success("Recibo baixado com sucesso!");
                              } catch (e) {
                                toast.error("Erro ao gerar recibo em PDF");
                              } finally {
                                setDownloadingPdfId(null);
                              }
                            }}
                          >
                            <Download className="h-3 w-3" />
                            {downloadingPdfId === s.id ? "Gerando..." : "Recibo PDF"}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: AJUSTE DE METAS DO TÉCNICO
          ───────────────────────────────────────────────────────────── */}
      <Dialog open={isGoalsModalOpen} onOpenChange={setIsGoalsModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Personalizar Metas do Mês
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Meta de Ordens Entregues (unidades)</Label>
              <Input
                type="number"
                min="1"
                value={tempOrdersTarget}
                onChange={(e) => setTempOrdersTarget(Number(e.target.value))}
                placeholder="Ex: 50"
              />
              <p className="text-[11px] text-muted-foreground">
                Quantidade de ordens entregues que você deseja alcançar no mês.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Meta Financeira de Comissão (R$)</Label>
              <Input
                type="number"
                min="100"
                step="50"
                value={tempCommissionTarget}
                onChange={(e) => setTempCommissionTarget(Number(e.target.value))}
                placeholder="Ex: 3000"
              />
              <p className="text-[11px] text-muted-foreground">
                Total de remuneração em comissões almejado para o período.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setIsGoalsModalOpen(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSaveGoals}>
              Salvar Metas
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
