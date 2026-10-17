import React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Plus, Search, User as UserIcon, UserPlus, History, ChevronDown, ChevronUp,
  Smartphone, Store, Tag, Trash2, Banknote, CreditCard, QrCode, Landmark,
  Shield, Percent, CalendarDays
} from "lucide-react";
import { Customer } from "./types";

interface NovaVendaModalProps {
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  resetForm: () => void;
  handleSubmit: (e: React.FormEvent) => Promise<void>;
  form: any;
  setForm: React.Dispatch<React.SetStateAction<any>>;
  products: any[];
  availableProducts: any[];
  selectedProduct: any | null;
  storeMap: Map<string, any>;
  bankAccounts: any[];
  salePrice: number;
  discount: number;
  salePriceAfterDiscount: number;
  profit: number;
  tradeInVal: number;
  cashVal: number;
  cardVal: number;
  pixVal: number;
  remaining: number;
  commissionValue: number;
  userRole?: string;
  activeStoreId: string;
  loading: boolean;
  formatCurrency: (v: number) => string;

  // Customer Manager Props
  currentProfile: any;
  user: any;
  selectedCustomer: any;
  clearCustomer: () => void;
  customerSalesHistory: any[];
  showCustomerHistory: boolean;
  setShowCustomerHistory: React.Dispatch<React.SetStateAction<boolean>>;
  productMap: Map<string, any>;
  customerSearch: string;
  setCustomerSearch: (v: string) => void;
  customerResults: any[];
  selectCustomer: (c: any) => void;
  showNewCustomerForm: boolean;
  setShowNewCustomerForm: React.Dispatch<React.SetStateAction<boolean>>;
  newCustomerForm: any;
  setNewCustomerForm: React.Dispatch<React.SetStateAction<any>>;
  handleCreateCustomer: () => Promise<void>;
}

export const NovaVendaModal: React.FC<NovaVendaModalProps> = ({
  dialogOpen,
  setDialogOpen,
  resetForm,
  handleSubmit,
  form,
  setForm,
  products,
  availableProducts,
  selectedProduct,
  storeMap,
  bankAccounts,
  salePrice,
  discount,
  salePriceAfterDiscount,
  profit,
  tradeInVal,
  cashVal,
  cardVal,
  pixVal,
  remaining,
  commissionValue,
  userRole,
  activeStoreId,
  loading,
  formatCurrency,

  currentProfile,
  user,
  selectedCustomer,
  clearCustomer,
  customerSalesHistory,
  showCustomerHistory,
  setShowCustomerHistory,
  productMap,
  customerSearch,
  setCustomerSearch,
  customerResults,
  selectCustomer,
  showNewCustomerForm,
  setShowNewCustomerForm,
  newCustomerForm,
  setNewCustomerForm,
  handleCreateCustomer,
}) => {
  return (
    <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2 h-10" disabled={activeStoreId === "all"}>
          <Plus className="h-4 w-4" /> Nova Venda
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Registrar Venda</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Cliente ── */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <UserIcon className="h-3 w-3" /> Cliente
              </p>
              {currentProfile && (
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  Vendedor: <span className="font-semibold text-primary">{currentProfile.display_name ?? user?.email}</span>
                </span>
              )}
            </div>

            {selectedCustomer ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                      {selectedCustomer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{selectedCustomer.name}</p>
                      <div className="flex gap-2 flex-wrap">
                        {selectedCustomer.phone && <p className="text-[10px] text-muted-foreground">{selectedCustomer.phone}</p>}
                        {selectedCustomer.cpf && <p className="text-[10px] text-muted-foreground">CPF: {selectedCustomer.cpf}</p>}
                      </div>
                    </div>
                  </div>
                  <Button
                    className="h-7 px-2 bg-transparent border border-border text-foreground hover:bg-muted text-[10px]"
                    onClick={clearCustomer}
                  >
                    Trocar
                  </Button>
                </div>
                {selectedCustomer.address && <p className="text-[10px] text-muted-foreground">📍 {selectedCustomer.address}</p>}

                {/* Histórico */}
                {customerSalesHistory.length > 0 && (
                  <div>
                    <button
                      type="button"
                      className="flex items-center gap-1 text-[10px] text-primary font-medium"
                      onClick={() => setShowCustomerHistory((v) => !v)}
                    >
                      <History className="h-3 w-3" /> {customerSalesHistory.length} compra(s) anterior(es)
                      {showCustomerHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {showCustomerHistory && (
                      <div className="mt-2 space-y-1">
                        {customerSalesHistory.map((s) => {
                          const p = productMap.get(s.product_id) as any;
                          return (
                            <div key={s.id} className="flex justify-between rounded bg-muted/50 px-2 py-1 text-[10px]">
                              <span className="truncate">{p?.name ?? "Produto"}</span>
                              <span className="text-primary font-semibold shrink-0 ml-2">{formatCurrency(Number(s.sale_price))}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Buscar cliente por nome, telefone ou CPF..."
                    className="pl-9 h-10"
                  />
                </div>
                {customerResults.length > 0 && (
                  <div className="rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                    {customerResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/50 last:border-0"
                        onClick={() => selectCustomer(c)}
                      >
                        <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {c.name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.phone ?? ""}{c.cpf ? ` · ${c.cpf}` : ""}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                <Button
                  type="button"
                  className="w-full gap-2 h-9 text-xs border border-dashed bg-transparent text-foreground hover:bg-muted"
                  onClick={() => setShowNewCustomerForm((v) => !v)}
                >
                  <UserPlus className="h-3.5 w-3.5" /> Cadastrar novo cliente
                </Button>
                {showNewCustomerForm && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-3">
                    <p className="text-xs font-semibold text-primary">Novo Cliente</p>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome *</Label>
                      <Input
                        value={newCustomerForm.name}
                        onChange={(e) => setNewCustomerForm((f: any) => ({ ...f, name: e.target.value }))}
                        placeholder="Nome completo"
                        className="h-9"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Telefone</Label>
                        <Input
                          value={newCustomerForm.phone}
                          onChange={(e) => setNewCustomerForm((f: any) => ({ ...f, phone: e.target.value }))}
                          placeholder="(87) 99999-9999"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">CPF</Label>
                        <Input
                          value={newCustomerForm.cpf}
                          onChange={(e) => setNewCustomerForm((f: any) => ({ ...f, cpf: e.target.value }))}
                          placeholder="000.000.000-00"
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Endereço</Label>
                      <Input
                        value={newCustomerForm.address}
                        onChange={(e) => setNewCustomerForm((f: any) => ({ ...f, address: e.target.value }))}
                        placeholder="Rua, número, bairro..."
                        className="h-9"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">E-mail</Label>
                        <Input
                          type="email"
                          value={newCustomerForm.email}
                          onChange={(e) => setNewCustomerForm((f: any) => ({ ...f, email: e.target.value }))}
                          placeholder="email@exemplo.com"
                          className="h-9"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Data de Nascimento</Label>
                        <Input
                          type="date"
                          value={newCustomerForm.birth}
                          onChange={(e) => setNewCustomerForm((f: any) => ({ ...f, birth: e.target.value }))}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      className="w-full h-9"
                      onClick={handleCreateCustomer}
                      disabled={loading || !newCustomerForm.name}
                    >
                      {loading ? "Salvando..." : "Salvar e Selecionar"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Produto ── */}
          <div className="space-y-1.5">
            <Label className="text-xs">Produto</Label>
            <Select
              value={form.product_id}
              onValueChange={(v) => {
                const prod = products.find((p) => p.id === v);
                setForm({ ...form, product_id: v, sale_price: prod?.sale_price ? String(prod.sale_price) : "" });
              }}
            >
              <SelectTrigger className="h-10">
                <SelectValue placeholder="Selecione o aparelho" />
              </SelectTrigger>
              <SelectContent>
                {availableProducts.map((p) => {
                  const storeName = (storeMap.get(p.store_id) as any)?.name || "?";
                  return (
                    <SelectItem key={p.id} value={p.id} className="py-2.5 focus:bg-accent">
                      <div className="flex flex-col gap-1 w-full text-left">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-sm text-foreground">{p.name}</span>
                          {p.brand && (
                            <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
                              {p.brand}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
                          {p.imei && (
                            <span className="font-mono bg-muted/80 border border-border/80 px-1.5 py-0.2 rounded text-[11px] text-foreground/80">
                              IMEI: {p.imei}
                            </span>
                          )}
                          <span className="flex items-center gap-1 bg-secondary/80 px-1.5 py-0.2 rounded text-[10px] font-medium text-secondary-foreground">
                            📍 {storeName}
                          </span>
                        </div>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {selectedProduct && (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-primary/5 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <Smartphone className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-semibold text-sm text-foreground truncate">{selectedProduct.name}</span>
                </div>
                {selectedProduct.brand && (
                  <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20 shrink-0 ml-2">
                    {selectedProduct.brand}
                  </span>
                )}
              </div>
              <div className="px-3 py-2.5 space-y-2">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {selectedProduct.model && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Modelo</span>
                      <span className="font-medium">{selectedProduct.model}</span>
                    </div>
                  )}
                  {(selectedProduct as any).color && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Cor</span>
                      <span className="font-medium flex items-center gap-1">
                        <span className="inline-block h-2.5 w-2.5 rounded-full border border-border" style={{ background: (selectedProduct as any).color }} />
                        {(selectedProduct as any).color}
                      </span>
                    </div>
                  )}
                  {selectedProduct.capacity && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Capacidade</span>
                      <span className="font-medium">{selectedProduct.capacity}</span>
                    </div>
                  )}
                  {selectedProduct.battery_percentage !== null && selectedProduct.battery_percentage !== undefined && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Saúde da Bateria</span>
                      <span className="font-medium">{selectedProduct.battery_percentage}%</span>
                    </div>
                  )}
                  {selectedProduct.condition && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Condição</span>
                      <span className="font-medium capitalize">{selectedProduct.condition}</span>
                    </div>
                  )}
                  {selectedProduct.imei && (
                    <div className="flex flex-col gap-0.5 col-span-2">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">IMEI</span>
                      <span className="font-mono text-[11px] bg-muted/70 px-1.5 py-0.5 rounded border border-border/70">{selectedProduct.imei}</span>
                    </div>
                  )}
                  {selectedProduct.store_id && (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Loja</span>
                      <span className="font-medium flex items-center gap-1">
                        <Store className="h-3 w-3 text-muted-foreground" />
                        {(storeMap.get(selectedProduct.store_id) as any)?.name ?? "—"}
                      </span>
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-muted-foreground text-[10px] uppercase tracking-wide">Custo</span>
                    <span className="font-semibold text-foreground">{formatCurrency(Number(selectedProduct.cost_price))}</span>
                  </div>
                </div>
                {salePrice > 0 && (
                  <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs font-semibold border ${
                    profit >= 0
                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                      : "bg-destructive/10 border-destructive/20 text-destructive"
                  }`}>
                    <span>Lucro estimado</span>
                    <span className="text-sm">{formatCurrency(profit)}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor de Venda (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })}
                placeholder="3500.00"
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Tag className="h-3 w-3" /> Desconto (R$)
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.discount}
                onChange={(e) => setForm({ ...form, discount: e.target.value })}
                placeholder="0.00"
                className="h-10"
              />
            </div>
          </div>

          {discount > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs">
              <span className="text-yellow-500">Valor com desconto</span>
              <span className="font-bold text-yellow-500">{formatCurrency(salePriceAfterDiscount)}</span>
            </div>
          )}

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
              checked={form.has_trade_in}
              onCheckedChange={(v) =>
                setForm({
                  ...form,
                  has_trade_in: v,
                  trade_in_devices: v ? [{ name: "", brand: "iPhone", model: "", imei: "", value: "" }] : [],
                })
              }
            />
          </div>

          {form.has_trade_in && (
            <div className="space-y-4 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                <p className="text-xs font-semibold text-primary">Aparelhos na Troca</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-[10px] gap-1 border-primary/30 text-primary hover:bg-primary/10 bg-background shadow-none"
                  onClick={() => {
                    const devices = form.trade_in_devices || [];
                    setForm({
                      ...form,
                      trade_in_devices: [...devices, { name: "", brand: "iPhone", model: "", imei: "", value: "" }],
                    });
                  }}
                >
                  <Plus className="h-3 w-3" /> Adicionar Aparelho
                </Button>
              </div>

              {(form.trade_in_devices || []).map((device: any, index: number) => (
                <div key={index} className="space-y-3 p-2.5 rounded-md border border-border/50 bg-background/50 relative">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">Aparelho #{index + 1}</p>
                    {(form.trade_in_devices || []).length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-6 w-6 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => {
                          const devices = [...(form.trade_in_devices || [])];
                          devices.splice(index, 1);
                          setForm({ ...form, trade_in_devices: devices });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome *</Label>
                      <Input
                        value={device.name}
                        onChange={(e) => {
                          const devices = [...(form.trade_in_devices || [])];
                          devices[index].name = e.target.value;
                          setForm({ ...form, trade_in_devices: devices });
                        }}
                        placeholder="Ex: iPhone 11 64GB"
                        className="h-10 bg-background"
                        required
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Marca</Label>
                      <Select
                        value={device.brand}
                        onValueChange={(v) => {
                          const devices = [...(form.trade_in_devices || [])];
                          devices[index].brand = v;
                          setForm({ ...form, trade_in_devices: devices });
                        }}
                      >
                        <SelectTrigger className="h-10 bg-background">
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
                        value={device.model}
                        onChange={(e) => {
                          const devices = [...(form.trade_in_devices || [])];
                          devices[index].model = e.target.value;
                          setForm({ ...form, trade_in_devices: devices });
                        }}
                        placeholder="Ex: A2221"
                        className="h-10 bg-background"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">IMEI</Label>
                      <Input
                        value={device.imei}
                        onChange={(e) => {
                          const devices = [...(form.trade_in_devices || [])];
                          devices[index].imei = e.target.value;
                          setForm({ ...form, trade_in_devices: devices });
                        }}
                        placeholder="Opcional"
                        className="h-10 bg-background"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Valor da troca (R$) *</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={device.value}
                      onChange={(e) => {
                        const devices = [...(form.trade_in_devices || [])];
                        devices[index].value = e.target.value;
                        setForm({ ...form, trade_in_devices: devices });
                      }}
                      placeholder="0.00"
                      className="h-10 bg-background"
                      required
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagamento */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Forma de Pagamento</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Banknote className="h-3 w-3" /> Dinheiro
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.payment_cash}
                  onChange={(e) => setForm({ ...form, payment_cash: e.target.value })}
                  placeholder="0.00"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> Cartão
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.payment_card}
                  onChange={(e) => setForm({ ...form, payment_card: e.target.value })}
                  placeholder="0.00"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <QrCode className="h-3 w-3" /> PIX
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.payment_pix}
                  onChange={(e) => setForm({ ...form, payment_pix: e.target.value })}
                  placeholder="0.00"
                  className="h-10"
                />
              </div>
            </div>

            {cardVal > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <CreditCard className="h-3 w-3" /> Parcelas no Cartão
                </Label>
                <Select value={form.installments} onValueChange={(v) => setForm({ ...form, installments: v })}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}x {n > 1 ? `de ${formatCurrency(cardVal / n)}` : "à vista"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(cardVal > 0 || pixVal > 0) && (
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1">
                  <Landmark className="h-3 w-3" /> Conta / Maquininha Destino
                </Label>
                <Select
                  value={form.destination_account_id}
                  onValueChange={(v) => setForm({ ...form, destination_account_id: v })}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Selecione onde vai cair..." />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccounts
                      .filter((a) => a.store_id === selectedProduct.store_id)
                      .map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.bank_name} ({acc.account_type})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  As taxas configuradas serão aplicadas automaticamente e refletirão no saldo disponível.
                </p>
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Valor de venda</span>
                <span className="font-semibold">{formatCurrency(salePrice)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Desconto</span>
                  <span className="font-semibold text-yellow-500">-{formatCurrency(discount)}</span>
                </div>
              )}
              {form.has_trade_in && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Aparelho na troca</span>
                  <span className="font-semibold text-primary">-{formatCurrency(tradeInVal)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dinheiro + Cartão + PIX</span>
                <span className="font-semibold">{formatCurrency(cashVal + cardVal + pixVal)}</span>
              </div>
              <div className="border-t border-border pt-1 flex justify-between">
                <span className="font-medium">Restante</span>
                <span className={`font-bold ${Math.abs(remaining) < 0.01 ? "text-primary" : "text-destructive"}`}>
                  {formatCurrency(remaining)}
                </span>
              </div>
            </div>
          </div>

          {/* Garantia + Comissão */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Shield className="h-3 w-3" /> Garantia (dias)
              </Label>
              <Select value={form.warranty_days} onValueChange={(v) => setForm({ ...form, warranty_days: v })}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[7, 15, 30, 60, 90, 180, 365].map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} dias{d === 90 ? " (padrão)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <Percent className="h-3 w-3" /> Comissão (%)
                {userRole === "vendedor" && (
                  <span className="ml-1 text-[9px] text-muted-foreground font-normal">(somente admin)</span>
                )}
              </Label>
              {userRole === "vendedor" ? (
                <div className="h-10 rounded-md border border-border bg-muted/40 flex items-center px-3 text-sm text-muted-foreground gap-2 cursor-not-allowed">
                  <Shield className="h-3.5 w-3.5 shrink-0" />
                  <span>{form.commission_percent}% — definido pelo admin</span>
                </div>
              ) : (
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  value={form.commission_percent}
                  onChange={(e) => setForm({ ...form, commission_percent: e.target.value })}
                  className="h-10"
                />
              )}
            </div>
          </div>

          {commissionValue > 0 && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 flex justify-between text-xs">
              <span className="text-muted-foreground">Comissão calculada</span>
              <span className="font-bold text-primary">{formatCurrency(commissionValue)}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Observações da venda..."
              className="min-h-[60px]"
            />
          </div>

          {/* Data Retroativa */}
          <div className="border border-amber-500/30 rounded-xl p-3 bg-amber-500/5 space-y-1.5">
            <Label className="text-xs font-bold text-amber-600 flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Data da Venda (Retroativa)
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Opcional. Escolha a data se o aparelho foi vendido em uma data retroativa.
            </p>
            <Input
              type="date"
              value={form.retro_date}
              onChange={(e) => setForm({ ...form, retro_date: e.target.value })}
              className="h-10 border-amber-500/30"
            />
          </div>

          <Button
            type="submit"
            className="w-full h-11 font-semibold"
            disabled={loading || !form.product_id || Math.abs(remaining) > 0.01}
          >
            {loading ? "Registrando..." : "Registrar Venda"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
};
