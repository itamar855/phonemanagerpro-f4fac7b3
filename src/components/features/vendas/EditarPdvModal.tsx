import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Zap, Banknote, CreditCard, QrCode, CalendarDays } from "lucide-react";

interface EditarPdvModalProps {
  editPdvSale: any | null;
  setEditPdvSale: (sale: any | null) => void;
  handleSavePdvEdit: (e: React.FormEvent) => Promise<void>;
  editPdvForm: {
    description: string;
    amount: string;
    payment_cash: string;
    payment_card: string;
    payment_pix: string;
    retro_date: string;
  };
  setEditPdvForm: React.Dispatch<
    React.SetStateAction<{
      description: string;
      amount: string;
      payment_cash: string;
      payment_card: string;
      payment_pix: string;
      retro_date: string;
    }>
  >;
  loading: boolean;
  formatCurrency: (v: number) => string;
}

export const EditarPdvModal: React.FC<EditarPdvModalProps> = ({
  editPdvSale,
  setEditPdvSale,
  handleSavePdvEdit,
  editPdvForm,
  setEditPdvForm,
  loading,
  formatCurrency,
}) => {
  return (
    <Dialog open={!!editPdvSale} onOpenChange={(open) => { if (!open) setEditPdvSale(null); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-yellow-500">
            <Zap className="h-4 w-4" /> Editar Venda PDV
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSavePdvEdit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Descrição</Label>
            <Input
              value={editPdvForm.description}
              onChange={(e) => setEditPdvForm({ ...editPdvForm, description: e.target.value })}
              placeholder="Ex: PDV: 2x Capinha..."
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Valor Total (R$)</Label>
            <Input
              type="number"
              step="0.01"
              value={editPdvForm.amount}
              onChange={(e) => setEditPdvForm({ ...editPdvForm, amount: e.target.value })}
              placeholder="0.00"
              required
              className="h-10 font-medium"
            />
          </div>

          <div className="border-t border-border/60 pt-3">
            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
              Formas de Pagamento
            </span>
            <div className="grid grid-cols-3 gap-3 mt-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Banknote className="h-3 w-3" /> Dinheiro
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editPdvForm.payment_cash}
                  onChange={(e) => setEditPdvForm({ ...editPdvForm, payment_cash: e.target.value })}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> Cartão
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editPdvForm.payment_card}
                  onChange={(e) => setEditPdvForm({ ...editPdvForm, payment_card: e.target.value })}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <QrCode className="h-3 w-3" /> PIX
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editPdvForm.payment_pix}
                  onChange={(e) => setEditPdvForm({ ...editPdvForm, payment_pix: e.target.value })}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {(() => {
            const _net = parseFloat(editPdvForm.amount) || 0;
            const _cash = parseFloat(editPdvForm.payment_cash) || 0;
            const _card = parseFloat(editPdvForm.payment_card) || 0;
            const _pix = parseFloat(editPdvForm.payment_pix) || 0;
            const _rem = _net - (_cash + _card + _pix);
            return (
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor Total</span>
                  <span className="font-semibold">{formatCurrency(_net)}</span>
                </div>
                <div className="border-t border-border pt-1 flex justify-between">
                  <span className="font-medium">Restante a informar</span>
                  <span
                    className={`font-bold ${
                      Math.abs(_rem) < 0.01 ? "text-primary" : "text-destructive"
                    }`}
                  >
                    {formatCurrency(_rem)}
                  </span>
                </div>
              </div>
            );
          })()}

          <div className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/5 space-y-1.5">
            <Label className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Data da Venda (Retroativa)
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Altere a data caso o lançamento precise ser corrigido.
            </p>
            <Input
              type="date"
              value={editPdvForm.retro_date}
              onChange={(e) => setEditPdvForm({ ...editPdvForm, retro_date: e.target.value })}
              className="h-10 border-amber-500/30"
            />
          </div>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setEditPdvSale(null)}
            >
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
