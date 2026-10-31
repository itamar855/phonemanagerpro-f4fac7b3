import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from "recharts";
import {
  Trophy,
  Smartphone,
  Headphones,
  Award,
  Zap,
  TrendingUp,
  Store,
  Wrench,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Info,
  BookOpen,
  HelpCircle,
  Coins,
  Flame,
  Settings,
  RotateCcw,
  SlidersHorizontal,
  Shield,
} from "lucide-react";
import { toast } from "sonner";
import { formatCurrency, exportRankingPDF, exportCSV, COLORS } from "./relatorioPdf";
import { RankBadge, PeriodSelect, ExportBtns } from "./types";
import {
  PATENT_CONFIGS,
  PHONE_TIERS,
  ACCESSORY_TIERS,
  getPatentSettings,
  savePatentSettings,
  resetPatentSettings,
  DEFAULT_PATENT_SETTINGS,
  type PatentSettings,
  type PhoneRuleTier,
  type AccessoryRuleTier,
  type RankSellerPhone,
  type RankSellerAccessory,
  type RankTechnician,
  type StoreAccessoryMetrics,
  type PatentTier,
} from "@/utils/rankingGamification";

export interface DictionaryItem {
  icon: string;
  title: string;
  category: string;
  summary: string;
  description: string;
}

export const DICTIONARY_ITEMS: DictionaryItem[] = [
  {
    icon: "🎖️",
    title: "Patente (Bronze, Prata, Ouro e Diamante)",
    category: "Carreira",
    summary: "Seu nível de maestria e evolução de vendas na empresa.",
    description:
      "Cada colaborador inicia em Bronze e vai conquistando novas patentes conforme vende mais no mês. Subir de patente libera bônus em dinheiro maiores, comissão progressiva extra e reconhecimento de liderança.",
  },
  {
    icon: "🏁",
    title: "Corrida do Mês (Pódio 1º, 2º e 3º)",
    category: "Competição",
    summary: "Disputa mensal saudável que reinicia todo dia 1º.",
    description:
      "No início de cada mês, o placar zera para que todos comecem em igualdade de condições. Isso garante que todo mundo tenha chance real de subir no pódio e conquistar os prêmios do mês.",
  },
  {
    icon: "💵",
    title: "Bônus Fixo em Dinheiro",
    category: "Recompensa",
    summary: "Valor financeiro pago diretamente ao atingir faixas de metas.",
    description:
      "Bateu a meta da patente dentro do mês? O bônus em dinheiro (ex: R$ 150 em Celulares ou R$ 100 em Acessórios) é somado à sua comissão, sem pegadinhas nem burocracia.",
  },
  {
    icon: "📈",
    title: "Comissão Progressiva Extra",
    category: "Comissão",
    summary: "Porcentagem adicional que turbina seus ganhos nas faixas mais altas.",
    description:
      "Ao alcançar a patente Ouro (+0,5%) ou Diamante (+1,0%), você ganha um acréscimo percentual sobre o faturamento de celulares, premiando quem entrega alta performance constante.",
  },
  {
    icon: "🔌",
    title: "Taxa de Anexo (Acessórios)",
    category: "Estratégia",
    summary: "Quantidade média de acessórios vendidos junto com cada aparelho ou atendimento.",
    description:
      "Mede o quanto você aproveita o momento da venda. Se o cliente comprou um celular e você ofereceu e vendeu película 3D + capinha antichoque + fonte turbo, você realizou uma taxa de 3.0x de anexo! O segredo é nunca deixar o cliente sair sem proteção para o aparelho novo.",
  },
  {
    icon: "🔄",
    title: "Trade-In (Aparelho na Troca)",
    category: "Negociação",
    summary: "Celular usado que o cliente entrega para abater no preço do novo.",
    description:
      "Aparelhos na troca são fundamentais para gerar estoque de seminovos com excelente margem. Cada troca captada ganha destaque com selo especial no ranking geral.",
  },
  {
    icon: "🎯",
    title: "Ticket Médio",
    category: "Eficiência",
    summary: "Valor financeiro médio gerado por atendimento.",
    description:
      "Calculado dividindo o faturamento total pelo número de vendas. Para subir o ticket médio, foque em aparelhos de maior valor agregado e combos de acessórios completos.",
  },
  {
    icon: "👥",
    title: "Regras de Participação (Celulares vs Acessórios)",
    category: "Regulamento",
    summary: "Divisão inteligente entre competição geral e crescimento da sua loja.",
    description:
      "O Ranking de Celulares é unificado entre todas as lojas e inclui também nossos técnicos. Já o Ranking de Acessórios é focado na meta local da sua unidade, permitindo que cada vendedora cresça junto com sua loja.",
  },
];

export interface RankingTabProps {
  rankPeriod: string;
  setRankPeriod: (v: string) => void;
  rankSpecificDay: string;
  setRankSpecificDay: (v: string) => void;
  isAdmin: boolean;
  storeId: string;
  setStoreId: (v: string) => void;
  stores: any[];
  ranking: any[];
  rankingPhones?: RankSellerPhone[];
  rankingAccessories?: RankSellerAccessory[];
  rankingTechs?: RankTechnician[];
  storeAccessoryMetrics?: Record<string, StoreAccessoryMetrics>;
  currentRankPeriodLabel: string;
  currentStoreName: string;
  activeStoreId?: string | null;
  currentUserId?: string | null;
}

export const RankingTab: React.FC<RankingTabProps> = ({
  rankPeriod,
  setRankPeriod,
  rankSpecificDay,
  setRankSpecificDay,
  isAdmin,
  storeId,
  setStoreId,
  stores,
  ranking,
  rankingPhones = [],
  rankingAccessories = [],
  rankingTechs = [],
  storeAccessoryMetrics = {},
  currentRankPeriodLabel,
  currentStoreName,
  activeStoreId,
  currentUserId,
}) => {
  const [track, setTrack] = useState<"phones" | "accessories" | "techs" | "rules">("phones");
  const [dictOpen, setDictOpen] = useState(false);
  const [adminConfigOpen, setAdminConfigOpen] = useState(false);

  // Configurações customizáveis de patentes e metas
  const [patentSettings, setPatentSettings] = useState<PatentSettings>(() => getPatentSettings());
  const [editPhoneTiers, setEditPhoneTiers] = useState<PhoneRuleTier[]>(() => getPatentSettings().phoneTiers);
  const [editAccessoryTiers, setEditAccessoryTiers] = useState<AccessoryRuleTier[]>(() => getPatentSettings().accessoryTiers);
  const [editTechAwardPct, setEditTechAwardPct] = useState<number>(() => getPatentSettings().techAward?.top1ExtraCommissionPct ?? 2.0);

  React.useEffect(() => {
    const handleChanged = () => {
      const s = getPatentSettings();
      setPatentSettings(s);
      setEditPhoneTiers(s.phoneTiers);
      setEditAccessoryTiers(s.accessoryTiers);
      setEditTechAwardPct(s.techAward?.top1ExtraCommissionPct ?? 2.0);
    };
    window.addEventListener("ranking_patent_settings_changed", handleChanged);
    return () => window.removeEventListener("ranking_patent_settings_changed", handleChanged);
  }, []);

  const handleOpenAdminConfig = () => {
    const s = getPatentSettings();
    setEditPhoneTiers(JSON.parse(JSON.stringify(s.phoneTiers)));
    setEditAccessoryTiers(JSON.parse(JSON.stringify(s.accessoryTiers)));
    setEditTechAwardPct(s.techAward?.top1ExtraCommissionPct ?? 2.0);
    setAdminConfigOpen(true);
  };

  const updatePhoneTierField = (tierName: "prata" | "ouro" | "diamante", field: keyof PhoneRuleTier, value: any) => {
    setEditPhoneTiers((prev) =>
      prev.map((t) => (t.tier === tierName ? { ...t, [field]: value } : t))
    );
  };

  const updateAccessoryTierField = (tierName: "prata" | "ouro" | "diamante", field: keyof AccessoryRuleTier, value: any) => {
    setEditAccessoryTiers((prev) =>
      prev.map((t) => (t.tier === tierName ? { ...t, [field]: value } : t))
    );
  };

  const handleSaveAdminConfig = () => {
    const prataPhone = editPhoneTiers.find((t) => t.tier === "prata");
    const ouroPhone = editPhoneTiers.find((t) => t.tier === "ouro");
    const diamantePhone = editPhoneTiers.find((t) => t.tier === "diamante");

    const sanitizedPhoneTiers: PhoneRuleTier[] = [
      {
        tier: "bronze",
        minQty: 0,
        maxQty: Math.max(0, (prataPhone?.minQty ?? 6) - 1),
        bonusReais: 0,
        extraCommissionPct: 0,
        description: `Até ${(prataPhone?.minQty ?? 6) - 1} aparelhos vendidos. Comissão base da loja.`,
      },
      {
        tier: "prata",
        minQty: Number(prataPhone?.minQty) || 6,
        maxQty: Math.max(Number(prataPhone?.minQty) || 6, (ouroPhone?.minQty ?? 13) - 1),
        bonusReais: Number(prataPhone?.bonusReais) || 0,
        extraCommissionPct: Number(prataPhone?.extraCommissionPct) || 0,
        description: `${prataPhone?.minQty || 6} a ${(ouroPhone?.minQty ?? 13) - 1} aparelhos. Meta Batida! Bônus de ${formatCurrency(Number(prataPhone?.bonusReais) || 0)} em dinheiro.`,
      },
      {
        tier: "ouro",
        minQty: Number(ouroPhone?.minQty) || 13,
        maxQty: Math.max(Number(ouroPhone?.minQty) || 13, (diamantePhone?.minQty ?? 21) - 1),
        bonusReais: Number(ouroPhone?.bonusReais) || 0,
        extraCommissionPct: Number(ouroPhone?.extraCommissionPct) || 0,
        description: `${ouroPhone?.minQty || 13} a ${(diamantePhone?.minQty ?? 21) - 1} aparelhos. Bônus de ${formatCurrency(Number(ouroPhone?.bonusReais) || 0)} + ${ouroPhone?.extraCommissionPct || 0}% de comissão extra.`,
      },
      {
        tier: "diamante",
        minQty: Number(diamantePhone?.minQty) || 21,
        maxQty: null,
        bonusReais: Number(diamantePhone?.bonusReais) || 0,
        extraCommissionPct: Number(diamantePhone?.extraCommissionPct) || 0,
        description: `Mais de ${(diamantePhone?.minQty ?? 21) - 1} aparelhos. Bônus de ${formatCurrency(Number(diamantePhone?.bonusReais) || 0)} + ${diamantePhone?.extraCommissionPct || 0}% extra + Destaque da Rede.`,
      },
    ];

    const prataAcc = editAccessoryTiers.find((t) => t.tier === "prata");
    const ouroAcc = editAccessoryTiers.find((t) => t.tier === "ouro");
    const diamanteAcc = editAccessoryTiers.find((t) => t.tier === "diamante");

    const sanitizedAccessoryTiers: AccessoryRuleTier[] = [
      {
        tier: "bronze",
        minAmount: 0,
        maxAmount: Number(prataAcc?.minAmount) || 2500,
        bonusReais: 0,
        description: `Até ${formatCurrency(Number(prataAcc?.minAmount) || 2500)} faturados em acessórios no mês.`,
      },
      {
        tier: "prata",
        minAmount: (Number(prataAcc?.minAmount) || 2500) + 0.01,
        maxAmount: Number(ouroAcc?.minAmount) || 5000,
        bonusReais: Number(prataAcc?.bonusReais) || 100,
        description: `${formatCurrency((Number(prataAcc?.minAmount) || 2500) + 1)} a ${formatCurrency(Number(ouroAcc?.minAmount) || 5000)}. Meta 1 Batida! Bônus de ${formatCurrency(Number(prataAcc?.bonusReais) || 100)}.`,
      },
      {
        tier: "ouro",
        minAmount: (Number(ouroAcc?.minAmount) || 5000) + 0.01,
        maxAmount: Number(diamanteAcc?.minAmount) || 8000,
        bonusReais: Number(ouroAcc?.bonusReais) || 250,
        description: `${formatCurrency((Number(ouroAcc?.minAmount) || 5000) + 1)} a ${formatCurrency(Number(diamanteAcc?.minAmount) || 8000)}. Super Meta! Bônus de ${formatCurrency(Number(ouroAcc?.bonusReais) || 250)}.`,
      },
      {
        tier: "diamante",
        minAmount: (Number(diamanteAcc?.minAmount) || 8000) + 0.01,
        maxAmount: null,
        bonusReais: Number(diamanteAcc?.bonusReais) || 500,
        description: `Acima de ${formatCurrency(Number(diamanteAcc?.minAmount) || 8000)}. Recorde de vendas! Bônus de ${formatCurrency(Number(diamanteAcc?.bonusReais) || 500)}.`,
      },
    ];

    savePatentSettings({
      phoneTiers: sanitizedPhoneTiers,
      accessoryTiers: sanitizedAccessoryTiers,
      techAward: {
        top1ExtraCommissionPct: Number(editTechAwardPct) || 2.0,
        minOrdersToQualify: 1,
      },
    });
    toast.success("Metas e patentes salvas com sucesso!");
    setAdminConfigOpen(false);
  };

  const handleResetAdminConfig = () => {
    resetPatentSettings();
    const defaults = getPatentSettings();
    setEditPhoneTiers(defaults.phoneTiers);
    setEditAccessoryTiers(defaults.accessoryTiers);
    setEditTechAwardPct(defaults.techAward?.top1ExtraCommissionPct ?? 2.0);
    toast.info("Configurações restauradas para o padrão do sistema.");
  };

  // Vendedor ativo para exibir barra de evolução pessoal
  const myPhoneStats = rankingPhones.find((p) => p.uid === currentUserId);
  const myTechStats = rankingTechs.find((p) => p.uid === currentUserId);
  const top1Tech = rankingTechs.find((r) => r.isTop1) || rankingTechs[0] || null;
  const myAccessoryStats = rankingAccessories.find((a) => a.uid === currentUserId);

  // Métrica da loja ativa para acessórios
  const effectiveStore = isAdmin ? storeId : activeStoreId || "all";
  const currentStoreMetric =
    effectiveStore !== "all"
      ? storeAccessoryMetrics[effectiveStore]
      : Object.values(storeAccessoryMetrics)[0];

  const handleExportCSV = () => {
    if (track === "phones") {
      exportCSV(
        rankingPhones.map((v, i) => ({
          posicao: `${i + 1}º`,
          colaborador: v.nome,
          funcao: v.isTechnician ? "Técnico" : "Vendedor",
          loja: v.storeName,
          patente: PATENT_CONFIGS[v.patent.currentTier].label,
          celulares_vendidos: v.qtdCelulares,
          com_troca_trade_in: v.tradeInCount,
          ticket_medio: formatCurrency(v.ticketMedio),
          total_vendido: formatCurrency(v.totalVendas),
          bonus_desbloqueado: formatCurrency(v.patent.bonusUnlocked),
        })),
        `ranking-celulares-${currentRankPeriodLabel.replace(/\s+/g, "_")}.csv`
      );
    } else if (track === "accessories") {
      exportCSV(
        rankingAccessories.map((v, i) => ({
          posicao: `${i + 1}º`,
          vendedora: v.nome,
          loja: v.storeName,
          patente: PATENT_CONFIGS[v.patent.currentTier].label,
          pecas_vendidas: v.qtdPecas,
          transacoes: v.qtdTransacoes,
          ticket_medio_transacao: formatCurrency(v.ticketMedioTransacao),
          ticket_medio_peca: formatCurrency(v.ticketMedioPeca),
          total_faturado: formatCurrency(v.totalFaturado),
          bonus_desbloqueado: formatCurrency(v.patent.bonusUnlocked),
        })),
        `ranking-acessorios-${currentRankPeriodLabel.replace(/\s+/g, "_")}.csv`
      );
    } else {
      exportCSV(
        ranking.map((v, i) => ({
          posicao: i + 1 + "o",
          vendedor: v.nome,
          vendas: v.qtdVendas,
          total_vendido: formatCurrency(v.totalVendas),
          lucro: formatCurrency(v.lucro),
          comissao: formatCurrency(v.comissoes),
          os_entregues: v.osEntregues,
        })),
        "ranking-geral.csv"
      );
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Top Bar: Controles de Período, Loja e Exportação ───────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3 p-3 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm">
        <div className="flex flex-wrap gap-2.5 items-end">
          {/* Alternância Rápida: Este Mês vs Mês Passado */}
          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Ciclo do Ranking</Label>
            <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border/60 h-9">
              <button
                type="button"
                onClick={() => setRankPeriod("month")}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  rankPeriod === "month"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span>Este Mês (Corrida Ativa)</span>
              </button>
              <button
                type="button"
                onClick={() => setRankPeriod("last_month")}
                className={`px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all ${
                  rankPeriod === "last_month"
                    ? "bg-amber-500 text-slate-950 font-bold shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                <span>Mês Passado (Final)</span>
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-medium text-muted-foreground">Outros Filtros</Label>
            <PeriodSelect value={rankPeriod} onChange={setRankPeriod} includeCustom={false} />
          </div>
          {rankPeriod === "day" && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">Dia Específico</Label>
              <Input
                type="date"
                value={rankSpecificDay}
                onChange={(e) => setRankSpecificDay(e.target.value)}
                className="h-9 w-36"
              />
            </div>
          )}
          {isAdmin && (
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">
                {track === "accessories" ? "Filtrar Loja (Acessórios)" : "Loja"}
              </Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as lojas</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isAdmin && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenAdminConfig}
              className="h-9 gap-1.5 text-xs border-amber-500/40 bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 shadow-sm font-semibold"
            >
              <Settings className="h-4 w-4 text-amber-500" />
              <span className="hidden sm:inline">Ajustar Metas & Patentes</span>
              <span className="sm:hidden">Ajustar Metas</span>
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setDictOpen(true)}
            className="h-9 gap-1.5 text-xs border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 shadow-sm"
          >
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline font-semibold">Mini Dicionário</span>
            <span className="sm:hidden font-semibold">Dicionário</span>
          </Button>
          <ExportBtns
            onCSV={handleExportCSV}
            onPDF={() => exportRankingPDF(ranking, currentRankPeriodLabel, currentStoreName)}
          />
        </div>
      </div>

      {/* ── BANNER DAS CAMPEÃS DO MÊS PASSADO (HALL DA FAMA) ── */}
      {rankPeriod === "last_month" && (
        <Card className="border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-transparent p-4 shadow-sm animate-in fade-in duration-300">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                👑
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-bold text-sm md:text-base text-foreground flex items-center gap-1.5">
                    Hall da Fama — Campeãs do Mês Passado
                  </h3>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30">
                    {currentRankPeriodLabel}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Resultado oficial congelado do fechamento do mês anterior. Parabéns às vencedoras pelo topo do pódio!
                </p>
              </div>
            </div>
            {rankingPhones[0] && (
              <div className="flex items-center gap-2.5 bg-background/80 border border-amber-500/30 px-3.5 py-2 rounded-xl text-xs shadow-sm">
                <span className="text-xl">🏆</span>
                <div>
                  <div className="text-[10px] text-muted-foreground font-semibold">1º Lugar Geral (Celulares)</div>
                  <div className="font-bold text-foreground">
                    {rankingPhones[0].nome}{" "}
                    <span className="text-amber-500 font-mono font-extrabold">({rankingPhones[0].qtdCelulares} un)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* ── Seletor de Trilhas de Gamificação ────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 border-b border-border/60 pb-3">
        <button
          type="button"
          onClick={() => setTrack("phones")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
            track === "phones"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Smartphone className="h-4 w-4" />
          <span>Celulares (Geral / Unificado)</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/20 font-mono">
            {rankingPhones.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTrack("accessories")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
            track === "accessories"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Headphones className="h-4 w-4" />
          <span>Acessórios (Por Loja)</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/20 font-mono">
            {rankingAccessories.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTrack("techs")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
            track === "techs"
              ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Wrench className="h-4 w-4" />
          <span>Bancada & Técnicos (Top 1)</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-background/20 font-mono">
            {rankingTechs.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTrack("rules")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all ${
            track === "rules"
              ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
              : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
        >
          <Award className="h-4 w-4 text-yellow-400" />
          <span>Patentes & Premiações</span>
        </button>
      </div>

      {/* ── TRILHA 1: CELULARES (GERAL / UNIFICADO) ──────────────────────────────── */}
      {track === "phones" && (
        <div className="space-y-5">
          {/* Banner Motivacional / Pódio dos 3 Primeiros */}
          {rankingPhones.length >= 3 && (
            <Card className="border-border/60 bg-gradient-to-b from-card to-muted/20 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500 animate-pulse" />
                    Pódio do Mês — Celulares Vendidos
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Corrida mensal (reinicia todo dia 1º)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-4 pb-2">
                  {/* 2º Lugar */}
                  <div className="flex flex-col items-center p-3 rounded-xl border border-slate-400/30 bg-slate-500/5 text-center">
                    <span className="text-2xl sm:text-3xl mb-1">🥈</span>
                    <span className="text-xs font-semibold text-slate-400">2º Lugar</span>
                    <p className="font-bold text-xs sm:text-sm text-foreground truncate max-w-full mt-1">
                      {rankingPhones[1].nome}
                    </p>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {rankingPhones[1].isTechnician ? "🔧 Técnico" : "💼 Vendedora"}
                    </span>
                    <div className="mt-2 text-xs font-extrabold text-foreground">
                      {rankingPhones[1].qtdCelulares} <span className="font-normal text-[10px] text-muted-foreground">aparelhos</span>
                    </div>
                    <span className="text-[10px] text-primary font-semibold">
                      {formatCurrency(rankingPhones[1].totalVendas)}
                    </span>
                  </div>

                  {/* 1º Lugar (Mais alto) */}
                  <div className="flex flex-col items-center p-3.5 sm:p-4 rounded-xl border-2 border-yellow-500/50 bg-yellow-500/10 text-center shadow-lg shadow-yellow-500/10 -mt-2">
                    <span className="text-3xl sm:text-4xl mb-1">🥇</span>
                    <span className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Líder Geral</span>
                    <p className="font-extrabold text-sm sm:text-base text-foreground truncate max-w-full mt-1">
                      {rankingPhones[0].nome}
                    </p>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {rankingPhones[0].isTechnician ? "🔧 Técnico" : "💼 Vendedora"} • {rankingPhones[0].storeName}
                    </span>
                    <div className="mt-2 text-sm sm:text-base font-extrabold text-yellow-500">
                      {rankingPhones[0].qtdCelulares} <span className="font-normal text-[10px] text-muted-foreground">aparelhos</span>
                    </div>
                    <span className="text-[10px] text-primary font-bold">
                      {formatCurrency(rankingPhones[0].totalVendas)}
                    </span>
                    {rankingPhones[0].patent.bonusUnlocked > 0 && (
                      <span className="mt-1 text-[9px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 font-semibold">
                        Bônus: {formatCurrency(rankingPhones[0].patent.bonusUnlocked)}
                      </span>
                    )}
                  </div>

                  {/* 3º Lugar */}
                  <div className="flex flex-col items-center p-3 rounded-xl border border-amber-700/30 bg-amber-700/5 text-center">
                    <span className="text-2xl sm:text-3xl mb-1">🥉</span>
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-500">3º Lugar</span>
                    <p className="font-bold text-xs sm:text-sm text-foreground truncate max-w-full mt-1">
                      {rankingPhones[2].nome}
                    </p>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {rankingPhones[2].isTechnician ? "🔧 Técnico" : "💼 Vendedora"}
                    </span>
                    <div className="mt-2 text-xs font-extrabold text-foreground">
                      {rankingPhones[2].qtdCelulares} <span className="font-normal text-[10px] text-muted-foreground">aparelhos</span>
                    </div>
                    <span className="text-[10px] text-primary font-semibold">
                      {formatCurrency(rankingPhones[2].totalVendas)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card de Evolução Pessoal da Vendedora / Técnico Logado */}
          {myPhoneStats && (
            <Card className="border border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-bold tracking-wider text-primary">Seu Desempenho no Período</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${PATENT_CONFIGS[myPhoneStats.patent.currentTier].badgeClass}`}>
                        {PATENT_CONFIGS[myPhoneStats.patent.currentTier].icon} Patente {PATENT_CONFIGS[myPhoneStats.patent.currentTier].label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Você vendeu <strong className="text-foreground">{myPhoneStats.qtdCelulares} aparelhos</strong> ({formatCurrency(myPhoneStats.totalVendas)}).
                      {myPhoneStats.patent.nextTier ? (
                        <> Faltam apenas <strong className="text-primary">{myPhoneStats.patent.remainingValue} celulares</strong> para alcançar a patente <strong>{PATENT_CONFIGS[myPhoneStats.patent.nextTier].label}</strong> e liberar <strong>{formatCurrency(myPhoneStats.patent.nextBonus)}</strong> de bônus!</>
                      ) : (
                        <> Parabéns! Você atingiu a patente máxima <strong>Diamante</strong> com bônus de {formatCurrency(myPhoneStats.patent.bonusUnlocked)}!</>
                      )}
                    </p>
                  </div>
                  <div className="w-full sm:w-48 text-right">
                    <span className="text-xs font-bold text-foreground">{myPhoneStats.patent.progressPercent}%</span>
                    <div className="w-full h-2 rounded-full bg-muted mt-1 overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500 rounded-full"
                        style={{ width: `${myPhoneStats.patent.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabela do Ranking de Celulares */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" /> Classificação Geral — Vendedoras & Técnicos
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {rankingPhones.length} participante{rankingPhones.length !== 1 ? "s" : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rankingPhones.length > 0 ? (
                <div className="space-y-2">
                  {rankingPhones.map((v, i) => {
                    const cfg = PATENT_CONFIGS[v.patent.currentTier];
                    return (
                      <div
                        key={v.uid}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all gap-2 ${
                          i === 0
                            ? "border-yellow-500/40 bg-yellow-500/5 shadow-sm"
                            : i === 1
                            ? "border-slate-400/40 bg-slate-400/5"
                            : i === 2
                            ? "border-amber-700/40 bg-amber-700/5"
                            : "border-border/50 bg-card hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 shrink-0 flex justify-center">
                            <RankBadge pos={i + 1} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-foreground">{v.nome}</span>
                              {v.isTechnician ? (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 font-medium flex items-center gap-1">
                                  <Wrench className="h-2.5 w-2.5" /> Técnico
                                </span>
                              ) : (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 font-medium">
                                  💼 Vendedora
                                </span>
                              )}
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${cfg.badgeClass}`}>
                                {cfg.icon} {cfg.label}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-muted-foreground mt-1">
                              <span className="flex items-center gap-1">
                                <Store className="h-3 w-3" /> {v.storeName}
                              </span>
                              <span>•</span>
                              <span>Ticket Médio: <strong className="text-foreground">{formatCurrency(v.ticketMedio)}</strong></span>
                              {v.tradeInCount > 0 && (
                                <>
                                  <span>•</span>
                                  <span className="text-cyan-500 font-medium">
                                    🔄 {v.tradeInCount} com Troca ({formatCurrency(v.tradeInTotalValue)})
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                          <div className="text-left sm:text-right">
                            <div className="text-sm sm:text-base font-extrabold text-foreground">
                              {v.qtdCelulares} <span className="text-xs font-normal text-muted-foreground">aparelho{v.qtdCelulares !== 1 ? "s" : ""}</span>
                            </div>
                            <div className="text-xs font-bold text-primary">
                              {formatCurrency(v.totalVendas)}
                            </div>
                          </div>
                          {v.patent.bonusUnlocked > 0 && (
                            <div className="text-right pl-3 border-l border-border/50">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Bônus Meta</span>
                              <span className="text-xs font-extrabold text-emerald-500">
                                +{formatCurrency(v.patent.bonusUnlocked)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground text-xs">
                  Nenhuma venda de celular registrada no período selecionado.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TRILHA 2: ACESSÓRIOS (POR LOJA / FOCO LOCAL) ─────────────────────────── */}
      {track === "accessories" && (
        <div className="space-y-5">
          {/* Card Resumo de Metas da Loja */}
          {currentStoreMetric && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="border-border/60 bg-card p-3.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Faturamento Acessórios</span>
                <span className="text-base sm:text-xl font-extrabold text-primary block mt-1">
                  {formatCurrency(currentStoreMetric.totalFaturado)}
                </span>
                <span className="text-[10px] text-muted-foreground">{currentStoreMetric.storeName}</span>
              </Card>

              <Card className="border-border/60 bg-card p-3.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Peças Vendidas</span>
                <span className="text-base sm:text-xl font-extrabold text-foreground block mt-1">
                  {currentStoreMetric.qtdPecas} <span className="text-xs font-normal text-muted-foreground">itens</span>
                </span>
                <span className="text-[10px] text-muted-foreground">{currentStoreMetric.qtdTransacoes} atendimentos</span>
              </Card>

              <Card className="border-border/60 bg-card p-3.5">
                <span className="text-[10px] uppercase font-bold text-muted-foreground block">Ticket Médio</span>
                <span className="text-base sm:text-xl font-extrabold text-foreground block mt-1">
                  {formatCurrency(currentStoreMetric.ticketMedioTransacao)}
                </span>
                <span className="text-[10px] text-muted-foreground">Por atendimento</span>
              </Card>

              <Card className="border-border/60 bg-card p-3.5 relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground">Taxa de Anexo</span>
                  <Zap className="h-3.5 w-3.5 text-yellow-500" />
                </div>
                <span className="text-base sm:text-xl font-extrabold text-amber-500 block mt-1">
                  {currentStoreMetric.taxaAnexo}x
                </span>
                <span className="text-[10px] text-muted-foreground">Acessórios / celular</span>
              </Card>
            </div>
          )}

          {/* Card de Evolução Pessoal em Acessórios */}
          {myAccessoryStats && (
            <Card className="border border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400">
                        Sua Meta de Acessórios
                      </span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${PATENT_CONFIGS[myAccessoryStats.patent.currentTier].badgeClass}`}>
                        {PATENT_CONFIGS[myAccessoryStats.patent.currentTier].icon} Patente {PATENT_CONFIGS[myAccessoryStats.patent.currentTier].label}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Você faturou <strong className="text-foreground">{formatCurrency(myAccessoryStats.totalFaturado)}</strong> em acessórios ({myAccessoryStats.qtdPecas} peças vendidas).
                      {myAccessoryStats.patent.nextTier ? (
                        <> Faltam <strong className="text-emerald-500">{formatCurrency(myAccessoryStats.patent.remainingValue)}</strong> para subir para a patente <strong>{PATENT_CONFIGS[myAccessoryStats.patent.nextTier].label}</strong> e ganhar <strong>{formatCurrency(myAccessoryStats.patent.nextBonus)}</strong> de bônus!</>
                      ) : (
                        <> Parabéns! Você atingiu a patente máxima de acessórios com bônus de {formatCurrency(myAccessoryStats.patent.bonusUnlocked)}!</>
                      )}
                    </p>
                  </div>
                  <div className="w-full sm:w-48 text-right">
                    <span className="text-xs font-bold text-foreground">{myAccessoryStats.patent.progressPercent}%</span>
                    <div className="w-full h-2 rounded-full bg-muted mt-1 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                        style={{ width: `${myAccessoryStats.patent.progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabela de Vendedoras de Acessórios */}
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-display flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Headphones className="h-4 w-4 text-primary" /> Vendas de Acessórios por Colaboradora
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  Meta mensal por loja
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {rankingAccessories.length > 0 ? (
                <div className="space-y-2">
                  {rankingAccessories.map((v, i) => {
                    const cfg = PATENT_CONFIGS[v.patent.currentTier];
                    return (
                      <div
                        key={v.uid}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all gap-2 ${
                          i === 0
                            ? "border-yellow-500/40 bg-yellow-500/5 shadow-sm"
                            : "border-border/50 bg-card hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 shrink-0 flex justify-center">
                            <RankBadge pos={i + 1} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-foreground">{v.nome}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {v.storeName}
                              </span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${cfg.badgeClass}`}>
                                {cfg.icon} {cfg.label}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mt-1">
                              <span>{v.qtdPecas} peças em {v.qtdTransacoes} vendas</span>
                              <span>•</span>
                              <span>Ticket Médio: <strong className="text-foreground">{formatCurrency(v.ticketMedioTransacao)}</strong></span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                          <div className="text-left sm:text-right">
                            <div className="text-sm sm:text-base font-extrabold text-primary">
                              {formatCurrency(v.totalFaturado)}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {v.qtdPecas} itens vendidos
                            </div>
                          </div>
                          {v.patent.bonusUnlocked > 0 && (
                            <div className="text-right pl-3 border-l border-border/50">
                              <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">Bônus</span>
                              <span className="text-xs font-extrabold text-emerald-500">
                                +{formatCurrency(v.patent.bonusUnlocked)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground text-xs">
                  Nenhuma venda de acessório registrada no período para a loja selecionada.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TRILHA 3: BANCADA & TÉCNICOS (PREMIAÇÃO TOP 1) ────────────────────── */}
      {track === "techs" && (
        <div className="space-y-5">
          {/* Banner da Premiação Top 1 */}
          <Card className="border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-transparent p-4 shadow-sm">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-2xl shrink-0 shadow-inner">
                  👑
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-sm md:text-base text-foreground flex items-center gap-1.5">
                      Trilha Técnica — Premiação Top 1 da Bancada
                    </h3>
                    <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold border border-amber-500/30 text-[10px]">
                      +{patentSettings.techAward?.top1ExtraCommissionPct ?? 2}% Comissão Extra
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    O técnico que fechar o mês em 1º lugar no volume de reparos entregues conquista a comissão extra sobre todos os serviços realizados no período.
                  </p>
                </div>
              </div>
              {top1Tech && (
                <div className="flex items-center gap-2.5 bg-background/80 border border-amber-500/30 px-3.5 py-2 rounded-xl text-xs shadow-sm">
                  <span className="text-xl">🥇</span>
                  <div>
                    <div className="text-[10px] text-muted-foreground font-semibold">Líder Atual da Bancada</div>
                    <div className="font-bold text-foreground">
                      {top1Tech.nome}{" "}
                      <span className="text-amber-500 font-mono font-extrabold">({top1Tech.deliveredOrders} OS)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Pódio dos Técnicos (Top 3) */}
          {rankingTechs.length >= 3 && (
            <Card className="border-border/60 bg-gradient-to-b from-card to-muted/20 overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-display flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Trophy className="h-4 w-4 text-yellow-500 animate-pulse" />
                    Pódio do Mês — Equipe Técnica
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    Critério: Volume de OSs entregues (desempate por lucro)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="grid grid-cols-3 gap-2 sm:gap-4 items-end pt-4 pb-2">
                  {/* 2º Lugar */}
                  <div className="flex flex-col items-center p-3 rounded-xl border border-slate-400/30 bg-slate-500/5 text-center">
                    <span className="text-2xl sm:text-3xl mb-1">🥈</span>
                    <span className="text-xs font-semibold text-slate-400">2º Lugar</span>
                    <p className="font-bold text-xs sm:text-sm text-foreground truncate max-w-full mt-1">
                      {rankingTechs[1].nome}
                    </p>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {rankingTechs[1].storeName}
                    </span>
                    <div className="mt-2 text-xs font-extrabold text-foreground">
                      {rankingTechs[1].deliveredOrders} <span className="font-normal text-[10px] text-muted-foreground">OS entregues</span>
                    </div>
                    <span className="text-[10px] text-emerald-500 font-semibold">
                      Lucro: {formatCurrency(rankingTechs[1].totalLaborRevenue)}
                    </span>
                  </div>

                  {/* 1º Lugar (Destaque Ouro com Coroa e Bônus) */}
                  <div className="flex flex-col items-center p-3.5 sm:p-4 rounded-xl border-2 border-yellow-500/50 bg-yellow-500/10 text-center shadow-lg shadow-yellow-500/10 -mt-2">
                    <span className="text-3xl sm:text-4xl mb-1">🥇</span>
                    <span className="text-xs font-bold text-yellow-500 uppercase tracking-wider">Top 1 Bancada</span>
                    <p className="font-extrabold text-sm sm:text-base text-foreground truncate max-w-full mt-1">
                      {rankingTechs[0].nome}
                    </p>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {rankingTechs[0].storeName}
                    </span>
                    <div className="mt-2 text-sm sm:text-base font-extrabold text-yellow-500">
                      {rankingTechs[0].deliveredOrders} <span className="font-normal text-[10px] text-muted-foreground">OS entregues</span>
                    </div>
                    <span className="text-[10px] text-emerald-500 font-bold">
                      Lucro: {formatCurrency(rankingTechs[0].totalLaborRevenue)}
                    </span>
                    <Badge className="mt-2 text-[10px] bg-amber-500/25 text-amber-600 dark:text-amber-400 border-amber-500/40 font-bold">
                      +{rankingTechs[0].extraCommissionPct}% Extra (+{formatCurrency(rankingTechs[0].extraCommissionValue)})
                    </Badge>
                  </div>

                  {/* 3º Lugar */}
                  <div className="flex flex-col items-center p-3 rounded-xl border border-amber-700/30 bg-amber-700/5 text-center">
                    <span className="text-2xl sm:text-3xl mb-1">🥉</span>
                    <span className="text-xs font-semibold text-amber-600 dark:text-amber-500">3º Lugar</span>
                    <p className="font-bold text-xs sm:text-sm text-foreground truncate max-w-full mt-1">
                      {rankingTechs[2].nome}
                    </p>
                    <span className="text-[10px] text-muted-foreground mt-0.5">
                      {rankingTechs[2].storeName}
                    </span>
                    <div className="mt-2 text-xs font-extrabold text-foreground">
                      {rankingTechs[2].deliveredOrders} <span className="font-normal text-[10px] text-muted-foreground">OS entregues</span>
                    </div>
                    <span className="text-[10px] text-emerald-500 font-semibold">
                      Lucro: {formatCurrency(rankingTechs[2].totalLaborRevenue)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card de Desempenho do Técnico Logado */}
          {myTechStats && (
            <Card className="border border-primary/30 bg-primary/5">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs uppercase font-bold tracking-wider text-primary">Seu Desempenho de Bancada</span>
                      <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20 font-bold">
                        {myTechStats.rank}º Lugar
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Você concluiu <strong className="text-foreground">{myTechStats.deliveredOrders} reparos</strong> gerando <strong className="text-emerald-500">{formatCurrency(myTechStats.totalLaborRevenue)}</strong> de mão de obra.
                      {myTechStats.isTop1 ? (
                        <span className="text-amber-500 font-bold ml-1">
                          Parabéns! Você é o Top 1 e tem direito a +{myTechStats.extraCommissionPct}% de comissão extra (+{formatCurrency(myTechStats.extraCommissionValue)})!
                        </span>
                      ) : top1Tech ? (
                        <> Faltam <strong className="text-primary">{Math.max(1, top1Tech.deliveredOrders - myTechStats.deliveredOrders + 1)} OSs</strong> para você alcançar o 1º lugar de {top1Tech.nome} e conquistar o bônus de comissão extra!</>
                      ) : null}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Comissão Apurada</span>
                    <span className="text-base font-extrabold text-foreground font-mono">
                      {formatCurrency(myTechStats.totalCommission)}
                    </span>
                    {myTechStats.isTop1 && myTechStats.extraCommissionValue > 0 && (
                      <span className="text-[10px] text-amber-500 font-bold block">
                        (Inclui +{formatCurrency(myTechStats.extraCommissionValue)} de Top 1)
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabela de Classificação da Equipe Técnica */}
          <Card className="border-border/60 shadow-sm">
            <CardHeader className="pb-3 border-b border-border/40">
              <CardTitle className="text-sm font-display flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-primary" /> Classificação Geral da Bancada
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {currentRankPeriodLabel} • {currentStoreName}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {rankingTechs.length > 0 ? (
                <div className="space-y-2">
                  {rankingTechs.map((t) => (
                    <div
                      key={t.uid}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border transition-all gap-2 ${
                        t.isTop1
                          ? "border-amber-500/40 bg-amber-500/10 shadow-sm"
                          : t.uid === currentUserId
                          ? "border-primary/40 bg-primary/5"
                          : "border-border/50 bg-card hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 shrink-0 flex justify-center">
                          <RankBadge pos={t.rank} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground">{t.nome}</span>
                            {t.uid === currentUserId && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">
                                Você
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {t.storeName}
                            </span>
                            {t.isTop1 && (
                              <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-bold">
                                👑 Top 1 (+{t.extraCommissionPct}% Extra)
                              </Badge>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mt-1">
                            <span><strong>{t.deliveredOrders}</strong> OS entregues</span>
                            <span>•</span>
                            <span>Mão de Obra Líquida: <strong className="text-emerald-500">{formatCurrency(t.totalLaborRevenue)}</strong></span>
                            <span>•</span>
                            <span>Ticket Médio: <strong className="text-foreground">{formatCurrency(t.ticketMedioLabor)}</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-2 sm:pt-0 border-border/40">
                        <div className="text-left sm:text-right">
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                            Comissão Total
                          </span>
                          <span className="text-sm sm:text-base font-extrabold text-foreground font-mono">
                            {formatCurrency(t.totalCommission)}
                          </span>
                          {t.isTop1 && t.extraCommissionValue > 0 && (
                            <span className="text-[10px] text-amber-500 font-bold block">
                              +{formatCurrency(t.extraCommissionValue)} de Top 1
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-10 text-muted-foreground text-xs">
                  Nenhum reparo entregue registrado no período para a equipe técnica.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── TRILHA 4: PATENTES, METAS & REGRAS DE BONIFICAÇÃO ─────────────────────── */}
      {track === "rules" && (
        <div className="space-y-5">
          {/* Explicação da Filosofia de Crescimento */}
          <Card className="border-border/60 bg-card p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-sm text-foreground">Como Funciona a Gamificação da Rede</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Nosso modelo de crescimento foi desenhado para incentivar e premiar o esforço de todos. Ele combina:
                  <strong className="text-foreground"> Bônus fixo em dinheiro por meta batida</strong>,
                  <strong className="text-foreground"> comissão progressiva</strong> e
                  <strong className="text-foreground"> reconhecimento público da liderança</strong>.
                  A corrida do mês reinicia todo dia 1º para que todos sempre tenham chance de vencer, enquanto as patentes consagram a consistência ao longo do tempo.
                </p>
              </div>
            </div>
          </Card>

          {/* Cards das Patentes de Celulares */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5 text-primary" /> Régua de Metas — Celulares (Vendedoras + Técnicos)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {patentSettings.phoneTiers.map((tier) => {
                const cfg = PATENT_CONFIGS[tier.tier];
                return (
                  <Card key={tier.tier} className={`border p-4 ${cfg.bgColor} ${cfg.borderColor}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{cfg.icon}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${cfg.badgeClass}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <h5 className="font-bold text-sm text-foreground">
                      {tier.maxQty ? `${tier.minQty} a ${tier.maxQty} Aparelhos` : `Acima de ${tier.minQty} Aparelhos`}
                    </h5>
                    <p className="text-xs text-muted-foreground mt-1 min-h-[36px]">
                      {tier.description}
                    </p>
                    <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Premiação:</span>
                      <span className="text-xs font-extrabold text-emerald-500">
                        {tier.bonusReais > 0 ? `+${formatCurrency(tier.bonusReais)} Bônus` : "Comissão Base"}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Cards das Patentes de Acessórios */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <Headphones className="h-3.5 w-3.5 text-primary" /> Régua de Metas — Acessórios (Por Loja)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {patentSettings.accessoryTiers.map((tier) => {
                const cfg = PATENT_CONFIGS[tier.tier];
                return (
                  <Card key={tier.tier} className={`border p-4 ${cfg.bgColor} ${cfg.borderColor}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{cfg.icon}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${cfg.badgeClass}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <h5 className="font-bold text-sm text-foreground">
                      {tier.maxAmount
                        ? `${formatCurrency(tier.minAmount)} até ${formatCurrency(tier.maxAmount)}`
                        : `Acima de ${formatCurrency(tier.minAmount)}`}
                    </h5>
                    <p className="text-xs text-muted-foreground mt-1 min-h-[36px]">
                      {tier.description}
                    </p>
                    <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">Premiação:</span>
                      <span className="text-xs font-extrabold text-emerald-500">
                        {tier.bonusReais > 0 ? `+${formatCurrency(tier.bonusReais)} Bônus` : "Meta Base"}
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* ── 📖 MINI DICIONÁRIO DE METAS & GAMIFICAÇÃO ── */}
          <div className="space-y-3 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-2 gap-1">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <BookOpen className="h-4 w-4 text-primary" /> Mini Dicionário de Metas & Regras da Loja
              </h4>
              <span className="text-[11px] text-muted-foreground">
                Tudo o que você precisa saber para evoluir e ganhar mais
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {DICTIONARY_ITEMS.map((item, idx) => (
                <Card
                  key={idx}
                  className="border border-border/60 bg-card/60 p-4 hover:border-primary/40 transition-colors shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-2xl shrink-0 p-1.5 rounded-lg bg-muted/60 border border-border/40">
                      {item.icon}
                    </span>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground">{item.title}</span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 font-semibold uppercase">
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-primary">{item.summary}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed pt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Gráfico Comparativo ─────────────────────────────────────────────────── */}
      {ranking.length > 0 && track !== "rules" && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm">Volume Comparativo por Colaborador</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={ranking.map((v) => ({ nome: v.nome.split(" ")[0], vendas: v.totalVendas, lucro: v.lucro }))}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="vendas" fill={COLORS[0]} radius={[4, 4, 0, 0]} name="Vendas" />
                <Bar dataKey="lucro" fill={COLORS[1]} radius={[4, 4, 0, 0]} name="Lucro" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── MODAL DIALOG DO MINI DICIONÁRIO DE METAS ── */}
      <Dialog open={dictOpen} onOpenChange={setDictOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base font-display flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              Mini Dicionário de Metas & Gamificação
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Entenda cada conceito, como conquistar as patentes e como multiplicar seus ganhos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {DICTIONARY_ITEMS.map((item, idx) => (
              <div
                key={idx}
                className="p-3.5 rounded-xl border border-border/60 bg-muted/20 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{item.icon}</span>
                    <span className="font-bold text-sm text-foreground">{item.title}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-semibold uppercase">
                    {item.category}
                  </span>
                </div>
                <p className="text-xs font-semibold text-primary pl-7">{item.summary}</p>
                <p className="text-xs text-muted-foreground leading-relaxed pl-7">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── MODAL EXCLUSIVO ADMIN: AJUSTAR METAS & PATENTES ── */}
      {isAdmin && (
        <Dialog open={adminConfigOpen} onOpenChange={setAdminConfigOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base font-display flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-foreground font-bold">
                  <Settings className="h-5 w-5 text-amber-500" />
                  Painel Admin: Ajustar Metas e Porcentagens das Patentes
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Personalize as réguas de metas, porcentagens extras e bônus em dinheiro de cada patente. Todas as colaboradoras verão as metas atualizadas instantaneamente.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-2">
              {/* SEÇÃO 1: TRILHA CELULARES */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border/60 pb-1.5">
                  <Smartphone className="h-4 w-4 text-primary" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Trilha de Celulares (Metas, Bônus e Comissão Extra)
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Prata */}
                  <div className="p-3 rounded-xl border border-slate-400/40 bg-slate-500/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        🥈 Patente Prata
                      </span>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Mínimo de Aparelhos</Label>
                      <Input
                        type="number"
                        min="1"
                        value={editPhoneTiers.find((t) => t.tier === "prata")?.minQty || 6}
                        onChange={(e) => updatePhoneTierField("prata", "minQty", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Bônus Fixo em Dinheiro (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editPhoneTiers.find((t) => t.tier === "prata")?.bonusReais ?? 150}
                        onChange={(e) => updatePhoneTierField("prata", "bonusReais", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Comissão Extra (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editPhoneTiers.find((t) => t.tier === "prata")?.extraCommissionPct ?? 0}
                        onChange={(e) => updatePhoneTierField("prata", "extraCommissionPct", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>

                  {/* Ouro */}
                  <div className="p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        🥇 Patente Ouro
                      </span>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Mínimo de Aparelhos</Label>
                      <Input
                        type="number"
                        min="1"
                        value={editPhoneTiers.find((t) => t.tier === "ouro")?.minQty || 13}
                        onChange={(e) => updatePhoneTierField("ouro", "minQty", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Bônus Fixo em Dinheiro (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editPhoneTiers.find((t) => t.tier === "ouro")?.bonusReais ?? 350}
                        onChange={(e) => updatePhoneTierField("ouro", "bonusReais", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Comissão Extra (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editPhoneTiers.find((t) => t.tier === "ouro")?.extraCommissionPct ?? 0.5}
                        onChange={(e) => updatePhoneTierField("ouro", "extraCommissionPct", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>

                  {/* Diamante */}
                  <div className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/5 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        💎 Patente Diamante
                      </span>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Mínimo de Aparelhos</Label>
                      <Input
                        type="number"
                        min="1"
                        value={editPhoneTiers.find((t) => t.tier === "diamante")?.minQty || 21}
                        onChange={(e) => updatePhoneTierField("diamante", "minQty", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Bônus Fixo em Dinheiro (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editPhoneTiers.find((t) => t.tier === "diamante")?.bonusReais ?? 700}
                        onChange={(e) => updatePhoneTierField("diamante", "bonusReais", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Comissão Extra (%)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={editPhoneTiers.find((t) => t.tier === "diamante")?.extraCommissionPct ?? 1.0}
                        onChange={(e) => updatePhoneTierField("diamante", "extraCommissionPct", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SEÇÃO 2: TRILHA ACESSÓRIOS */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border/60 pb-1.5">
                  <Headphones className="h-4 w-4 text-primary" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Trilha de Acessórios (Faturamento Mínimo e Bônus)
                  </h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Prata Acessórios */}
                  <div className="p-3 rounded-xl border border-slate-400/40 bg-slate-500/5 space-y-2.5">
                    <span className="text-xs font-bold text-foreground">🥈 Prata (Acessórios)</span>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Faturamento Mínimo (R$)</Label>
                      <Input
                        type="number"
                        step="100"
                        value={Math.floor(editAccessoryTiers.find((t) => t.tier === "prata")?.minAmount || 2500)}
                        onChange={(e) => updateAccessoryTierField("prata", "minAmount", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Bônus Fixo (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editAccessoryTiers.find((t) => t.tier === "prata")?.bonusReais ?? 100}
                        onChange={(e) => updateAccessoryTierField("prata", "bonusReais", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>

                  {/* Ouro Acessórios */}
                  <div className="p-3 rounded-xl border border-yellow-500/40 bg-yellow-500/5 space-y-2.5">
                    <span className="text-xs font-bold text-foreground">🥇 Ouro (Acessórios)</span>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Faturamento Mínimo (R$)</Label>
                      <Input
                        type="number"
                        step="100"
                        value={Math.floor(editAccessoryTiers.find((t) => t.tier === "ouro")?.minAmount || 5000)}
                        onChange={(e) => updateAccessoryTierField("ouro", "minAmount", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Bônus Fixo (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editAccessoryTiers.find((t) => t.tier === "ouro")?.bonusReais ?? 250}
                        onChange={(e) => updateAccessoryTierField("ouro", "bonusReais", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>

                  {/* Diamante Acessórios */}
                  <div className="p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/5 space-y-2.5">
                    <span className="text-xs font-bold text-foreground">💎 Diamante (Acessórios)</span>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Faturamento Mínimo (R$)</Label>
                      <Input
                        type="number"
                        step="100"
                        value={Math.floor(editAccessoryTiers.find((t) => t.tier === "diamante")?.minAmount || 8000)}
                        onChange={(e) => updateAccessoryTierField("diamante", "minAmount", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] text-muted-foreground">Bônus Fixo (R$)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={editAccessoryTiers.find((t) => t.tier === "diamante")?.bonusReais ?? 500}
                        onChange={(e) => updateAccessoryTierField("diamante", "bonusReais", Number(e.target.value))}
                        className="h-8 text-xs bg-background"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Premiação do Técnico Top 1 (Bancada) */}
              <div className="space-y-3 pt-2 border-t border-border/40">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-amber-500" />
                  <h4 className="text-xs font-bold text-foreground">
                    Premiação do Técnico Top 1 do Mês (Bancada & Reparos)
                  </h4>
                </div>
                <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2">
                  <Label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    Porcentagem Extra de Comissão para o 1º Lugar
                  </Label>
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    O técnico que entregar o maior volume de OSs no mês ganha esta porcentagem adicional sobre todo o lucro de mão de obra gerado no período.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="20"
                      value={editTechAwardPct}
                      onChange={(e) => setEditTechAwardPct(Number(e.target.value))}
                      className="h-8 w-28 text-xs font-bold bg-background"
                    />
                    <span className="text-xs font-bold text-amber-500">% extra de comissão sobre todos os reparos</span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/60">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleResetAdminConfig}
                  className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar Padrões de Fábrica
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setAdminConfigOpen(false)}
                    className="text-xs"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSaveAdminConfig}
                    className="text-xs font-semibold gap-1.5 bg-primary text-primary-foreground shadow-sm"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Salvar Alterações
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
