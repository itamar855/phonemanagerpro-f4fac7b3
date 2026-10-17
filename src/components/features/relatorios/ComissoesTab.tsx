import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Star, DollarSign, History, Eye, Receipt, Download } from "lucide-react";
import { formatCurrency, formatPct, exportComissoesPDF, exportCSV } from "./relatorioPdf";
import { RankBadge, PeriodSelect, ExportBtns } from "./types";
import { CommissionPayoutModal } from "./CommissionPayoutModal";
import {
  fetchSettlementItems,
  generateSettlementReceiptPDF,
  type CommissionSettlement,
  type CommissionSettlementItem,
} from "@/utils/commissionSettlement";
import { openComprovante } from "@/lib/storageHelper";

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
                  {settlementsHistory.map((s, idx) => (
                    <tr key={s.id || idx} className="border-b border-border/30 hover:bg-muted/30">
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
                      <td className="py-2 px-2 font-mono font-bold text-emerald-500 whitespace-nowrap">
                        {formatCurrency(Number(s.total_amount))}
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
                            title="Ver itens deste pagamento"
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
                                toast.success("Segunda via do recibo baixada!");
                              } catch {
                                toast.error("Erro ao gerar 2ª via do recibo");
                              }
                            }}
                          >
                            <Download className="h-3 w-3" /> 2ª Via PDF
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
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
          <DialogHeader>
            <DialogTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2">
                <History className="h-4 w-4 text-primary" />
                Detalhes da Liquidação — {viewingSettlement ? profileMap.get(viewingSettlement.user_id) : ""}
              </span>
              {viewingSettlement && (
                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/30">
                  Total: {formatCurrency(Number(viewingSettlement.total_amount))}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {viewingSettlement && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
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
                  <span>Operações Quitadas ({viewingItems.length})</span>
                  {loadingItems && <span className="text-[10px] animate-pulse">Carregando itens...</span>}
                </p>
                <div className="rounded-lg border border-border/50 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-muted-foreground border-b border-border/50">
                      <tr>
                        <th className="py-2 px-3 text-left">Tipo</th>
                        <th className="py-2 px-3 text-left">Referência</th>
                        <th className="py-2 px-3 text-right">Faturado</th>
                        <th className="py-2 px-3 text-right">Custo / Peças</th>
                        <th className="py-2 px-3 text-right">Lucro Bruto</th>
                        <th className="py-2 px-3 text-right">% Com.</th>
                        <th className="py-2 px-3 text-right">Comissão</th>
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
                        viewingItems.map((it) => (
                          <tr key={it.id} className="border-b border-border/30 hover:bg-muted/20">
                            <td className="py-2 px-3 font-medium">
                              <Badge variant="outline" className="text-[10px]">
                                {it.item_type === "sale" ? "Venda" : "OS"}
                              </Badge>
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px]">
                              {it.sale_id ? `Venda #${it.sale_id.slice(0, 8)}` : `OS #${it.service_order_id?.slice(0, 8)}`}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">{formatCurrency(Number(it.gross_amount))}</td>
                            <td className="py-2 px-3 text-right font-mono text-muted-foreground">
                              {it.cost_amount !== null ? formatCurrency(Number(it.cost_amount)) : "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-500">
                              {it.profit_amount !== null ? formatCurrency(Number(it.profit_amount)) : "—"}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">{it.commission_percent}%</td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                              {formatCurrency(Number(it.commission_amount))}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {viewingItems.length > 0 && (
                      <tfoot className="bg-muted/40 font-semibold border-t border-border">
                        <tr>
                          <td colSpan={6} className="py-2 px-3 text-right uppercase text-[10px] text-muted-foreground">
                            Total da Liquidação:
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-500">
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
    </div>
  );
};
