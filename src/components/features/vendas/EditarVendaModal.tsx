import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Pencil, UserPlus, Banknote, CreditCard, QrCode,
  Smartphone, Shield, CalendarDays
} from "lucide-react";
import { Sale, Customer } from "./types";

interface EditarVendaModalProps {
  editSale: Sale | null;
  setEditSale: (sale: Sale | null) => void;
  handleSaveEdit: (e: React.FormEvent) => Promise<void>;
  editForm: any;
  setEditForm: React.Dispatch<React.SetStateAction<any>>;
  editSaleCustomerId: string;
  setEditSaleCustomerId: (id: string) => void;
  showEditNewCustomerForm: boolean;
  setShowEditNewCustomerForm: (v: boolean | ((prev: boolean) => boolean)) => void;
  editNewCustomerForm: any;
  setEditNewCustomerForm: React.Dispatch<React.SetStateAction<any>>;
  handleCreateCustomerForEdit: () => Promise<void>;
  customers: Customer[];
  userRole?: string;
  loading: boolean;
  formatCurrency: (v: number) => string;
}

export const EditarVendaModal: React.FC<EditarVendaModalProps> = ({
  editSale,
  setEditSale,
  handleSaveEdit,
  editForm,
  setEditForm,
  editSaleCustomerId,
  setEditSaleCustomerId,
  showEditNewCustomerForm,
  setShowEditNewCustomerForm,
  editNewCustomerForm,
  setEditNewCustomerForm,
  handleCreateCustomerForEdit,
  customers,
  userRole,
  loading,
  formatCurrency,
}) => {
  return (
    <Dialog open={!!editSale} onOpenChange={(open) => { if (!open) setEditSale(null); }}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-primary">
            <Pencil className="h-5 w-5" /> Editar Lançamento de Venda
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSaveEdit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Cliente</Label>
              <Button
                type="button"
                variant="ghost"
                className="h-auto p-0 text-xs text-primary hover:bg-transparent hover:underline"
                onClick={() => setShowEditNewCustomerForm((v) => !v)}
              >
                <UserPlus className="h-3 w-3 mr-1" />
                {showEditNewCustomerForm ? "Cancelar cadastro" : "Cadastrar novo cliente"}
              </Button>
            </div>

            {!showEditNewCustomerForm ? (
              <Select
                value={editSaleCustomerId}
                onValueChange={(v) => {
                  setEditSaleCustomerId(v);
                  if (v !== "manual") {
                    const c = customers.find((x) => x.id === v);
                    if (c) setEditForm((prev: any) => ({ ...prev, customer_name: c.name }));
                  }
                }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione um cliente cadastrado..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">✍️ Digitar nome manualmente...</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.phone ? `(${c.phone})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                <p className="text-xs font-semibold text-primary">Novo Cliente (para esta venda)</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome *</Label>
                  <Input
                    value={editNewCustomerForm.name}
                    onChange={(e) => setEditNewCustomerForm((f: any) => ({ ...f, name: e.target.value }))}
                    placeholder="Nome completo"
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Telefone</Label>
                    <Input
                      value={editNewCustomerForm.phone}
                      onChange={(e) => setEditNewCustomerForm((f: any) => ({ ...f, phone: e.target.value }))}
                      placeholder="(87) 99999-9999"
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">CPF</Label>
                    <Input
                      value={editNewCustomerForm.cpf}
                      onChange={(e) => setEditNewCustomerForm((f: any) => ({ ...f, cpf: e.target.value }))}
                      placeholder="000.000.000-00"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Endereço</Label>
                  <Input
                    value={editNewCustomerForm.address}
                    onChange={(e) => setEditNewCustomerForm((f: any) => ({ ...f, address: e.target.value }))}
                    placeholder="Rua, número, bairro..."
                    className="h-9"
                  />
                </div>
                <Button
                  type="button"
                  className="w-full h-9"
                  onClick={handleCreateCustomerForEdit}
                  disabled={loading || !editNewCustomerForm.name}
                >
                  {loading ? "Salvando..." : "Salvar e Selecionar"}
                </Button>
              </div>
            )}
          </div>

          {!showEditNewCustomerForm && editSaleCustomerId === "manual" && (
            <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
              <Label className="text-xs font-semibold">Nome do Cliente (Manual/Novo)</Label>
              <Input
                value={editForm.customer_name}
                onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })}
                placeholder="Ex: Luana Yasmim"
                className="h-10"
              />
            </div>
          )}

          {/* Dados do Aparelho Vendido */}
          <div className="border border-border/80 rounded-xl p-3 bg-muted/20 space-y-3">
            <span className="text-xs font-bold text-foreground uppercase tracking-wide">
              Dados do Aparelho Vendido
            </span>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nome do Aparelho</Label>
              <Input
                value={editForm.product_name}
                onChange={(e) => setEditForm({ ...editForm, product_name: e.target.value })}
                placeholder="Ex: iPhone 11 64GB"
                className="h-10"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Custo do Aparelho (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.product_cost}
                  onChange={(e) => setEditForm({ ...editForm, product_cost: e.target.value })}
                  placeholder="0.00"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">IMEI do Aparelho</Label>
                <Input
                  value={editForm.product_imei}
                  onChange={(e) => setEditForm({ ...editForm, product_imei: e.target.value })}
                  placeholder="Sem IMEI / Opcional"
                  className="h-10 font-mono"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valor Bruto da Venda (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={editForm.sale_price}
                onChange={(e) => setEditForm({ ...editForm, sale_price: e.target.value })}
                placeholder="0.00"
                required
                className="h-10 font-medium text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Desconto (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={editForm.discount}
                onChange={(e) => setEditForm({ ...editForm, discount: e.target.value })}
                placeholder="0.00"
                className="h-10 text-yellow-500 font-semibold"
              />
            </div>
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
                  value={editForm.payment_cash}
                  onChange={(e) => setEditForm({ ...editForm, payment_cash: e.target.value })}
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
                  value={editForm.payment_card}
                  onChange={(e) => setEditForm({ ...editForm, payment_card: e.target.value })}
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
                  value={editForm.payment_pix}
                  onChange={(e) => setEditForm({ ...editForm, payment_pix: e.target.value })}
                  placeholder="0.00"
                  className="h-9"
                />
              </div>
            </div>
          </div>

          {/* Resumo de pagamento em tempo real */}
          {(() => {
            const _net = Math.max(0, (parseFloat(editForm.sale_price) || 0) - (parseFloat(editForm.discount) || 0));
            const _cash = parseFloat(editForm.payment_cash) || 0;
            const _card = parseFloat(editForm.payment_card) || 0;
            const _pix = parseFloat(editForm.payment_pix) || 0;
            const _tradeIn = editForm.has_trade_in ? parseFloat(editForm.trade_in_value) || 0 : 0;
            const _total = _cash + _card + _pix + _tradeIn;
            const _rem = _net - _total;
            return (
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Valor líquido</span>
                  <span className="font-semibold">{formatCurrency(_net)}</span>
                </div>
                {_tradeIn > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Trade-in</span>
                    <span className="font-semibold text-primary">-{formatCurrency(_tradeIn)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total pago (dinheiro + cartão + PIX)</span>
                  <span className="font-semibold">{formatCurrency(_cash + _card + _pix)}</span>
                </div>
                <div className="border-t border-border pt-1 flex justify-between">
                  <span className="font-medium">Restante</span>
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

          {/* Trade-in */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Aparelho na troca</p>
                <p className="text-[11px] text-muted-foreground">Cliente entrega como parte do pagamento</p>
              </div>
            </div>
            <Switch
              checked={editForm.has_trade_in}
              onCheckedChange={(v) => setEditForm({ ...editForm, has_trade_in: v })}
            />
          </div>

          {editForm.has_trade_in && (
            <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <p className="text-xs font-semibold text-primary">Dados do aparelho na troca</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input
                    value={editForm.trade_in_device_name}
                    onChange={(e) => setEditForm({ ...editForm, trade_in_device_name: e.target.value })}
                    placeholder="iPhone 11 64GB"
                    className="h-10"
                    required={editForm.has_trade_in}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Marca</Label>
                  <Select
                    value={editForm.trade_in_device_brand}
                    onValueChange={(v) => setEditForm({ ...editForm, trade_in_device_brand: v })}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["iPhone", "Samsung", "Xiaomi", "Outro"].map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Modelo</Label>
                  <Input
                    value={editForm.trade_in_device_model || ""}
                    onChange={(e) => setEditForm({ ...editForm, trade_in_device_model: e.target.value })}
                    placeholder="A2221"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">IMEI</Label>
                  <Input
                    value={editForm.trade_in_device_imei}
                    onChange={(e) => setEditForm({ ...editForm, trade_in_device_imei: e.target.value })}
                    placeholder="Opcional"
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor da troca (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editForm.trade_in_value}
                  onChange={(e) => setEditForm({ ...editForm, trade_in_value: e.target.value })}
                  placeholder="1500.00"
                  required={editForm.has_trade_in}
                  className="h-10"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Parcelas no Cartão</Label>
              <Select
                value={editForm.installments}
                onValueChange={(v) => setEditForm({ ...editForm, installments: v })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione as parcelas" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                    <SelectItem key={n} value={n.toString()}>
                      {n}x {n === 1 ? "à vista" : "sem juros"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Garantia (dias)</Label>
              <Select
                value={editForm.warranty_days}
                onValueChange={(v) => setEditForm({ ...editForm, warranty_days: v })}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder="Selecione a garantia" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Sem garantia</SelectItem>
                  <SelectItem value="30">30 dias</SelectItem>
                  <SelectItem value="90">90 dias (padrão)</SelectItem>
                  <SelectItem value="180">180 dias</SelectItem>
                  <SelectItem value="365">1 ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1">
              Comissão do Vendedor (%)
              {userRole === "vendedor" && (
                <span className="ml-1 text-[9px] text-muted-foreground font-normal">
                  (somente admin)
                </span>
              )}
            </Label>
            {userRole === "vendedor" ? (
              <div className="h-10 rounded-md border border-border bg-muted/40 flex items-center px-3 text-sm text-muted-foreground gap-2 cursor-not-allowed">
                <Shield className="h-3.5 w-3.5 shrink-0" />
                <span>{editForm.commission_percent}% — somente o admin pode alterar</span>
              </div>
            ) : (
              <Input
                type="number"
                step="0.1"
                value={editForm.commission_percent}
                onChange={(e) => setEditForm({ ...editForm, commission_percent: e.target.value })}
                placeholder="0"
                className="h-10"
              />
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Observações</Label>
            <Textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              placeholder="Ex: Observações gerais da alteração de venda..."
              className="min-h-[80px]"
            />
          </div>

          {/* Data Retroativa */}
          <div className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/5 space-y-1.5">
            <Label className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Data da Venda (Retroativa)
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Altere a data caso a venda tenha ocorrido em data diferente do lançamento no sistema.
            </p>
            <Input
              type="date"
              value={editForm.retro_date}
              onChange={(e) => setEditForm({ ...editForm, retro_date: e.target.value })}
              className="h-10 border-amber-500/30"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setEditSale(null)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={loading}
            >
              {loading ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
