import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Plus, Cpu, FileText, Upload, ArrowRightLeft, Trash2 } from "lucide-react";

interface PecasTabProps {
  partsSearch: string;
  setPartsSearch: (val: string) => void;
  addPartOpen: boolean;
  setAddPartOpen: (open: boolean) => void;
  activeStoreId: string;
  partForm: {
    name: string;
    brand: string;
    model: string;
    cost_price: string;
    sale_price: string;
    supplier_id: string;
    launch_cash_out: boolean;
    payment_method: string;
    use_credit: boolean;
  };
  setPartForm: React.Dispatch<React.SetStateAction<any>>;
  setPartVoucherFile: (f: File | null) => void;
  suppliers: any[];
  supplierMap: Map<string, string>;
  storeMap: Map<string, string>;
  filteredParts: any[];
  formatCurrency: (value: number) => string;
  handleAddPart: (e: React.FormEvent) => void | Promise<void>;
  handleQuickUploadVoucher: (e: React.ChangeEvent<HTMLInputElement>, id: string) => void | Promise<void>;
  handleReturnPart: (p: any) => void | Promise<void>;
  onRequestDeletePart: (id: string) => void;
  loading: boolean;
}

export const PecasTab: React.FC<PecasTabProps> = ({
  partsSearch,
  setPartsSearch,
  addPartOpen,
  setAddPartOpen,
  activeStoreId,
  partForm,
  setPartForm,
  setPartVoucherFile,
  suppliers,
  supplierMap,
  storeMap,
  filteredParts,
  formatCurrency,
  handleAddPart,
  handleQuickUploadVoucher,
  handleReturnPart,
  onRequestDeletePart,
  loading,
}) => {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={partsSearch}
            onChange={(e) => setPartsSearch(e.target.value)}
            placeholder="Buscar peça por nome, marca..."
            className="w-full pl-9 pr-3 h-9 rounded-md border border-input bg-background text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <Dialog open={addPartOpen} onOpenChange={setAddPartOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 h-9" disabled={activeStoreId === "all"}>
              <Plus className="h-4 w-4" /> Nova Peça
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display flex items-center gap-2">
                <Cpu className="h-5 w-5" /> Cadastrar Peça no Estoque
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddPart} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Nome da Peça *</Label>
                  <Input
                    value={partForm.name}
                    onChange={(e) => setPartForm((f: any) => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Tela iPhone 13"
                    required
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Marca / Fabricante</Label>
                  <Input
                    value={partForm.brand}
                    onChange={(e) => setPartForm((f: any) => ({ ...f, brand: e.target.value }))}
                    placeholder="Apple, Samsung..."
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Modelo</Label>
                  <Input
                    value={partForm.model}
                    onChange={(e) => setPartForm((f: any) => ({ ...f, model: e.target.value }))}
                    placeholder="iPhone 13 Pro"
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Custo (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={partForm.cost_price}
                    onChange={(e) => setPartForm((f: any) => ({ ...f, cost_price: e.target.value }))}
                    placeholder="0.00"
                    required
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Preço de Venda (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={partForm.sale_price}
                    onChange={(e) => setPartForm((f: any) => ({ ...f, sale_price: e.target.value }))}
                    placeholder="0.00 (auto)"
                    className="h-10"
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Fornecedor</Label>
                  <Select
                    value={partForm.supplier_id}
                    onValueChange={(v) =>
                      setPartForm((f: any) => ({ ...f, supplier_id: v === "none" ? "" : v }))
                    }
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Selecione o fornecedor (opcional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum fornecedor</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {partForm.supplier_id &&
                  (suppliers.find((s) => s.id === partForm.supplier_id)?.credit_balance ?? 0) > 0 && (
                    <div className="col-span-2 flex items-center justify-between border border-primary/20 bg-primary/5 rounded-lg p-2.5 animate-in fade-in-50 duration-200">
                      <div className="space-y-0.5">
                        <Label
                          className="text-xs font-bold cursor-pointer text-primary"
                          htmlFor="part-credit-toggle"
                        >
                          Abater do saldo de crédito existente?
                        </Label>
                        <p className="text-[10px] text-muted-foreground">
                          Saldo disponível:{" "}
                          {formatCurrency(
                            Number(suppliers.find((s) => s.id === partForm.supplier_id)?.credit_balance)
                          )}
                        </p>
                      </div>
                      <input
                        id="part-credit-toggle"
                        type="checkbox"
                        checked={partForm.use_credit}
                        onChange={(e) =>
                          setPartForm((f: any) => ({ ...f, use_credit: e.target.checked }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                      />
                    </div>
                  )}

                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Comprovante de Pagamento</Label>
                  <Input
                    type="file"
                    onChange={(e) => setPartVoucherFile(e.target.files?.[0] || null)}
                    className="h-10 text-xs py-2"
                    accept="image/*,application/pdf"
                  />
                </div>

                <div className="col-span-2 flex items-center justify-between border border-border/60 rounded-lg p-2.5 bg-muted/20">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-bold cursor-pointer" htmlFor="part-cash-out-toggle">
                      Lançar saída no Caixa?
                    </Label>
                    <p className="text-[10px] text-muted-foreground">
                      Cria uma despesa correspondente no caixa aberto da loja
                    </p>
                  </div>
                  <input
                    id="part-cash-out-toggle"
                    type="checkbox"
                    checked={partForm.launch_cash_out}
                    onChange={(e) =>
                      setPartForm((f: any) => ({ ...f, launch_cash_out: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                </div>

                {partForm.launch_cash_out && (
                  <div className="col-span-2 space-y-1.5 animate-in fade-in-50 duration-200">
                    <Label className="text-xs">Forma de Pagamento</Label>
                    <Select
                      value={partForm.payment_method}
                      onValueChange={(v) =>
                        setPartForm((f: any) => ({ ...f, payment_method: v }))
                      }
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dinheiro">Dinheiro</SelectItem>
                        <SelectItem value="pix">PIX</SelectItem>
                        <SelectItem value="cartao_debito">Cartão de Débito</SelectItem>
                        <SelectItem value="cartao_credito">Cartão de Crédito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                A peça ficará disponível em estoque para ser vinculada a OS e Reparos.
              </p>
              <Button type="submit" className="w-full h-10 font-semibold" disabled={loading}>
                {loading ? "Salvando..." : "Adicionar ao Estoque"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {filteredParts.length > 0 ? (
        <div className="space-y-2">
          {filteredParts.map((p) => {
            const supplierName =
              (p as any).supplier_name || (p as any).supplier_id
                ? supplierMap.get((p as any).supplier_id)
                : null;
            const margin = p.sale_price ? Number(p.sale_price) - Number(p.cost_price) : null;
            return (
              <Card key={p.id} className="border-border/50 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{p.name}</p>
                        <Badge className="text-[10px] bg-blue-500/10 text-blue-500 border-blue-500/20">
                          <Cpu className="h-2.5 w-2.5 mr-0.5" /> Peça
                        </Badge>
                        {activeStoreId === "all" && (
                          <Badge
                            variant="outline"
                            className="text-[9px] bg-muted/50 border-primary/20 text-primary"
                          >
                            {storeMap.get(p.store_id) || "—"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.brand && `${p.brand} · `}
                        {p.model && p.model !== p.name && `${p.model}`}
                      </p>
                      {supplierName && (
                        <p className="text-[10px] text-blue-500 font-medium mt-0.5">
                          🏭 {supplierName}
                        </p>
                      )}
                      <div className="flex gap-2 mt-3 items-center flex-wrap">
                        {p.parts_payment_voucher ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] gap-1 border border-primary/25 bg-primary/5 text-primary hover:bg-primary/10 shadow-none"
                              onClick={() => window.open(p.parts_payment_voucher, "_blank")}
                            >
                              <FileText className="h-3 w-3" /> Ver Comprovante
                            </Button>
                            <Label className="h-7 px-2 text-[10px] flex items-center justify-center border border-border bg-transparent text-foreground hover:bg-muted shadow-none rounded-md cursor-pointer font-medium">
                              Alterar
                              <input
                                type="file"
                                className="hidden"
                                accept="image/*,application/pdf"
                                onChange={(e) => handleQuickUploadVoucher(e, p.id)}
                              />
                            </Label>
                          </div>
                        ) : (
                          <Label className="h-7 px-2 text-[10px] flex items-center justify-center gap-1 border border-border bg-transparent text-muted-foreground hover:bg-muted shadow-none rounded-md cursor-pointer font-medium">
                            <Upload className="h-3 w-3" /> Anexar Comprovante
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*,application/pdf"
                              onChange={(e) => handleQuickUploadVoucher(e, p.id)}
                            />
                          </Label>
                        )}
                        {p.supplier_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] gap-1 border-yellow-500/30 text-yellow-600 hover:bg-yellow-500/10"
                            onClick={() => handleReturnPart(p)}
                          >
                            <ArrowRightLeft className="h-3 w-3" /> Devolver
                          </Button>
                        )}
                        <Button
                          className="h-7 w-7 p-0 bg-transparent text-destructive hover:bg-destructive/10"
                          onClick={() => onRequestDeletePart(p.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">Custo</p>
                      <p className="font-display font-bold text-base">
                        {formatCurrency(Number(p.cost_price))}
                      </p>
                      {p.sale_price && (
                        <p className="text-xs text-muted-foreground">
                          Venda: {formatCurrency(Number(p.sale_price))}
                        </p>
                      )}
                      {margin !== null && margin > 0 && (
                        <p className="text-[10px] text-primary font-medium">
                          +{formatCurrency(margin)}
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          <div className="text-xs text-center text-muted-foreground pt-1">
            Total investido em peças:{" "}
            <span className="font-semibold text-foreground">
              {formatCurrency(filteredParts.reduce((s, p) => s + Number(p.cost_price), 0))}
            </span>
          </div>
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Cpu className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium text-sm">Nenhuma peça em estoque</p>
            <p className="text-xs mt-1">Cadastre peças compradas de fornecedores aqui</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
