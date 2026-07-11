import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Search, Zap, FileText } from "lucide-react";

type Accessory = { id: string; store_id: string; name: string; category: string; brand: string | null; quantity: number; cost_price: number; sale_price: number | null };
type CartItem = { acc: Accessory; qty: number; price: number };

interface PdvFormModalProps {
  pdvOpen: boolean;
  setPdvOpen: (open: boolean) => void;
  resetPdv: () => void;
  activeStoreId: string | null;
  accSearch: string;
  setAccSearch: (search: string) => void;
  filteredAcc: Accessory[];
  addToCart: (acc: Accessory) => void;
  cart: CartItem[];
  updateCartQty: (id: string, qty: number) => void;
  updateCartPrice: (id: string, price: number) => void;
  pdvPayment: any;
  setPdvPayment: (payment: any) => void;
  stores: any[];
  handlePdvSubmit: (gerarNotinha: boolean, pdvCash: number, pdvCard: number, pdvPix: number, pdvTroco: number, cartTotal: number) => void;
  loading: boolean;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

export const PdvFormModal: React.FC<PdvFormModalProps> = ({
  pdvOpen,
  setPdvOpen,
  resetPdv,
  activeStoreId,
  accSearch,
  setAccSearch,
  filteredAcc,
  addToCart,
  cart,
  updateCartQty,
  updateCartPrice,
  pdvPayment,
  setPdvPayment,
  stores,
  handlePdvSubmit,
  loading
}) => {
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const pdvCash = parseFloat(pdvPayment.cash) || 0;
  const pdvCard = parseFloat(pdvPayment.card) || 0;
  const pdvPix = parseFloat(pdvPayment.pix) || 0;
  const pdvRemaining = cartTotal - pdvCash - pdvCard - pdvPix;
  const pdvTroco = pdvCash > cartTotal && pdvCard === 0 && pdvPix === 0 ? pdvCash - cartTotal : 0;

  return (
    <Dialog open={pdvOpen} onOpenChange={o => { setPdvOpen(o); if (!o) resetPdv(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2 h-10 border bg-transparent text-foreground hover:bg-muted" disabled={activeStoreId === "all"}>
          <Zap className="h-4 w-4 text-yellow-500" /> PDV Rápido
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" /> PDV — Venda Rápida</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input value={accSearch} onChange={e => setAccSearch(e.target.value)} placeholder="Buscar acessório..." className="pl-9 h-10" />
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredAcc.length > 0 ? filteredAcc.map(a => (
                <div key={a.id} className="flex items-center justify-between rounded-lg border border-border/50 p-3 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors" onClick={() => addToCart(a)}>
                  <div><p className="text-sm font-medium">{a.name}</p><p className="text-[10px] text-muted-foreground">{a.brand && `${a.brand} · `}Estoque: {a.quantity}</p></div>
                  <div className="text-right"><p className="text-sm font-bold text-primary">{formatCurrency(a.sale_price ?? a.cost_price)}</p><p className="text-[10px] text-muted-foreground">+ Adicionar</p></div>
                </div>
              )) : <p className="text-xs text-muted-foreground text-center py-8">Nenhum acessório disponível</p>}
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Carrinho</p>
            {cart.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground text-xs border border-dashed border-border rounded-lg">Clique nos produtos para adicionar</div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {cart.map(item => (
                  <div key={item.acc.id} className="rounded-lg border border-border/50 p-2.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate flex-1">{item.acc.name}</p>
                      <Button className="h-6 w-6 p-0 bg-transparent text-destructive hover:bg-destructive/10 border-0 shadow-none shrink-0" onClick={() => updateCartQty(item.acc.id, 0)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1">
                        <Button className="h-7 w-7 p-0 border bg-transparent text-foreground hover:bg-muted" onClick={() => updateCartQty(item.acc.id, item.qty - 1)}>-</Button>
                        <span className="text-sm font-bold w-6 text-center">{item.qty}</span>
                        <Button className="h-7 w-7 p-0 border bg-transparent text-foreground hover:bg-muted" onClick={() => updateCartQty(item.acc.id, item.qty + 1)}>+</Button>
                      </div>
                      <Input type="number" step="0.01" value={item.price} onChange={e => updateCartPrice(item.acc.id, parseFloat(e.target.value) || 0)} className="h-7 text-xs w-24" />
                      <span className="text-sm font-bold text-primary ml-auto">{formatCurrency(item.price * item.qty)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {cart.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex justify-between items-center"><span className="font-semibold">Total</span><span className="font-display font-bold text-lg text-primary">{formatCurrency(cartTotal)}</span></div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Loja</Label>
                  <Select value={pdvPayment.store_id} onValueChange={v => setPdvPayment({ ...pdvPayment, store_id: v })}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Cliente / Empresa (Opcional)</Label>
                    <Input value={pdvPayment.customer} onChange={e => setPdvPayment({ ...pdvPayment, customer: e.target.value })} placeholder="Nome do cliente/empresa" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CPF / CNPJ (Opcional)</Label>
                    <Input value={pdvPayment.cpfCnpj} onChange={e => setPdvPayment({ ...pdvPayment, cpfCnpj: e.target.value })} placeholder="000.000.000-00" className="h-9" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[["cash","Dinheiro"], ["card","Cartão"], ["pix","PIX"]].map(([k, l]) => (
                    <div key={k} className="space-y-1">
                      <Label className="text-[10px]">{l}</Label>
                      <Input type="number" step="0.01" value={(pdvPayment as any)[k]} onChange={e => setPdvPayment({ ...pdvPayment, [k]: e.target.value })} placeholder="0.00" className="h-9 text-xs" />
                    </div>
                  ))}
                </div>
                <div className={`flex justify-between text-sm font-bold rounded-lg p-2 ${Math.abs(pdvRemaining) < 0.01 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
                  <span>{pdvTroco > 0 ? "Troco" : "Restante"}</span>
                  <span>{formatCurrency(pdvTroco > 0 ? pdvTroco : pdvRemaining)}</span>
                </div>
                <div className="flex flex-col gap-2">
                  <Button className="w-full h-10 font-semibold" onClick={() => handlePdvSubmit(false, pdvCash, pdvCard, pdvPix, pdvTroco, cartTotal)} disabled={loading || (Math.abs(pdvRemaining) > 0.01 && pdvTroco === 0) || !activeStoreId}>
                    {loading ? "Registrando..." : `Finalizar — ${formatCurrency(cartTotal)}`}
                  </Button>
                  <Button variant="outline" className="w-full h-10 font-semibold border-primary/50 text-primary hover:bg-primary/5" onClick={() => handlePdvSubmit(true, pdvCash, pdvCard, pdvPix, pdvTroco, cartTotal)} disabled={loading || (Math.abs(pdvRemaining) > 0.01 && pdvTroco === 0) || !activeStoreId}>
                    <FileText className="h-4 w-4 mr-2" />
                    Finalizar e Gerar Notinha
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
