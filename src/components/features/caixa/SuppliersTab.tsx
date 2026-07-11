import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Truck, Building2, Phone, CreditCard } from "lucide-react";

interface Supplier {
  id: string; store_id: string | null; name: string; document: string | null;
  phone: string | null; email: string | null; category: string | null;
  notes: string | null; credit_balance: number; created_at: string;
}

interface SuppliersTabProps {
  suppliers: Supplier[];
  setSupplierDialog: (open: boolean) => void;
  supplierDialog: boolean;
  supplierForm: any;
  setSupplierForm: any;
  handleSaveSupplier: () => void;
  setSelectedSupplier: (s: Supplier | null) => void;
  setPaySupplierDialog: (open: boolean) => void;
  paySupplierDialog: boolean;
  payForm: any;
  setPayForm: any;
  handlePaySupplier: () => void;
  handleDeleteSupplier: (id: string) => void;
  currentRegister: any;
  formatCurrency: (v: number) => string;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  setActiveTarget: (target: "open" | "close" | "confirm" | null) => void;
}

export const SuppliersTab: React.FC<SuppliersTabProps> = ({
  suppliers,
  setSupplierDialog,
  supplierDialog,
  supplierForm,
  setSupplierForm,
  handleSaveSupplier,
  setSelectedSupplier,
  setPaySupplierDialog,
  paySupplierDialog,
  payForm,
  setPayForm,
  handlePaySupplier,
  handleDeleteSupplier,
  currentRegister,
  formatCurrency,
  fileInputRef,
  cameraInputRef,
  setActiveTarget,
}) => {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display font-bold text-base">Fornecedores</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Gerencie fornecedores e controle créditos/débitos</p>
        </div>
        <Button className="gap-1.5 h-9 text-xs" onClick={() => setSupplierDialog(true)}>
          <Plus className="h-3.5 w-3.5" /> Novo Fornecedor
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase">Total Fornecedores</p>
            <p className="font-display text-xl font-bold mt-1">{suppliers.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase">Com Crédito</p>
            <p className="font-display text-xl font-bold mt-1 text-primary">
              {suppliers.filter(s => s.credit_balance > 0).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase">Com Débito</p>
            <p className="font-display text-xl font-bold mt-1 text-destructive">
              {suppliers.filter(s => s.credit_balance < 0).length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <p className="text-[11px] text-muted-foreground uppercase">Saldo Total</p>
            <p className={`font-display text-xl font-bold mt-1 ${ suppliers.reduce((s,x) => s + Number(x.credit_balance), 0) >= 0 ? "text-primary" : "text-destructive"}`}>
              {formatCurrency(suppliers.reduce((s, x) => s + Number(x.credit_balance), 0))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Suppliers list */}
      <div className="space-y-2">
        {suppliers.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Truck className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhum fornecedor cadastrado.</p>
              <Button className="h-8 text-xs gap-1" onClick={() => setSupplierDialog(true)}>
                <Plus className="h-3 w-3" /> Cadastrar primeiro fornecedor
              </Button>
            </CardContent>
          </Card>
        ) : (
          suppliers.map(sup => (
            <Card key={sup.id} className="border-border/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{sup.name}</p>
                      <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                        {sup.category && <span className="text-[10px] text-muted-foreground">{sup.category}</span>}
                        {sup.phone && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Phone className="h-2.5 w-2.5" />{sup.phone}</span>}
                        {sup.document && <span className="text-[10px] text-muted-foreground">{sup.document}</span>}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] text-muted-foreground uppercase">Saldo</p>
                      <p className={`font-bold text-sm ${Number(sup.credit_balance) > 0 ? "text-primary" : Number(sup.credit_balance) < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                        {formatCurrency(Number(sup.credit_balance))}
                      </p>
                      <p className="text-[9px] text-muted-foreground">
                        {Number(sup.credit_balance) > 0 ? "crédito conosco" : Number(sup.credit_balance) < 0 ? "devemos" : "quitado"}
                      </p>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        className="h-8 text-xs gap-1 bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20"
                        onClick={() => { setSelectedSupplier(sup); setPaySupplierDialog(true); }}
                        disabled={!currentRegister}
                      >
                        <CreditCard className="h-3.5 w-3.5" /> Pagar
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteSupplier(sup.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>

                {sup.notes && (
                  <p className="text-[10px] text-muted-foreground mt-2 pl-12">{sup.notes}</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Dialogs */}
      <Dialog open={supplierDialog} onOpenChange={setSupplierDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">Cadastrar Fornecedor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nome / Razão Social *</Label>
              <Input value={supplierForm.name} onChange={e => setSupplierForm((prev: any) => ({ ...prev, name: e.target.value }))} placeholder="Distribuidora de Peças Ltda" className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">CNPJ / CPF</Label>
                <Input value={supplierForm.document} onChange={e => setSupplierForm((prev: any) => ({ ...prev, document: e.target.value }))} placeholder="00.000.000/0001-00" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Telefone</Label>
                <Input value={supplierForm.phone} onChange={e => setSupplierForm((prev: any) => ({ ...prev, phone: e.target.value }))} placeholder="(11) 99999-9999" className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Input value={supplierForm.category} onChange={e => setSupplierForm((prev: any) => ({ ...prev, category: e.target.value }))} placeholder="Peças, Acessórios, Ferramentas..." className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Observações</Label>
              <Textarea value={supplierForm.notes} onChange={e => setSupplierForm((prev: any) => ({ ...prev, notes: e.target.value }))} placeholder="Anotações internas..." />
            </div>
            <Button className="w-full h-11 font-semibold" onClick={handleSaveSupplier}>Cadastrar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paySupplierDialog} onOpenChange={setPaySupplierDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">Registrar Pagamento a Fornecedor</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor do Lançamento (R$) *</Label>
              <Input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm((prev: any) => ({ ...prev, amount: e.target.value }))} placeholder="0.00" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Forma de Pagamento *</Label>
              <Select value={payForm.payment_method} onValueChange={v => setPayForm((prev: any) => ({ ...prev, payment_method: v }))}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dinheiro">Dinheiro (Sai do Caixa)</SelectItem>
                  <SelectItem value="pix">PIX (Lançamento Banco)</SelectItem>
                  <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                  <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Ajuste de Crédito/Débito (R$)</Label>
              <Input type="number" step="0.01" value={payForm.credit_adjust} onChange={e => setPayForm((prev: any) => ({ ...prev, credit_adjust: e.target.value }))} placeholder="0.00" className="h-10" />
              <p className="text-[10px] text-muted-foreground">Valor pago a mais entra como crédito positivo. Valor pago a menos abate do débito.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição / Notas</Label>
              <Input value={payForm.description} onChange={e => setPayForm((prev: any) => ({ ...prev, description: e.target.value }))} placeholder="Pagamento referente à compra de telas" className="h-10" />
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Comprovante de Pagamento</Label>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 text-xs gap-1.5 h-10" onClick={() => { setActiveTarget("confirm"); fileInputRef.current?.click(); }}>
                  Upload
                </Button>
                <Button type="button" variant="outline" className="flex-1 text-xs gap-1.5 h-10" onClick={() => { setActiveTarget("confirm"); cameraInputRef.current?.click(); }}>
                  Câmera
                </Button>
              </div>
              {payForm.receipt && (
                <p className="text-xs text-primary font-medium text-center">✓ Arquivo carregado: {payForm.receipt.name}</p>
              )}
            </div>

            <Button className="w-full h-11 font-semibold" onClick={handlePaySupplier}>Registrar Pagamento</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
