import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Package, ArrowRightLeft, AlertTriangle, Wrench, Pencil, Trash2 } from "lucide-react";

const REPAIR_OPTIONS = [
  "Troca de Tela", "Troca de Bateria", "Conector de Carga",
  "Reparo de Carcaça/Tampa Traseira", "Câmera (Traseira/Frontal)",
  "Reparo de Placa (Micro Soldagem)", "Botões/Biometria",
  "Desoxidação (Contato com água)", "Outro Reparo",
];

const statusLabels: Record<string, string> = {
  in_stock: "Em estoque", sold: "Vendido", reserved: "Reservado", repair: "Em reparo",
};
const statusColors: Record<string, string> = {
  in_stock: "bg-primary/15 text-primary border-primary/20",
  sold: "bg-muted text-muted-foreground border-border",
  reserved: "bg-accent/15 text-accent border-accent/20",
  repair: "bg-destructive/15 text-destructive border-destructive/20",
};

interface AparelhosTableProps {
  inStock: any[];
  form: any;
  setForm: (form: any) => void;
  dialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  handleSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  activeStoreId: string | null;
  storeMap: Map<string, string>;
  stores: any[];
  formatCurrency: (v: number) => string;
  loadHistory: (p: any) => void;
  setTransferProduct: (p: any) => void;
  setTransferDialogOpen: (open: boolean) => void;
  setRepairProduct: (p: any) => void;
  setRepairModalOpen: (open: boolean) => void;
  setDefectsProduct: (p: any) => void;
  setDefectsList: (d: string[]) => void;
  setCustomDefect: (d: string) => void;
  setDefectsDialogOpen: (open: boolean) => void;
  openEditProduct: (p: any) => void;
  setDeleteId: (id: string) => void;
  setDeleteType: (t: "product" | "accessory") => void;
  setJustification: (j: string) => void;
  setDeleteDialogOpen: (open: boolean) => void;
  repairCostsMap?: Map<string, number>;
}

export const AparelhosTable: React.FC<AparelhosTableProps> = ({
  inStock, form, setForm, dialogOpen, setDialogOpen, handleSubmit, loading,
  activeStoreId, storeMap, stores, formatCurrency, loadHistory,
  setTransferProduct, setTransferDialogOpen, setRepairProduct, setRepairModalOpen,
  setDefectsProduct, setDefectsList, setCustomDefect, setDefectsDialogOpen,
  openEditProduct, setDeleteId, setDeleteType, setJustification, setDeleteDialogOpen,
  repairCostsMap = new Map(),
}) => {
  return (
    <>
      <div className="flex justify-end">
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 h-10" disabled={activeStoreId === "all"}>
              <Plus className="h-4 w-4" /> Novo Aparelho
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-display">Cadastrar Aparelho</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="iPhone 13 128GB" required className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Marca</Label>
                  <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="iPhone">iPhone</SelectItem>
                      <SelectItem value="Xiaomi">Xiaomi</SelectItem>
                      <SelectItem value="Samsung">Samsung</SelectItem>
                      <SelectItem value="Motorola">Motorola</SelectItem>
                      <SelectItem value="Outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Modelo</Label>
                  <Input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="A2633" required className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Condição</Label>
                  <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Novo</SelectItem>
                      <SelectItem value="used">Usado</SelectItem>
                      <SelectItem value="refurbished">Recondicionado</SelectItem>
                      <SelectItem value="seminovo_americano">Seminovo (Americano)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Capacidade (GB)</Label>
                  <Input value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} placeholder="128" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Cor</Label>
                  <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="Preto" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Bateria (%)</Label>
                  <Input type="number" value={form.battery_percentage} onChange={(e) => setForm({ ...form, battery_percentage: e.target.value })} placeholder="100" className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">IMEI</Label>
                <Input value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} placeholder="Obrigatório para celulares" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição / Histórico do Aparelho (Observações)</Label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Ex: Aparelho já foi substituído tela."
                  className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Custo (R$)</Label>
                  <Input type="number" step="0.01" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} placeholder="2500.00" required className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Venda (R$)</Label>
                  <Input type="number" step="0.01" value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.value })} placeholder="3500.00" className="h-10" />
                </div>
              </div>
              <div className="space-y-1.5 grayscale opacity-60 pointer-events-none">
                <Label className="text-xs">Loja (Vinculada à Loja Ativa)</Label>
                <Input value={storeMap.get(activeStoreId || "") || ""} readOnly className="h-10" />
              </div>

              {/* Seção de Reparos no Cadastro */}
              <div className="border border-border/80 rounded-xl p-3.5 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-xs font-bold text-foreground cursor-pointer" htmlFor="needs-repair-toggle">
                      Precisa de Reparo?
                    </Label>
                    <p className="text-[10px] text-muted-foreground">O aparelho será enviado direto para a aba de reparos</p>
                  </div>
                  <input
                    id="needs-repair-toggle"
                    type="checkbox"
                    checked={form.needsRepair}
                    onChange={(e) => setForm({ ...form, needsRepair: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                  />
                </div>
                {form.needsRepair && (
                  <div className="space-y-2 pt-1 border-t border-border/50 animate-in fade-in-50 duration-200">
                    <Label className="text-[11px] font-bold text-muted-foreground uppercase">Reparos Necessários (Multi-seleção)</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {REPAIR_OPTIONS.map((option) => {
                        const selected = form.selectedRepairs.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setForm({
                                ...form,
                                selectedRepairs: selected
                                  ? form.selectedRepairs.filter((t: string) => t !== option)
                                  : [...form.selectedRepairs, option],
                              });
                            }}
                            className={`text-left text-[11px] p-2 rounded-lg border transition-all flex items-center justify-between ${
                              selected
                                ? "bg-primary/10 border-primary text-primary font-medium"
                                : "bg-background border-border text-muted-foreground hover:bg-muted/30"
                            }`}
                          >
                            <span>{option}</span>
                            {selected && <span className="text-primary text-[10px]">✔</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full h-11 font-semibold" disabled={loading || !activeStoreId}>
                {loading ? "Salvando..." : form.needsRepair ? "Cadastrar e Enviar para Reparo" : "Cadastrar Aparelho"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {inStock.length > 0 ? (
        <div className="space-y-2">
          {inStock.map((p) => {
            const margin = p.sale_price ? Number(p.sale_price) - Number(p.cost_price) : null;
            const conditionLabel =
              p.condition === "new" ? "Novo"
              : p.condition === "refurbished" ? "Recondicionado"
              : p.condition === "seminovo_americano" ? "Seminovo (Americano)"
              : "Usado";
            return (
              <Card key={p.id} className="border-border/50 shadow-lg shadow-black/10">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{p.name}</p>
                        <Badge className={`text-[10px] ${statusColors[p.status]}`}>
                          {statusLabels[p.status] || p.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {p.brand} · {p.model} {p.capacity && `· ${p.capacity}`} {p.color && `· ${p.color}`}{" "}
                        {(p as any).battery_percentage && `· 🔋 ${(p as any).battery_percentage}%`} · {conditionLabel}
                        {p.imei && ` · IMEI: ${p.imei}`}
                      </p>
                      {p.notes && (
                        <p className="text-[11px] bg-muted/40 text-muted-foreground border border-border/40 px-2 py-1 rounded-md mt-1.5 inline-block">
                          📝 {p.notes}
                        </p>
                      )}
                      {p.defects && p.defects.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {p.defects.map((def: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-[10px] bg-destructive/10 text-destructive border-destructive/20 font-medium">
                              ⚠️ {def}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {activeStoreId === "all" && (
                        <Badge variant="outline" className="text-[9px] mt-1 bg-muted/50 border-primary/20 text-primary">
                          {storeMap.get(p.store_id) || "—"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      {(() => {
                        const repairCost = repairCostsMap.get(p.id) || 0;
                        const baseDeviceCost = Number(p.cost_price || 0) - repairCost;
                        return (
                          <div className="text-right">
                            <p className="text-[10px] text-muted-foreground">Custo</p>
                            <p className="font-display font-bold text-sm">{formatCurrency(baseDeviceCost)}</p>
                            {repairCost > 0 && (
                              <p className="text-[11px] font-bold text-emerald-500 font-display">
                                +{formatCurrency(repairCost)}
                              </p>
                            )}
                            {margin !== null && (
                              <p className={`text-[10px] font-semibold mt-1 border-t border-border/30 pt-0.5 ${margin >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                                Margem: {margin >= 0 ? "+" : ""}{formatCurrency(margin)}
                              </p>
                            )}
                          </div>
                        );
                      })()}
                      {p.sale_price !== null && p.sale_price !== undefined && (
                        <div className="text-right border-t border-border/30 pt-1.5 w-full">
                          <p className="text-[10px] text-muted-foreground">Venda</p>
                          <p className="font-display font-bold text-sm text-primary">{formatCurrency(Number(p.sale_price))}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-border/30 w-full">
                    {p.status === "in_stock" && stores.length > 1 && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-border bg-background shadow-none"
                        onClick={() => { setTransferProduct(p); setTransferDialogOpen(true); }}>
                        <ArrowRightLeft className="h-3 w-3" /> Transferir
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-border bg-background shadow-none" onClick={() => loadHistory(p)}>
                      Histórico
                    </Button>
                    {(p.status === "in_stock" || p.status === "repair") && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-primary/20 text-primary hover:bg-primary/5 bg-primary/5 shadow-none"
                        onClick={() => { setRepairProduct(p as any); setRepairModalOpen(true); }}>
                        <Wrench className="h-3 w-3" /> Reparo
                      </Button>
                    )}
                    {(p.status === "in_stock" || p.status === "repair") && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 border-destructive/20 text-destructive hover:bg-destructive/5 bg-destructive/5 shadow-none"
                        onClick={() => {
                          setDefectsProduct(p);
                          setDefectsList(p.defects || []);
                          setCustomDefect("");
                          setDefectsDialogOpen(true);
                        }}>
                        <AlertTriangle className="h-3 w-3" /> Defeitos
                        {p.defects && p.defects.length > 0 && (
                          <span className="ml-0.5 px-1 py-0.5 text-[8px] bg-destructive text-destructive-foreground rounded-full leading-none font-bold">
                            {p.defects.length}
                          </span>
                        )}
                      </Button>
                    )}
                    <div className="flex-1 min-w-[8px]" />
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-border bg-background shadow-none text-muted-foreground hover:text-foreground" onClick={() => openEditProduct(p)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 w-7 p-0 border-destructive/20 text-destructive hover:bg-destructive/5 bg-background shadow-none"
                        onClick={() => { setDeleteId(p.id); setDeleteType("product"); setJustification(""); setDeleteDialogOpen(true); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Package className="h-10 w-10 mb-3 opacity-30" />
            <p className="font-medium text-sm">Nenhum aparelho encontrado</p>
          </CardContent>
        </Card>
      )}
    </>
  );
};
