import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Star,
  DollarSign,
  History,
  Eye,
  Receipt,
  Download,
  RotateCcw,
  AlertTriangle,
  Ban,
} from "lucide-react";
import { formatCurrency, formatPct, exportComissoesPDF, exportCSV } from "./relatorioPdf";
import { RankBadge, PeriodSelect, ExportBtns } from "./types";
import { CommissionPayoutModal } from "./CommissionPayoutModal";
import {
  fetchSettlementItems,
  generateSettlementReceiptPDF,
  cancelCommissionSettlementRPC,
  formatBrasiliaDate,
  type CommissionSettlement,
  type CommissionSettlementItem,
} from "@/utils/commissionSettlement";
import { openComprovante } from "@/lib/storageHelper";
import { logAction } from "@/utils/auditLogger";

export interface ComissoesTabProps {
  rankPeriod: string;
  setRankPeriod: (v: string) => void;
  rankSpecificDay: string;
  setRankSpecificDay: (v: string) => void;
  isAdmin: boolean;
  canSettleCommissions: boolean;
  storeId: string;
  setStoreId: (v: string) => void;
  stores: any[];
  profiles: any[];
  comissoes: any[];
  settlementsHistory: CommissionSettlement[];
  profileMap: Map<string, string>;
  storeMap: Map<string, any>;
  currentRankPeriodLabel: string;
  currentStoreName: string;
  rawSalesForPayout: any[];
  rawOsForPayout: any[];
  osItemsForPayout: any[];
  roleMapForPayout: Map<string, any>;
  settledSaleIds: Set<string>;
  settledOsIds: Set<string>;
  user: any;
  fetchRanking: () => void;
}

export const ComissoesTab: React.FC<ComissoesTabProps> = ({
  rankPeriod,
  setRankPeriod,
  rankSpecificDay,
  setRankSpecificDay,
  isAdmin,
  canSettleCommissions,
  storeId,
  setStoreId,
  stores,
  profiles,
  comissoes,
  settlementsHistory,
  profileMap,
  storeMap,
  currentRankPeriodLabel,
  currentStoreName,
  rawSalesForPayout,
  rawOsForPayout,
  osItemsForPayout,
  roleMapForPayout,
  settledSaleIds,
  settledOsIds,
  user,
  fetchRanking,
}) => {
  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [payoutUserId, setPayoutUserId] = useState<string>("");
  const [viewingSettlement, setViewingSettlement] = useState<CommissionSettlement | null>(null);
  const [viewingItems, setViewingItems] = useState<CommissionSettlementItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const [cancellingSettlement, setCancellingSettlement] = useState<CommissionSettlement | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [origRegisterClosed, setOrigRegisterClosed] = useState(false);
  const [refundToOpenRegister, setRefundToOpenRegister] = useState(false);

  const handleOpenCancelModal = async (s: CommissionSettlement) => {
    setCancellingSettlement(s);
    setCancelReason("");
    setRefundToOpenRegister(false);
    setOrigRegisterClosed(false);

    if (s.payment_method === "dinheiro" && s.cash_register_id) {
      try {
        const { data } = await (supabase
          .from("cash_registers" as any)
          .select("status")
          .eq("id", s.cash_register_id)
          .maybeSingle() as any);
        if (data?.status === "closed") {
          setOrigRegisterClosed(true);
        }
      } catch {
        // fallback silencioso
      }
    }
  };

  const handleConfirmCancelSettlement = async () => {
    if (!cancellingSettlement) return;
    const cleanReason = cancelReason.trim();
    if (!cleanReason) {
      toast.warning("Informe o motivo da anulação para registro em auditoria.");
      return;
    }

    setIsCancelling(true);
    try {
      const res = await cancelCommissionSettlementRPC(
        cancellingSettlement.id,
        cleanReason,
        refundToOpenRegister
      );

      await logAction(
        "UPDATE_RECORD",
        "commission_settlements",
        cancellingSettlement.id,
        {
          status: "paid",
          total_amount: cancellingSettlement.total_amount,
          payment_method: cancellingSettlement.payment_method,
        },
        {
          status: "cancelled",
          cancel_reason: cleanReason,
          items_released: res.items_released,
          cash_reversal_mode: res.cash_reversal_mode,
        },
        cancellingSettlement.store_id
      );

      toast.success(
        `Liquidação anulada com sucesso! ${res.items_released} ${
          res.items_released === 1 ? "operação retornou" : "operações retornaram"
        } para Pendente e a despesa financeira foi estornada.`
      );
      setCancellingSettlement(null);
      setCancelReason("");
      fetchRanking();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao anular liquidação de comissão.");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Filter and Actions */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Periodo</Label>
            <PeriodSelect value={rankPeriod} onChange={setRankPeriod} includeCustom={false} />
          </div>
          {rankPeriod === "day" && (
            <div className="space-y-1">
              <Label className="text-xs">Dia</Label>
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
              <Label className="text-xs">Loja</Label>
              <Select value={storeId} onValueChange={setStoreId}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
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
        <div className="flex items-center gap-2">
          {canSettleCommissions && (
            <Button
              size="sm"
              className="gap-1.5 h-9 text-xs bg-primary text-primary-foreground font-semibold shadow-sm hover:bg-primary/90"
              onClick={() => setPayoutModalOpen(true)}
            >
              <DollarSign className="h-3.5 w-3.5" /> Liquidar Comissões
            </Button>
          )}
          <ExportBtns
            onCSV={() =>
              exportCSV(
                comissoes.map((c, i) => ({
                  posicao: i + 1,
                  vendedor: c.nome,
                  vendas: c.qtdVendas,
                  total_vendido: formatCurrency(c.totalVendas),
                  lucro: formatCurrency(c.lucro),
                  comissao: formatCurrency(c.comissoes),
                })),
                "comissoes.csv"
              )
            }
            onPDF={() => exportComissoesPDF(comissoes, currentRankPeriodLabel, currentStoreName)}
          />
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pendente a Pagar</p>
            <p className="font-display text-xl font-bold mt-1 text-yellow-500">
              {formatCurrency(comissoes.reduce((s, c) => s + (c.comissoesPendentes ?? c.comissoes), 0))}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Já Liquidado no Período</p>
            <p className="font-display text-xl font-bold mt-1 text-emerald-500">
              {formatCurrency(comissoes.reduce((s, c) => s + (c.comissoesLiquidadas ?? 0), 0))}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Colaboradores c/ Comissão</p>
            <p className="font-display text-xl font-bold mt-1 text-foreground">{comissoes.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Listagem de Colaboradores */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500" /> Comissões por Colaborador
          </CardTitle>
        </CardHeader>
        <CardContent>
          {comissoes.length > 0 ? (
            <div className="space-y-3">
              {comissoes.map((v, i) => {
                const pctVal = v.totalVendas > 0 ? (v.comissoes / v.totalVendas) * 100 : 0;
                return (
                  <div key={v.uid} className="rounded-lg border border-border/50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RankBadge pos={i + 1} />
                        <p className="font-semibold">{v.nome}</p>
                        {v.role === "tecnico" ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-purple-500/10 text-purple-400 border-purple-500/30"
                          >
                            Técnico
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/30"
                          >
                            Vendedor
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {v.comissoesLiquidadas > 0 && (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-semibold text-[11px]"
                          >
                            Liquidado: {formatCurrency(v.comissoesLiquidadas)}
                          </Badge>
                        )}
                        <Badge className="bg-yellow-500/15 text-yellow-500 border-yellow-500/30 font-bold">
                          Pendente: {formatCurrency(v.comissoesPendentes ?? v.comissoes)}
                        </Badge>
                        {canSettleCommissions && (v.comissoesPendentes ?? v.comissoes) > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-[11px] font-semibold gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer shadow-xs"
                            onClick={() => {
                              setPayoutUserId(v.uid);
                              setPayoutModalOpen(true);
                            }}
                            title={`Liquidar comissões de ${v.nome}`}
                          >
                            <DollarSign className="h-3 w-3" /> Liquidar
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div className="rounded bg-muted/50 p-2 text-center">
                        <p className="text-muted-foreground">Volume</p>
                        <p className="font-bold">
                          {v.qtdVendas} v / {v.osEntregues} OS
                        </p>
                      </div>
                      <div className="rounded bg-muted/50 p-2 text-center">
                        <p className="text-muted-foreground">Faturado Total</p>
                        <p className="font-bold text-primary">{formatCurrency(v.totalVendas)}</p>
                      </div>
                      <div className="rounded bg-muted/50 p-2 text-center">
                        <p className="text-muted-foreground">Margem / Lucro</p>
                        <p className="font-bold text-emerald-500">{formatCurrency(v.lucro)}</p>
                      </div>
                    </div>

                    {(v.comissoesVendas > 0 || v.comissoesOS > 0) && (
                      <div className="flex flex-wrap items-center gap-3 pt-1 border-t border-border/40 text-[11px]">
                        <span className="text-muted-foreground">Detalhamento:</span>
                        {v.comissoesVendas > 0 && (
                          <span className="text-foreground">
                            Vendas: <strong className="text-primary">{formatCurrency(v.comissoesVendas)}</strong>
                          </span>
                        )}
                        {v.comissoesOS > 0 && (
                          <span className="text-foreground">
                            OS: <strong className="text-yellow-500">{formatCurrency(v.comissoesOS)}</strong>
                          </span>
                        )}
                      </div>
                    )}

                    <div>
                      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                        <span>Comissão / Faturado</span>
                        <span>{formatPct(pctVal)}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-yellow-500 transition-all"
                          style={{ width: `${Math.min(100, pctVal * 5)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">Nenhuma comissão no período</p>
          )}
        </CardContent>
      </Card>

      {/* Histórico de Liquidações Realizadas */}
      {settlementsHistory.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-primary" /> Histórico de Liquidações Realizadas ({settlementsHistory.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    {["Data da Baixa", "Colaborador", "Loja", "Método", "Valor Total", "Ações"].map((h) => (
                      <th key={h} className="text-left py-2 px-2 font-medium whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {settlementsHistory.map((s, idx) => {
                    const isCancelled = s.status === "cancelled";
                    return (
                      <tr
                        key={s.id || idx}
                        className={`border-b border-border/30 hover:bg-muted/30 ${
                          isCancelled ? "bg-destructive/5 opacity-80" : ""
                        }`}
                      >
                        <td className="py-2 px-2 whitespace-nowrap font-mono">
                          {new Date(s.paid_at || s.created_at).toLocaleDateString("pt-BR")}{" "}
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(s.paid_at || s.created_at).toLocaleTimeString("pt-BR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </td>
                        <td className="py-2 px-2 font-semibold text-foreground">
                          {profileMap.get(s.user_id) || "Colaborador"}
                        </td>
                        <td className="py-2 px-2 text-muted-foreground">
                          {storeMap.get(s.store_id)?.name || "Loja"}
                        </td>
                        <td className="py-2 px-2">
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {s.payment_method === "dinheiro" ? "💵 Dinheiro" : s.payment_method.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 font-mono whitespace-nowrap">
                          {isCancelled ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="line-through text-muted-foreground">
                                {formatCurrency(Number(s.total_amount))}
                              </span>
                              <Badge
                                variant="destructive"
                                className="text-[9px] py-0 h-4 gap-0.5 bg-red-500/15 text-red-500 border-red-500/30"
                              >
                                <Ban className="h-2.5 w-2.5" /> Anulada
                              </Badge>
                            </span>
                          ) : (
                            <span className="font-bold text-emerald-500">
                              {formatCurrency(Number(s.total_amount))}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                              onClick={async () => {
                                setViewingSettlement(s);
                                setLoadingItems(true);
                                try {
                                  const items = await fetchSettlementItems(s.id);
                                  setViewingItems(items);
                                } catch {
                                  toast.error("Erro ao carregar itens da liquidação");
                                } finally {
                                  setLoadingItems(false);
                                }
                              }}
                              title="Ver detalhes completos das OSs e vendas desta liquidação"
                            >
                              <Eye className="h-3 w-3" /> Detalhes
                            </Button>
                            {s.receipt_url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] gap-1 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-500/10 cursor-pointer"
                                onClick={(e) => openComprovante(s.receipt_url, e)}
                                title="Ver comprovante anexado"
                              >
                                <Receipt className="h-3 w-3" /> Comprovante
                              </Button>
                            )}
                            {!isCancelled && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] gap-1 text-primary hover:text-primary hover:bg-primary/10"
                                onClick={async () => {
                                  try {
                                    const items = await fetchSettlementItems(s.id);
                                    const sName = storeMap.get(s.store_id)?.name || "Cell Pro 360";
                                    const colName = profileMap.get(s.user_id) || "Colaborador";
                                    const manName = profileMap.get(s.created_by) || "Gestão Financeira";
                                    generateSettlementReceiptPDF({
                                      settlement: s,
                                      items,
                                      storeName: sName,
                                      collaboratorName: colName,
                                      managerName: manName,
                                    });
                                    toast.success("Segunda via do recibo detalhado baixada!");
                                  } catch {
                                    toast.error("Erro ao gerar 2ª via do recibo");
                                  }
                                }}
                              >
                                <Download className="h-3 w-3" /> 2ª Via PDF
                              </Button>
                            )}
                            {!isCancelled && canSettleCommissions && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-[11px] gap-1 text-destructive hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                                onClick={() => handleOpenCancelModal(s)}
                                title="Anular esta liquidação e estornar o lançamento financeiro"
                              >
                                <RotateCcw className="h-3 w-3" /> Anular
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal de Liquidação */}
      <CommissionPayoutModal
        open={payoutModalOpen}
        onOpenChange={(open) => {
          setPayoutModalOpen(open);
          if (!open) setPayoutUserId("");
        }}
        storeId={storeId}
        stores={stores}
        profiles={profiles}
        collaborators={comissoes}
        allSales={rawSalesForPayout}
        allServiceOrders={rawOsForPayout}
        osItems={osItemsForPayout}
        userRolesMap={roleMapForPayout}
        settledSaleIds={settledSaleIds}
        settledOsIds={settledOsIds}
        initialUserId={payoutUserId}
        currentUserName={profileMap.get(user?.id ?? "") || "Gestor"}
        onSuccess={() => fetchRanking()}
      />

      {/* Modal de Detalhes da Liquidação */}
      <Dialog
        open={!!viewingSettlement}
        onOpenChange={(open) => {
          if (!open) setViewingSettlement(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center justify-between gap-2 pr-4">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Detalhes da Liquidação — {viewingSettlement ? profileMap.get(viewingSettlement.user_id) : ""}
              </span>
              {viewingSettlement &&
                (viewingSettlement.status === "cancelled" ? (
                  <Badge variant="destructive" className="text-xs gap-1">
                    <Ban className="h-3 w-3" /> Anulada ({formatCurrency(Number(viewingSettlement.total_amount))})
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                    Total: {formatCurrency(Number(viewingSettlement.total_amount))}
                  </Badge>
                ))}
            </DialogTitle>
          </DialogHeader>

          {viewingSettlement && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {viewingSettlement.status === "cancelled" && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2 font-semibold text-destructive">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> Liquidação Anulada / Estornada
                    </span>
                    {viewingSettlement.cancelled_at && (
                      <span className="text-[11px] font-mono">
                        {new Date(viewingSettlement.cancelled_at).toLocaleString("pt-BR")}
                      </span>
                    )}
                  </div>
                  {viewingSettlement.cancel_reason && (
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Motivo:</strong> {viewingSettlement.cancel_reason}
                    </p>
                  )}
                  {viewingSettlement.cancelled_by && (
                    <p className="text-[11px] text-muted-foreground">
                      Anulada por: <strong>{profileMap.get(viewingSettlement.cancelled_by) || "Gestão"}</strong>
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-muted/40 p-3 rounded-lg border border-border/50">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Data do Pagamento</span>
                  <strong className="text-foreground">
                    {new Date(viewingSettlement.paid_at || viewingSettlement.created_at).toLocaleString("pt-BR")}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Período Apurado</span>
                  <strong className="text-foreground">
                    {new Date(viewingSettlement.period_start + "T12:00:00").toLocaleDateString("pt-BR")} a{" "}
                    {new Date(viewingSettlement.period_end + "T12:00:00").toLocaleDateString("pt-BR")}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Forma de Pagamento</span>
                  <strong className="text-foreground capitalize">
                    {viewingSettlement.payment_method === "dinheiro"
                      ? "💵 Dinheiro (Caixa)"
                      : viewingSettlement.payment_method.toUpperCase()}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase">Autorizado Por</span>
                  <strong className="text-foreground">
                    {profileMap.get(viewingSettlement.created_by) || "Gestão Financeira"}
                  </strong>
                </div>
              </div>

              {viewingSettlement.notes && (
                <div className="text-xs bg-muted/20 p-2.5 rounded border border-border/40 text-muted-foreground">
                  <strong>Observações:</strong> {viewingSettlement.notes}
                </div>
              )}

              <div>
                <p className="text-xs font-semibold mb-2 flex items-center justify-between text-muted-foreground uppercase tracking-wide">
                  <span>
                    {viewingSettlement.status === "cancelled"
                      ? `Operações que Comporam esta Baixa (${viewingItems.length})`
                      : `Operações Quitadas (${viewingItems.length})`}
                  </span>
                  {loadingItems && <span className="text-[10px] animate-pulse">Carregando detalhes...</span>}
                </p>
                <div className="rounded-lg border border-border/50 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground border-b border-border/50">
                      <tr>
                        <th className="py-2 px-3 text-left whitespace-nowrap">OS / Data</th>
                        <th className="py-2 px-3 text-left">Detalhes do Serviço / Venda</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Faturado</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Custo / Peças</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Lucro Bruto</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">% Com.</th>
                        <th className="py-2 px-3 text-right whitespace-nowrap">Comissão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewingItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-muted-foreground">
                            {loadingItems ? "Carregando demonstrativo..." : "Nenhum item encontrado."}
                          </td>
                        </tr>
                      ) : (
                        viewingItems.map((it) => {
                          const isSale = it.item_type === "sale";
                          const primaryRef = isSale
                            ? "Venda PDV"
                            : it.order_number != null
                            ? `OS #${it.order_number}`
                            : `OS #${(it.service_order_id || "").slice(0, 8)}`;
                          const opDate =
                            it.operation_date || it.created_at
                              ? formatBrasiliaDate(it.operation_date || it.created_at)
                              : "";
                          const mainTitle = isSale
                            ? it.device_name || `Venda #${(it.sale_id || "").slice(0, 8)}`
                            : [it.device_name, it.service_name].filter(Boolean).join(" — ") || "Ordem de Serviço";

                          return (
                            <tr key={it.id} className="border-b border-border/30 hover:bg-muted/20 align-top">
                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-mono ${
                                    isSale
                                      ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
                                      : "bg-purple-500/10 text-purple-400 border-purple-500/25"
                                  }`}
                                >
                                  {primaryRef}
                                </Badge>
                                {opDate && (
                                  <span className="block text-[10px] text-muted-foreground font-mono mt-1">
                                    {opDate}
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 min-w-[220px]">
                                <p className="font-semibold text-foreground leading-snug">{mainTitle}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  Cliente: <span className="text-foreground/90">{it.customer_name || "Não informado"}</span>
                                </p>
                                {it.parts_summary && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    Peças: <span>{it.parts_summary}</span>
                                  </p>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                                {formatCurrency(Number(it.gross_amount))}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-muted-foreground whitespace-nowrap">
                                {it.cost_amount !== null ? formatCurrency(Number(it.cost_amount)) : "—"}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono text-emerald-500 whitespace-nowrap">
                                {it.profit_amount !== null ? formatCurrency(Number(it.profit_amount)) : "—"}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono whitespace-nowrap">
                                {it.commission_percent}%
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground whitespace-nowrap">
                                {formatCurrency(Number(it.commission_amount))}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {viewingItems.length > 0 && (
                      <tfoot className="bg-muted/40 font-semibold border-t border-border">
                        <tr>
                          <td colSpan={6} className="py-2 px-3 text-right uppercase text-[10px] text-muted-foreground">
                            Total da Liquidação:
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-500 whitespace-nowrap">
                            {formatCurrency(Number(viewingSettlement.total_amount))}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Anulação / Estorno de Liquidação */}
      <Dialog
        open={!!cancellingSettlement}
        onOpenChange={(open) => {
          if (!open && !isCancelling) {
            setCancellingSettlement(null);
            setCancelReason("");
          }
        }}
      >
        <DialogContent className="max-w-md p-6">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center gap-2 text-destructive">
              <RotateCcw className="h-4 w-4" /> Anular Liquidação de Comissão
            </DialogTitle>
            <DialogDescription className="text-xs">
              Esta ação reverte o pagamento de forma atômica e auditável, devolvendo as operações para Pendente.
            </DialogDescription>
          </DialogHeader>

          {cancellingSettlement && (
            <div className="space-y-4 py-1">
              <div className="rounded-lg bg-muted/40 border border-border/50 p-3 text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Colaborador:</span>
                  <strong className="text-foreground">
                    {profileMap.get(cancellingSettlement.user_id) || "Colaborador"}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Período:</span>
                  <span className="font-mono">
                    {new Date(cancellingSettlement.period_start + "T12:00:00").toLocaleDateString("pt-BR")} a{" "}
                    {new Date(cancellingSettlement.period_end + "T12:00:00").toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Método:</span>
                  <span className="uppercase font-medium">{cancellingSettlement.payment_method}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-border/40">
                  <span className="text-muted-foreground font-semibold">Valor a Estornar:</span>
                  <strong className="font-mono text-emerald-500">
                    {formatCurrency(Number(cancellingSettlement.total_amount))}
                  </strong>
                </div>
              </div>

              <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2.5 text-[11px] text-muted-foreground space-y-1">
                <p className="font-semibold text-amber-600 dark:text-amber-400">O que acontecerá automaticamente:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  <li>Todas as OSs e vendas desta baixa voltarão para <strong>Pendente a Pagar</strong>;</li>
                  <li>A despesa gerada será excluída do <strong>DRE / Conta Bancária</strong>;</li>
                  <li>O histórico manterá o registro com selo <strong>Anulada</strong> para auditoria.</li>
                </ul>
              </div>

              {cancellingSettlement.payment_method === "dinheiro" && origRegisterClosed && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 flex items-start gap-2.5">
                  <Checkbox
                    id="refund-open-register"
                    checked={refundToOpenRegister}
                    onCheckedChange={(v) => setRefundToOpenRegister(Boolean(v))}
                    className="mt-0.5"
                  />
                  <label htmlFor="refund-open-register" className="text-xs leading-snug cursor-pointer">
                    <span className="font-semibold block text-foreground">
                      Devolver dinheiro físico na gaveta de hoje
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      O caixa original já foi encerrado e permanecerá intacto. Marque se o dinheiro físico foi devolvido à gaveta do caixa aberto atual.
                    </span>
                  </label>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">
                  Motivo da Anulação <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Ex: OS incluída por engano, valor/conta incorreta..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="h-9 text-xs"
                  autoFocus
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              disabled={isCancelling}
              onClick={() => setCancellingSettlement(null)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-9 text-xs gap-1.5 font-semibold"
              disabled={isCancelling || !cancelReason.trim()}
              onClick={handleConfirmCancelSettlement}
            >
              {isCancelling ? (
                "Anulando Liquidação..."
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" /> Confirmar Anulação e Estorno
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
