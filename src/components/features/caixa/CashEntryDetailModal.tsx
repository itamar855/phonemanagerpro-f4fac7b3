import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Receipt, CreditCard, Clock, Wrench, Phone, Eye, ArrowUpRight,
  Truck, Store, User, Smartphone, Package, ExternalLink, RefreshCw, DollarSign
} from "lucide-react";
import {
  CashEntry, CashRegister, formatCurrency, getMistoLabel,
  paymentLabels, statusConfig
} from "./types";
import { openComprovante } from "@/lib/storageHelper";

interface CashEntryDetailModalProps {
  entryDetailDialog: boolean;
  setEntryDetailDialog: (open: boolean) => void;
  selectedEntry: CashEntry | null;
  setSelectedEntry: (entry: CashEntry | null) => void;
  linkedServiceOrder: any | null;
  linkedOrderItems?: any[];
  loadingLinkedOrder: boolean;

  confirmFile: File | null;
  setConfirmFile: (file: File | null) => void;
  confirmOrderFile: File | null;
  setConfirmOrderFile: (file: File | null) => void;
  handleConfirmEntry: (fromDetailModal: boolean) => Promise<void>;
  loading: boolean;

  handleOpenFullOs: (order: any) => void;

  // Visualização de OS
  osModalOpen: boolean;
  setOsModalOpen: (open: boolean) => void;
  osModalOrder: any | null;
  osModalItems: any[];
  loadingOsItems: boolean;
  storeList: { id: string; name: string }[];
  currentRegister: CashRegister | null;
  navigate: (path: string) => void;
}

export const CashEntryDetailModal: React.FC<CashEntryDetailModalProps> = ({
  entryDetailDialog,
  setEntryDetailDialog,
  selectedEntry,
  setSelectedEntry,
  linkedServiceOrder,
  linkedOrderItems = [],
  loadingLinkedOrder,

  confirmFile,
  setConfirmFile,
  confirmOrderFile,
  setConfirmOrderFile,
  handleConfirmEntry,
  loading,

  handleOpenFullOs,

  osModalOpen,
  setOsModalOpen,
  osModalOrder,
  osModalItems,
  loadingOsItems,
  storeList,
  currentRegister,
  navigate,
}) => {
  return (
    <>
      {/* Dialog de Detalhes do Lançamento Individual */}
      <Dialog
        open={entryDetailDialog}
        onOpenChange={(open) => {
          setEntryDetailDialog(open);
          if (!open) setSelectedEntry(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" /> Detalhes do Lançamento
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4 py-2">
              {/* Info principal */}
              <div className="bg-muted/30 rounded-lg p-3 space-y-2 border border-border/50">
                <p className="font-semibold text-sm leading-snug">
                  {(selectedEntry.description || "").replace(/\s*\[MISTO:\{.*?\}\]/, "")}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {selectedEntry.payment_method === "misto"
                      ? getMistoLabel(selectedEntry.description)
                      : paymentLabels[selectedEntry.payment_method || ""] || "Outro"}
                  </span>
                  <span
                    className={`font-bold text-sm ${
                      ["entrada", "abertura"].includes(selectedEntry.type) ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {["entrada", "abertura"].includes(selectedEntry.type) ? "+" : "-"}
                    {formatCurrency(Number(selectedEntry.amount))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{new Date(selectedEntry.created_at).toLocaleString("pt-BR")}</span>
                  {selectedEntry.confirmed ? (
                    <Badge className="text-[10px] bg-primary/20 text-primary border-primary/30">✓ Confirmado</Badge>
                  ) : (
                    <Badge className="text-[10px] bg-orange-500/20 text-orange-600">⏳ Pendente</Badge>
                  )}
                </div>
              </div>

              {/* Informações da Ordem de Serviço / Serviço Vinculado */}
              {loadingLinkedOrder && (
                <div className="p-3 bg-muted/20 border border-border/40 rounded-lg text-center text-xs text-muted-foreground animate-pulse flex items-center justify-center gap-2">
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Buscando detalhes do serviço vinculado...
                </div>
              )}

              {linkedServiceOrder && !loadingLinkedOrder && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-primary flex items-center gap-1.5 uppercase tracking-wide">
                      <Wrench className="h-3.5 w-3.5" /> Serviço Vinculado (OS #{linkedServiceOrder.order_number})
                    </span>
                    {linkedServiceOrder.status && (
                      <Badge
                        className={`text-[10px] px-2 py-0.5 border ${
                          statusConfig[linkedServiceOrder.status]?.color || "bg-muted text-muted-foreground"
                        }`}
                      >
                        {statusConfig[linkedServiceOrder.status]?.label || linkedServiceOrder.status}
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-primary/10">
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Cliente</span>
                      <p className="font-medium text-foreground">{linkedServiceOrder.customer_name || "—"}</p>
                      {linkedServiceOrder.customer_phone && (
                        <a
                          href={`https://wa.me/55${linkedServiceOrder.customer_phone.replace(/\D/g, "")}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 mt-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Phone className="h-3 w-3" /> {linkedServiceOrder.customer_phone}
                        </a>
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-muted-foreground uppercase font-semibold block">Aparelho</span>
                      <p className="font-medium text-foreground">
                        {linkedServiceOrder.device_brand} {linkedServiceOrder.device_model}
                      </p>
                      {linkedServiceOrder.device_color && (
                        <span className="text-[10px] text-muted-foreground block">
                          Cor: {linkedServiceOrder.device_color}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs pt-1 border-t border-primary/10 space-y-0.5">
                    {linkedServiceOrder.reported_defect && (
                      <p>
                        <span className="text-muted-foreground text-[11px]">Defeito:</span>{" "}
                        <span className="font-medium text-foreground">{linkedServiceOrder.reported_defect}</span>
                      </p>
                    )}
                    {linkedServiceOrder.requested_service && (
                      <p>
                        <span className="text-muted-foreground text-[11px]">Serviço:</span>{" "}
                        <span className="font-medium text-foreground">{linkedServiceOrder.requested_service}</span>
                      </p>
                    )}
                  </div>

                  {/* Detalhamento do Pagamento do Serviço */}
                  <div className="pt-2 border-t border-primary/10 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide flex items-center gap-1">
                        <DollarSign className="h-3 w-3 text-primary" /> Como o Serviço Foi Pago
                      </span>
                      {((Number(linkedServiceOrder.payment_cash) > 0 ? 1 : 0) +
                        (Number(linkedServiceOrder.payment_card) > 0 ? 1 : 0) +
                        (Number(linkedServiceOrder.payment_pix) > 0 ? 1 : 0) +
                        (Number(linkedServiceOrder.payment_other) > 0 ? 1 : 0)) > 1 && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/30 font-semibold">
                          Pagamento Misto / Dividido
                        </Badge>
                      )}
                    </div>

                    <div className="bg-background/90 rounded-md p-2 space-y-1 border border-border/40 text-[11px]">
                      <div className="flex justify-between items-center font-bold text-foreground pb-1 border-b border-border/40">
                        <span>Valor Total do Serviço:</span>
                        <span className="text-primary font-mono text-xs">
                          {formatCurrency(Number(linkedServiceOrder.final_price || linkedServiceOrder.estimated_price || 0))}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 pt-1 text-muted-foreground">
                        {Number(linkedServiceOrder.payment_cash) > 0 && (
                          <div className="flex justify-between">
                            <span>💵 Dinheiro:</span>
                            <span className="font-semibold text-foreground">{formatCurrency(Number(linkedServiceOrder.payment_cash))}</span>
                          </div>
                        )}
                        {Number(linkedServiceOrder.payment_card) > 0 && (
                          <div className="flex justify-between">
                            <span>💳 Cartão:</span>
                            <span className="font-semibold text-foreground">{formatCurrency(Number(linkedServiceOrder.payment_card))}</span>
                          </div>
                        )}
                        {Number(linkedServiceOrder.payment_pix) > 0 && (
                          <div className="flex justify-between">
                            <span>⚡ PIX:</span>
                            <span className="font-semibold text-foreground">{formatCurrency(Number(linkedServiceOrder.payment_pix))}</span>
                          </div>
                        )}
                        {Number(linkedServiceOrder.payment_other) > 0 && (
                          <div className="flex justify-between">
                            <span>🔄 Outro:</span>
                            <span className="font-semibold text-foreground">{formatCurrency(Number(linkedServiceOrder.payment_other))}</span>
                          </div>
                        )}
                      </div>

                      {linkedServiceOrder.payment_notes && (
                        <p className="text-[10px] text-muted-foreground italic pt-1 border-t border-border/30">
                          Obs: {linkedServiceOrder.payment_notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Peças Utilizadas e Comprovantes de Peça / Pedido */}
                  {linkedOrderItems && linkedOrderItems.length > 0 && (
                    <div className="pt-2 border-t border-primary/10 space-y-2 text-xs">
                      <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wide flex items-center gap-1">
                        <Package className="h-3 w-3 text-primary" /> Peças Utilizadas ({linkedOrderItems.length})
                      </span>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {linkedOrderItems.map((item: any) => {
                          const partReceipt = item.receipt_url || item.products?.parts_payment_voucher;
                          const orderReceipt = item.supplier_order_receipt_url;
                          return (
                            <div key={item.id} className="p-2 rounded-md bg-background/90 border border-border/40 space-y-1.5">
                              <div className="flex justify-between items-start gap-1">
                                <div>
                                  <p className="font-semibold text-foreground text-[11px] leading-tight">
                                    {item.products?.name || "Peça"} {item.products?.brand || ""} {item.products?.model || ""}
                                  </p>
                                  {item.supplier_name && (
                                    <p className="text-[10px] text-blue-500 font-medium">
                                      🏭 Fornecedor: {item.supplier_name}
                                    </p>
                                  )}
                                </div>
                                <div className="text-right shrink-0 text-[10px]">
                                  <span className="text-muted-foreground">Custo: </span>
                                  <span className="font-semibold text-foreground">{formatCurrency(Number(item.unit_cost || 0))}</span>
                                </div>
                              </div>

                              {/* Comprovantes da peça */}
                              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/30">
                                {partReceipt ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] gap-1 bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 font-medium"
                                    onClick={(e) => openComprovante(partReceipt, e)}
                                  >
                                    <CreditCard className="h-2.5 w-2.5" /> Comprovante da Peça
                                    <ArrowUpRight className="h-2.5 w-2.5" />
                                  </Button>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/70 italic">Sem comprovante da peça</span>
                                )}
                                {orderReceipt && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 text-[10px] gap-1 bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20 font-medium"
                                    onClick={(e) => openComprovante(orderReceipt, e)}
                                  >
                                    <Truck className="h-2.5 w-2.5" /> Comprovante Pedido Fornecedor
                                    <ArrowUpRight className="h-2.5 w-2.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full text-xs gap-1.5 border-primary/40 hover:bg-primary/10 text-primary font-semibold mt-1"
                    onClick={() => handleOpenFullOs(linkedServiceOrder)}
                  >
                    <Eye className="h-3.5 w-3.5" /> Abrir Ordem de Serviço #{linkedServiceOrder.order_number}
                  </Button>
                </div>
              )}

              {/* Comprovantes existentes consolidados */}
              {(selectedEntry.receipt_url ||
                linkedServiceOrder?.receipt_url ||
                (selectedEntry as any).supplier_order_receipt_url ||
                (linkedOrderItems && linkedOrderItems.some((it: any) => it.receipt_url || it.supplier_order_receipt_url || it.products?.parts_payment_voucher))) && (
                <div className="space-y-2 pt-1 border-t border-border/40">
                  <p className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wide flex items-center gap-1">
                    <Receipt className="h-3 w-3 text-primary" /> Comprovantes Anexados
                  </p>

                  <div className="space-y-1.5">
                    {/* Comprovante de Pagamento do Serviço */}
                    {(selectedEntry.receipt_url || linkedServiceOrder?.receipt_url) && (
                      <button
                        type="button"
                        onClick={(e) => openComprovante(selectedEntry.receipt_url || linkedServiceOrder?.receipt_url, e)}
                        className="w-full flex items-center justify-between text-xs text-primary font-semibold bg-primary/10 border border-primary/30 px-3 py-2 rounded-lg hover:bg-primary/20 transition-all cursor-pointer text-left"
                      >
                        <span className="flex items-center gap-2">
                          <CreditCard className="h-3.5 w-3.5 shrink-0" />
                          Comprovante de Pagamento do Serviço
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-primary" />
                      </button>
                    )}

                    {/* Comprovante do Pedido ao Fornecedor do Lançamento */}
                    {(selectedEntry as any).supplier_order_receipt_url && (
                      <button
                        type="button"
                        onClick={(e) => openComprovante((selectedEntry as any).supplier_order_receipt_url, e)}
                        className="w-full flex items-center justify-between text-xs text-blue-500 font-semibold bg-blue-500/10 border border-blue-500/30 px-3 py-2 rounded-lg hover:bg-blue-500/20 transition-all cursor-pointer text-left"
                      >
                        <span className="flex items-center gap-2">
                          <Truck className="h-3.5 w-3.5 shrink-0" />
                          Comprovante do Pedido (Fornecedor)
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-blue-500" />
                      </button>
                    )}

                    {/* Comprovantes de cada peça vinculada */}
                    {linkedOrderItems && linkedOrderItems.map((item: any, idx: number) => {
                      const partReceipt = item.receipt_url || item.products?.parts_payment_voucher;
                      const orderReceipt = item.supplier_order_receipt_url;
                      if (!partReceipt && !orderReceipt) return null;
                      return (
                        <div key={item.id || idx} className="space-y-1 pt-0.5">
                          {partReceipt && (
                            <button
                              type="button"
                              onClick={(e) => openComprovante(partReceipt, e)}
                              className="w-full flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg hover:bg-emerald-500/20 transition-all cursor-pointer text-left"
                            >
                              <span className="flex items-center gap-2 truncate">
                                <CreditCard className="h-3 w-3 shrink-0" />
                                Comprovante Peça: {item.products?.name || "Peça"} {item.supplier_name ? `(${item.supplier_name})` : ""}
                              </span>
                              <ArrowUpRight className="h-3 w-3 shrink-0" />
                            </button>
                          )}
                          {orderReceipt && (
                            <button
                              type="button"
                              onClick={(e) => openComprovante(orderReceipt, e)}
                              className="w-full flex items-center justify-between text-xs text-blue-500 font-medium bg-blue-500/10 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-all cursor-pointer text-left"
                            >
                              <span className="flex items-center gap-2 truncate">
                                <Truck className="h-3 w-3 shrink-0" />
                                Pedido Peça: {item.products?.name || "Peça"} {item.supplier_name ? `(${item.supplier_name})` : ""}
                              </span>
                              <ArrowUpRight className="h-3 w-3 shrink-0" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Seção de confirmação embutida — só para pendentes */}
              {!selectedEntry.confirmed && (
                <div className="space-y-3 border border-orange-500/30 bg-orange-500/5 rounded-lg p-3">
                  <p className="text-[10px] uppercase font-semibold text-orange-500 tracking-wide flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Confirmar este lançamento
                  </p>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <CreditCard className="h-3 w-3 text-primary" /> Comprovante de Pagamento{" "}
                      <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      className="h-8 text-xs"
                      onChange={(e) => setConfirmFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1 text-blue-500">
                      <Truck className="h-3 w-3" /> Comprovante do Pedido ao Fornecedor{" "}
                      <span className="text-muted-foreground">(opcional)</span>
                    </Label>
                    <Input
                      type="file"
                      accept="image/*,application/pdf"
                      className="h-8 text-xs"
                      onChange={(e) => setConfirmOrderFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  <Button
                    className="w-full h-8 text-xs"
                    onClick={() => handleConfirmEntry(true)}
                    disabled={loading || !confirmFile}
                  >
                    {loading ? "Confirmando..." : "Confirmar Lançamento"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Completo de Visualização da OS a partir do Caixa */}
      <Dialog open={osModalOpen} onOpenChange={setOsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2 pr-4">
              <span className="flex items-center gap-2">
                <Wrench className="h-5 w-5 text-primary" />
                Ordem de Serviço #{osModalOrder?.order_number}
              </span>
              {osModalOrder?.status && (
                <Badge
                  className={`text-xs px-2.5 py-0.5 border ${
                    statusConfig[osModalOrder.status]?.color || "bg-muted"
                  }`}
                >
                  {statusConfig[osModalOrder.status]?.label || osModalOrder.status}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>

          {osModalOrder && (
            <div className="space-y-4 py-1 text-xs">
              {/* Header com Loja e Datas */}
              <div className="flex items-center justify-between text-muted-foreground bg-muted/30 p-2.5 rounded-lg border border-border/40">
                <span className="flex items-center gap-1.5">
                  <Store className="h-3.5 w-3.5" />
                  {storeList.find((s) => s.id === osModalOrder.store_id)?.name ||
                    currentRegister?.stores?.name ||
                    "Loja"}
                </span>
                <span>Aberta em: {new Date(osModalOrder.created_at).toLocaleString("pt-BR")}</span>
              </div>

              {/* Cliente */}
              <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 border border-border/40">
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide flex items-center gap-1">
                  <User className="h-3 w-3" /> Dados do Cliente
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Nome</span>
                    <p className="font-medium text-sm text-foreground">{osModalOrder.customer_name || "—"}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Telefone</span>
                    {osModalOrder.customer_phone ? (
                      <a
                        href={`https://wa.me/55${osModalOrder.customer_phone.replace(/\D/g, "")}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-500 hover:underline flex items-center gap-1 font-medium text-sm"
                      >
                        <Phone className="h-3.5 w-3.5" /> {osModalOrder.customer_phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </div>
                  {osModalOrder.customer_cpf && (
                    <div>
                      <span className="text-muted-foreground block text-[11px]">CPF</span>
                      <p className="font-medium text-foreground">{osModalOrder.customer_cpf}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Aparelho */}
              <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 border border-border/40">
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide flex items-center gap-1">
                  <Smartphone className="h-3 w-3" /> Aparelho
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Marca / Modelo</span>
                    <p className="font-medium text-foreground">
                      {osModalOrder.device_brand} {osModalOrder.device_model}
                    </p>
                  </div>
                  {osModalOrder.device_color && (
                    <div>
                      <span className="text-muted-foreground block text-[11px]">Cor</span>
                      <p className="font-medium text-foreground">{osModalOrder.device_color}</p>
                    </div>
                  )}
                  {osModalOrder.device_imei && (
                    <div>
                      <span className="text-muted-foreground block text-[11px]">IMEI</span>
                      <p className="font-medium text-foreground">{osModalOrder.device_imei}</p>
                    </div>
                  )}
                  {osModalOrder.device_condition && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground block text-[11px]">Condição / Avarias</span>
                      <p className="font-medium text-foreground">{osModalOrder.device_condition}</p>
                    </div>
                  )}
                  {osModalOrder.device_accessories && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground block text-[11px]">Acessórios Deixados</span>
                      <p className="font-medium text-foreground">{osModalOrder.device_accessories}</p>
                    </div>
                  )}
                </div>
                {osModalOrder.device_is_off && (
                  <div className="mt-1 p-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded text-[11px] font-semibold">
                    ⚠️ Aparelho deu entrada desligado no estabelecimento
                  </div>
                )}
              </div>

              {/* Serviço & Diagnóstico */}
              <div className="rounded-lg bg-muted/40 p-3 space-y-1.5 border border-border/40">
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide flex items-center gap-1">
                  <Wrench className="h-3 w-3" /> Serviço & Valores
                </p>
                <div className="space-y-1 pt-1">
                  <p>
                    <span className="text-muted-foreground">Defeito Reclamado:</span>{" "}
                    <span className="font-medium text-foreground">{osModalOrder.reported_defect || "—"}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Serviço Solicitado:</span>{" "}
                    <span className="font-medium text-foreground">{osModalOrder.requested_service || "—"}</span>
                  </p>
                  {osModalOrder.internal_notes && (
                    <p>
                      <span className="text-muted-foreground">Notas Internas:</span>{" "}
                      <span className="font-medium text-foreground">{osModalOrder.internal_notes}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-4 pt-2 border-t border-border/30">
                    <div>
                      <span className="text-muted-foreground text-[11px] block">Valor Estimado</span>
                      <span className="font-semibold">
                        {formatCurrency(Number(osModalOrder.estimated_price || 0))}
                      </span>
                    </div>
                    {osModalOrder.final_price && (
                      <div>
                        <span className="text-muted-foreground text-[11px] block">Valor Final</span>
                        <span className="font-bold text-sm text-primary">
                          {formatCurrency(Number(osModalOrder.final_price))}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Peças e Comprovantes Utilizados nesta OS */}
              <div className="rounded-lg bg-muted/40 p-3 space-y-2 border border-border/40">
                <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide flex items-center gap-1">
                  <Package className="h-3 w-3" /> Peças Utilizadas nesta OS ({osModalItems.length})
                </p>
                {loadingOsItems ? (
                  <p className="text-muted-foreground py-2 text-center">Carregando peças...</p>
                ) : osModalItems.length === 0 ? (
                  <p className="text-muted-foreground py-1 text-center italic">
                    Nenhuma peça cadastrada para esta OS.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {osModalItems.map((item: any) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded border border-border/60 bg-background/50 space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground">
                            {item.products?.name || "Peça"}{" "}
                            {item.products?.brand ? `(${item.products.brand})` : ""}
                          </span>
                          <span className="font-bold text-destructive">
                            -{formatCurrency(Number(item.unit_cost || item.cost_price || 0))}
                          </span>
                        </div>
                        {item.supplier_name && (
                          <p className="text-muted-foreground text-[11px]">
                            Fornecedor: <span className="font-medium text-foreground">{item.supplier_name}</span>
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 pt-1">
                          {item.receipt_url && (
                            <a
                              href={item.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => openComprovante(item.receipt_url, e)}
                              className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium bg-primary/10 px-2 py-0.5 rounded cursor-pointer"
                            >
                              <CreditCard className="h-3 w-3" /> Comprovante de Pagamento ↗
                            </a>
                          )}
                          {item.supplier_order_receipt_url && (
                            <a
                              href={item.supplier_order_receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => openComprovante(item.supplier_order_receipt_url, e)}
                              className="text-[11px] text-blue-500 hover:underline flex items-center gap-1 font-medium bg-blue-500/10 px-2 py-0.5 rounded cursor-pointer"
                            >
                              <Truck className="h-3 w-3" /> Comprovante do Pedido (Fornecedor) ↗
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Botões de Ação no Rodapé */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setOsModalOpen(false);
                    navigate("/ordens-servico");
                  }}
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Ir para Tela de Ordens de Serviço
                </Button>
                <Button type="button" size="sm" onClick={() => setOsModalOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
