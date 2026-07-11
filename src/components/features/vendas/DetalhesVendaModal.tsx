import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Eye, Smartphone, Store, User as UserIcon, MapPin, Wallet, Banknote,
  CreditCard, QrCode, ArrowLeftRight, Percent, Shield, CalendarDays,
  StickyNote, FileText, MessageCircle
} from "lucide-react";

interface DetalhesVendaModalProps {
  selectedViewSale: any | null;
  setSelectedViewSale: (sale: any | null) => void;
  productMap: Map<string, any>;
  storeMap: Map<string, any>;
  profileMap: Map<string, any>;
  handleGerarNota: (sale: any, whats: boolean) => void;
  notaLoading: string | null;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const DetalhesVendaModal: React.FC<DetalhesVendaModalProps> = ({
  selectedViewSale,
  setSelectedViewSale,
  productMap,
  storeMap,
  profileMap,
  handleGerarNota,
  notaLoading
}) => {
  return (
    <Dialog open={!!selectedViewSale} onOpenChange={open => { if (!open) setSelectedViewSale(null); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        {selectedViewSale && (() => {
          const product = productMap.get(selectedViewSale.product_id) as any;
          const store = storeMap.get(selectedViewSale.store_id) as any;
          const sellerName = selectedViewSale.seller_id ? profileMap.get(selectedViewSale.seller_id) : null;
          const totalPaid = Number(selectedViewSale.payment_cash) + Number(selectedViewSale.payment_card) + Number(selectedViewSale.payment_pix) + (selectedViewSale.has_trade_in ? Number(selectedViewSale.trade_in_value) : 0);
          return (
            <>
              <DialogHeader>
                <DialogTitle className="font-display flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  Detalhes da Venda
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-1">

                {/* Produto */}
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
                  <p className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5"><Smartphone className="h-3.5 w-3.5" /> Aparelho</p>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-base">{product?.name || "—"}</p>
                      {product?.brand && <p className="text-xs text-muted-foreground">{product.brand}{product?.model ? ` · ${product.model}` : ""}</p>}
                      {product?.color && <p className="text-xs text-muted-foreground">Cor: {product.color}</p>}
                      {product?.storage && <p className="text-xs text-muted-foreground">Armazenamento: {product.storage}</p>}
                    </div>
                    {product?.imei && (
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground">IMEI</p>
                        <p className="font-mono text-xs bg-muted px-2 py-0.5 rounded border border-border">{product.imei}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Store className="h-3 w-3" /> {store?.name || "—"}
                  </p>
                </div>

                {/* Cliente */}
                {(selectedViewSale.customer_name || selectedViewSale.customer_phone || selectedViewSale.customer_cpf) && (
                  <div className="rounded-xl border border-border bg-card p-4 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><UserIcon className="h-3.5 w-3.5" /> Cliente</p>
                    {selectedViewSale.customer_name && <p className="font-semibold text-sm">{selectedViewSale.customer_name}</p>}
                    {selectedViewSale.customer_phone && <p className="text-xs text-muted-foreground">{selectedViewSale.customer_phone}</p>}
                    {selectedViewSale.customer_cpf && <p className="text-xs text-muted-foreground">CPF: {selectedViewSale.customer_cpf}</p>}
                    {selectedViewSale.customer_address && <p className="text-xs text-muted-foreground flex items-start gap-1"><MapPin className="h-3 w-3 mt-0.5 shrink-0" />{selectedViewSale.customer_address}</p>}
                  </div>
                )}

                {/* Valores */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><Wallet className="h-3.5 w-3.5" /> Financeiro</p>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Valor de venda</span>
                      <span className="font-bold text-primary">{formatCurrency(Number(selectedViewSale.sale_price))}</span>
                    </div>
                    {Number(selectedViewSale.discount) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Desconto</span>
                        <span className="text-yellow-500 font-semibold">-{formatCurrency(Number(selectedViewSale.discount))}</span>
                      </div>
                    )}
                    <div className="border-t border-border/50 pt-1.5 space-y-1">
                      {Number(selectedViewSale.payment_cash) > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground"><Banknote className="h-3 w-3" /> Dinheiro</span>
                          <span>{formatCurrency(Number(selectedViewSale.payment_cash))}</span>
                        </div>
                      )}
                      {Number(selectedViewSale.payment_card) > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground"><CreditCard className="h-3 w-3" /> Cartão{selectedViewSale.installments && selectedViewSale.installments > 1 ? ` (${selectedViewSale.installments}x)` : ""}</span>
                          <span>{formatCurrency(Number(selectedViewSale.payment_card))}</span>
                        </div>
                      )}
                      {Number(selectedViewSale.payment_pix) > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground"><QrCode className="h-3 w-3" /> PIX</span>
                          <span>{formatCurrency(Number(selectedViewSale.payment_pix))}</span>
                        </div>
                      )}
                      {selectedViewSale.has_trade_in && Number(selectedViewSale.trade_in_value) > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="flex items-center gap-1 text-muted-foreground"><ArrowLeftRight className="h-3 w-3" /> Troca</span>
                          <span>{formatCurrency(Number(selectedViewSale.trade_in_value))}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-between text-xs pt-1 border-t border-border/50">
                      <span className="font-medium">Total pago</span>
                      <span className="font-bold">{formatCurrency(totalPaid)}</span>
                    </div>
                    {Number(selectedViewSale.commission_value) > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="flex items-center gap-1 text-muted-foreground"><Percent className="h-3 w-3" /> Comissão</span>
                        <span className="text-yellow-500">{formatCurrency(Number(selectedViewSale.commission_value))}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Trade-in */}
                {selectedViewSale.has_trade_in && selectedViewSale.trade_in_device_name && (
                  <div className="rounded-xl border border-primary/20 bg-card p-4 space-y-1.5">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" /> Aparelho na Troca</p>
                    <p className="font-semibold text-sm">{selectedViewSale.trade_in_device_name}</p>
                    {selectedViewSale.trade_in_device_brand && <p className="text-xs text-muted-foreground">{selectedViewSale.trade_in_device_brand}{selectedViewSale.trade_in_device_model ? ` · ${selectedViewSale.trade_in_device_model}` : ""}</p>}
                    {selectedViewSale.trade_in_device_imei && <p className="font-mono text-xs bg-muted px-2 py-0.5 rounded border border-border w-fit">IMEI: {selectedViewSale.trade_in_device_imei}</p>}
                    <p className="text-xs font-semibold text-primary">Valor abatido: {formatCurrency(Number(selectedViewSale.trade_in_value))}</p>
                  </div>
                )}

                {/* Garantia + Info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border bg-card p-3 text-center">
                    <Shield className="h-4 w-4 text-blue-500 mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Garantia</p>
                    <p className="font-bold text-sm">{selectedViewSale.warranty_days || 90} dias</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 text-center">
                    <CalendarDays className="h-4 w-4 text-primary mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Data da venda</p>
                    <p className="font-bold text-sm">{new Date(selectedViewSale.created_at).toLocaleDateString("pt-BR")}</p>
                  </div>
                </div>

                {sellerName && (
                  <p className="text-xs text-muted-foreground text-center">Vendedor: <span className="font-semibold text-foreground">{sellerName}</span></p>
                )}

                {/* Observações */}
                {selectedViewSale.notes && (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-1.5"><StickyNote className="h-3.5 w-3.5" /> Observações</p>
                    <p className="text-sm text-muted-foreground">{selectedViewSale.notes}</p>
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 pt-1">
                  <Button
                    className="flex-1 h-9 text-xs gap-1.5 border border-border bg-transparent text-foreground hover:bg-muted"
                    onClick={() => handleGerarNota(selectedViewSale, false)}
                    disabled={notaLoading === selectedViewSale.id}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    {notaLoading === selectedViewSale.id ? "Gerando..." : "Baixar Comprovante"}
                  </Button>
                  {selectedViewSale.customer_phone && (
                    <Button
                      className="flex-1 h-9 text-xs gap-1.5 text-green-500 border border-green-500/30 bg-transparent hover:bg-green-500/10"
                      onClick={() => handleGerarNota(selectedViewSale, true)}
                      disabled={notaLoading === selectedViewSale.id}
                    >
                      <MessageCircle className="h-3.5 w-3.5" />WhatsApp
                    </Button>
                  )}
                </div>
              </div>
            </>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
};
