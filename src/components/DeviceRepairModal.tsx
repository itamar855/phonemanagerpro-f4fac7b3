import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Wrench, Plus, Trash2, Loader2, Camera, Upload, Receipt, CheckCircle, Cpu, FileText, Smartphone, Image as LucideImage, X } from "lucide-react";
import { logAction } from "@/utils/auditLogger";

interface Supplier {
  id: string;
  name: string;
}

const REPAIR_OPTIONS = [
  "Troca de Tela",
  "Troca de Bateria",
  "Conector de Carga",
  "Reparo de Carcaça/Tampa Traseira",
  "Câmera (Traseira/Frontal)",
  "Reparo de Placa (Micro Soldagem)",
  "Botões/Biometria",
  "Desoxidação (Contato com água)",
  "Outro Reparo"
];

interface Product {
  id: string;
  name: string;
  brand: string;
  model: string;
  cost_price: number;
  status: string;
  store_id: string;
}

interface DeviceRepairModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DeviceRepairModal({ product, isOpen, onClose, onSuccess }: DeviceRepairModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeRepair, setActiveRepair] = useState<any>(null);
  const [repairItems, setRepairItems] = useState<any[]>([]);
  const [availableParts, setAvailableParts] = useState<any[]>([]);
  
  // Form states for creating repair
  const [selectedRepairs, setSelectedRepairs] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");

  // Manual (avulsa) part entry
  const [addMode, setAddMode] = useState<'stock' | 'manual'>('stock');
  const [manualPartName, setManualPartName] = useState("");
  const [manualPartCost, setManualPartCost] = useState("");
  const [manualPartSupplierId, setManualPartSupplierId] = useState("");
  const [stockPartSupplierId, setStockPartSupplierId] = useState("");
  const [manualPartReceipt, setManualPartReceipt] = useState<File | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Voucher upload states
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputPartsRef = useRef<HTMLInputElement>(null);
  const fileInputManualPartRef = useRef<HTMLInputElement>(null);
  const [uploadingVoucher, setUploadingVoucher] = useState<'device' | 'parts' | null>(null);

  useEffect(() => {
    if (isOpen && product) {
      fetchRepairData();
    } else {
      setActiveRepair(null);
      setRepairItems([]);
      setSelectedRepairs([]);
      setNotes("");
      setSelectedPartId("");
      setManualPartName("");
      setManualPartCost("");
      setManualPartSupplierId("");
      setStockPartSupplierId("");
      setManualPartReceipt(null);
      setAddMode('stock');
      setSuppliers([]);
    }
  }, [isOpen, product]);

  const fetchRepairData = async () => {
    if (!product) return;
    setLoading(true);
    try {
      // 1. Fetch active repair if any
      const { data: repairData, error: repairError } = await (supabase
        .from("product_repairs" as any)
        .select("*") as any)
        .eq("product_id", product.id)
        .eq("status", "pending")
        .maybeSingle();

      if (repairError) throw repairError;
      setActiveRepair(repairData);

      if (repairData) {
        // 2. Fetch parts used in this repair
        const { data: itemsData, error: itemsError } = await (supabase
          .from("product_repair_items" as any)
          .select(`*`) as any)
          .eq("repair_id", repairData.id);

        if (itemsError) throw itemsError;
        setRepairItems(itemsData || []);
      }

      // 3. Fetch available parts/accessories in stock for this store
      const { data: partsData, error: partsError } = await supabase
        .from("products")
        .select("id, name, brand, model, cost_price, supplier_id, supplier_name")
        .eq("store_id", product.store_id)
        .eq("status", "in_stock")
        .in("product_type", ["peca", "acessorio", "outro"]);

      if (partsError) throw partsError;
      setAvailableParts(partsData || []);

      // Fetch suppliers
      const { data: suppData } = await (supabase
        .from("suppliers" as any)
        .select("id, name")
        .order("name") as any);
      setSuppliers(suppData || []);
    } catch (err: any) {
      console.error("Error fetching repair details:", err);
      toast.error("Erro ao carregar dados do reparo: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRepairType = (type: string) => {
    setSelectedRepairs(prev => 
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const handleStartRepair = async () => {
    if (!product || !user) return;
    if (selectedRepairs.length === 0) {
      toast.error("Selecione pelo menos um tipo de reparo.");
      return;
    }

    setLoading(true);
    try {
      // 1. Insert repair record
      const { data: repair, error: repairError } = await supabase
        .from("product_repairs" as any)
        .insert({
          product_id: product.id,
          store_id: product.store_id,
          repair_types: selectedRepairs,
          notes: notes || null,
          status: "pending",
          created_by: user.id
        })
        .select()
        .single();

      if (repairError) throw repairError;

      // 2. Update product status to 'repair'
      const { error: prodError } = await supabase
        .from("products")
        .update({ status: "repair" })
        .eq("id", product.id);

      if (prodError) throw prodError;

      // Log audit
      await logAction("CREATE_RECORD", "product_repairs", (repair as any).id, null, { repair_types: selectedRepairs }, product.store_id);

      toast.success("Reparo iniciado com sucesso!");
      fetchRepairData();
      onSuccess();
    } catch (err: any) {
      toast.error("Erro ao iniciar reparo: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const uploadReceipt = async (file: File, prefix: string): Promise<string | null> => {
    const safeName = `${prefix}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { data, error } = await supabase.storage
      .from("comprovantes")
      .upload(`pecas/${safeName}`, file, { upsert: true });
    if (error) { toast.error("Erro no upload: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleAddPart = async () => {
    if (!activeRepair || !selectedPartId) return;
    const part = availableParts.find(p => p.id === selectedPartId);
    if (!part) return;

    setLoading(true);
    try {
      const resolvedSupplierId = part.supplier_id || null;
      const supplierName = part.supplier_name || null;

      // 1. Add item to repair list
      const { error: itemError } = await supabase
        .from("product_repair_items" as any)
        .insert({
          repair_id: activeRepair.id,
          part_product_id: selectedPartId,
          part_name: part.name,
          quantity: 1,
          unit_cost: part.cost_price,
          supplier_id: resolvedSupplierId,
          supplier_name: supplierName,
        });

      if (itemError) throw itemError;

      // 2. Set part status to sold/used
      const { error: partError } = await supabase
        .from("products")
        .update({ status: "sold" })
        .eq("id", selectedPartId);

      if (partError) throw partError;

      // 3. Update device cost price
      const { data: currentProduct, error: getProductError } = await supabase
        .from("products")
        .select("cost_price")
        .eq("id", product.id)
        .single();
      if (getProductError) throw getProductError;

      const currentCost = Number(currentProduct?.cost_price || 0);
      const newCost = currentCost + Number(part.cost_price);

      const { error: updateCostError } = await supabase
        .from("products")
        .update({ cost_price: newCost })
        .eq("id", product.id);
      if (updateCostError) throw updateCostError;

      toast.success("Peça vinculada, dada baixa do estoque e custo do aparelho atualizado.");
      setSelectedPartId("");
      setStockPartSupplierId("");
      fetchRepairData();
      onSuccess();
    } catch (err: any) {
      toast.error("Erro ao vincular peça: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddManualPart = async () => {
    if (!activeRepair || !product || !user) return;
    if (!manualPartName.trim() || !manualPartCost) {
      toast.error("Nome e custo da peça são obrigatórios.");
      return;
    }
    const cost = parseFloat(manualPartCost);
    if (isNaN(cost) || cost < 0) { toast.error("Informe um custo válido."); return; }

    setLoading(true);
    try {
      // 1. Upload receipt if any
      let receiptUrl: string | null = null;
      if (manualPartReceipt) {
        receiptUrl = await uploadReceipt(manualPartReceipt, `internal-${activeRepair.id.slice(0, 8)}`);
      }

      const resolvedSupplierId = manualPartSupplierId && manualPartSupplierId !== 'none' ? manualPartSupplierId : null;
      const supplierName = resolvedSupplierId ? (suppliers.find(s => s.id === resolvedSupplierId)?.name || null) : null;

      // 2. Insert product into stock with status=sold (keeps history, not phantom)
      const { data: prodData, error: prodError } = await supabase
        .from("products")
        .insert({
          store_id: product.store_id,
          name: manualPartName.trim(),
          brand: "Genérico",
          model: manualPartName.trim(),
          cost_price: cost,
          sale_price: cost * 1.5,
          status: "sold", // Already used
          product_type: "peca",
          condition: "new",
          created_by: user.id,
          supplier_id: resolvedSupplierId,
          supplier_name: supplierName,
          parts_payment_voucher: receiptUrl || null,
        } as any)
        .select()
        .single();

      if (prodError) throw prodError;

      // 2.5 Update device cost price
      const { data: currentProduct, error: getProductError } = await supabase
        .from("products")
        .select("cost_price")
        .eq("id", product.id)
        .single();
      if (getProductError) throw getProductError;

      const currentCost = Number(currentProduct?.cost_price || 0);
      const newCost = currentCost + cost;

      const { error: updateCostError } = await supabase
        .from("products")
        .update({ cost_price: newCost })
        .eq("id", product.id);
      if (updateCostError) throw updateCostError;

      // 3. Add item to repair list referencing the created product
      const { error: itemError } = await supabase
        .from("product_repair_items" as any)
        .insert({
          repair_id: activeRepair.id,
          part_product_id: (prodData as any).id,
          part_name: manualPartName.trim(),
          quantity: 1,
          unit_cost: cost,
          supplier_id: resolvedSupplierId,
          supplier_name: supplierName,
        });

      if (itemError) throw itemError;

      // 4. Automatic cash out and transaction entry
      let { data: register } = await supabase
        .from("cash_registers" as any)
        .select("id")
        .eq("store_id", product.store_id)
        .eq("status", "open")
        .eq("opened_by", user.id)
        .maybeSingle();

      if (!register) {
        const { data: fallbackRegister } = await supabase
          .from("cash_registers" as any)
          .select("id")
          .eq("store_id", product.store_id)
          .eq("status", "open")
          .limit(1)
          .maybeSingle();
        register = fallbackRegister;
      }
      
      const registerId = register ? (register as any).id : null;
      const desc = `Compra de Peça Avulsa (Reparo Interno): ${manualPartName.trim()}${supplierName ? ` [Fornecedor: ${supplierName}]` : ""}`;
      const hasReceipt = !!receiptUrl;

      if (registerId) {
        await supabase.from("cash_entries" as any).insert({
          cash_register_id: registerId,
          store_id: product.store_id,
          type: "saida",
          amount: cost,
          description: desc,
          payment_method: "pix",
          confirmed: hasReceipt,
          receipt_url: receiptUrl || null,
          created_by: user.id,
        } as any);
      }

      await supabase.from("transactions").insert({
        type: "expense_pj",
        amount: cost,
        net_amount: cost,
        description: desc,
        net_earnings: -cost,
        category: "reparo",
        payment_method: "pix",
        status: hasReceipt ? "completed" : "pending",
        store_id: product.store_id,
        created_by: user.id,
        receipt_url: receiptUrl || null,
      } as any);

      toast.success("Peça avulsa cadastrada, custo do aparelho atualizado e saída registrada!");
      setManualPartName("");
      setManualPartCost("");
      setManualPartSupplierId("");
      setManualPartReceipt(null);
      fetchRepairData();
      onSuccess();
    } catch (err: any) {
      toast.error("Erro ao adicionar peça: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePart = async (itemId: string, partProductId: string) => {
    setLoading(true);
    try {
      // 0. Get the unit_cost of the item being removed
      const { data: itemData, error: getItemError } = await (supabase
        .from("product_repair_items" as any)
        .select("unit_cost")
        .eq("id", itemId)
        .single() as any);
      if (getItemError) throw getItemError;

      const itemCost = Number(itemData?.unit_cost || 0);

      // 1. Delete item
      const { error: itemError } = await supabase
        .from("product_repair_items" as any)
        .delete()
        .eq("id", itemId);

      if (itemError) throw itemError;

      // 2. Revert part status back to in_stock
      const { error: partError } = await supabase
        .from("products")
        .update({ status: "in_stock" })
        .eq("id", partProductId);

      if (partError) throw partError;

      // 3. Decrement device cost price
      const { data: currentProduct, error: getProductError } = await supabase
        .from("products")
        .select("cost_price")
        .eq("id", product.id)
        .single();
      if (getProductError) throw getProductError;

      const currentCost = Number(currentProduct?.cost_price || 0);
      const newCost = Math.max(0, currentCost - itemCost);

      const { error: updateCostError } = await supabase
        .from("products")
        .update({ cost_price: newCost })
        .eq("id", product.id);
      if (updateCostError) throw updateCostError;

      toast.success("Peça removida do reparo, retornada ao estoque e custo do aparelho atualizado.");
      fetchRepairData();
      onSuccess();
    } catch (err: any) {
      toast.error("Erro ao remover peça: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUploadVoucher = async (e: React.ChangeEvent<HTMLInputElement>, type: 'device' | 'parts') => {
    const file = e.target.files?.[0];
    if (!file || !product) return;

    setUploadingVoucher(type);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `reparos/${product.id}-${type}-${Date.now()}-${safeName}`;

      const { data, error } = await supabase.storage.from("comprovantes").upload(path, file, { upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(data.path);
      const publicUrl = urlData.publicUrl;

      // Update database
      const updatePayload: any = {};
      if (type === 'device') {
        updatePayload.device_payment_voucher = publicUrl;
      } else {
        updatePayload.parts_payment_voucher = publicUrl;
      }

      const { error: dbError } = await supabase
        .from("products")
        .update(updatePayload)
        .eq("id", product.id);

      if (dbError) throw dbError;

      toast.success("Comprovante enviado com sucesso!");
      fetchRepairData();
      onSuccess();
    } catch (err: any) {
      toast.error("Erro no upload do comprovante: " + err.message);
    } finally {
      setUploadingVoucher(null);
    }
  };

  const handleFinishRepair = async () => {
    if (!activeRepair || !product) return;
    setLoading(true);

    try {
      // 1. Update repair status to completed
      const { error: repairError } = await supabase
        .from("product_repairs" as any)
        .update({
          status: "completed",
          completed_at: new Date().toISOString()
        })
        .eq("id", activeRepair.id);

      if (repairError) throw repairError;

      // 2. Update product status to in_stock
      const { error: prodError } = await supabase
        .from("products")
        .update({ status: "in_stock" })
        .eq("id", product.id);

      if (prodError) throw prodError;

      await logAction("UPDATE_RECORD", "product_repairs", activeRepair.id, null, { status: "completed" }, product.store_id);

      toast.success("Reparo finalizado! Aparelho retornou ao estoque com o custo recalculado.");
      onClose();
      onSuccess();
    } catch (err: any) {
      toast.error("Erro ao finalizar reparo: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto font-sans">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-lg font-bold">
            <Wrench className="h-5 w-5 text-primary" /> 
            {activeRepair ? "Gerenciar Reparo Ativo" : "Iniciar Reparo no Aparelho"}
          </DialogTitle>
        </DialogHeader>

        {product && (
          <div className="space-y-4 py-2">
            {/* Detalhes do Aparelho */}
            <div className="rounded-xl bg-muted/40 border border-border p-4 flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <Smartphone className="h-3.5 w-3.5" /> Informações do Aparelho
                </p>
                <h4 className="font-bold text-sm text-foreground">{product.name}</h4>
                <p className="text-xs text-muted-foreground">{product.brand} · {product.model}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase font-bold text-muted-foreground">Preço de Custo Total</p>
                <p className="text-lg font-black text-primary tracking-tight">{formatCurrency(product.cost_price)}</p>
              </div>
            </div>

            {/* SE NÃO HÁ REPARO ATIVO (Iniciar Novo) */}
            {!activeRepair ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-foreground">Tipos de Reparo Necessários (Seleção Múltipla)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {REPAIR_OPTIONS.map(option => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => handleToggleRepairType(option)}
                        className={`text-left text-xs p-2.5 rounded-lg border transition-all flex items-center justify-between ${
                          selectedRepairs.includes(option)
                            ? "bg-primary/10 border-primary text-primary font-semibold"
                            : "bg-background border-border text-muted-foreground hover:bg-muted/30"
                        }`}
                      >
                        {option}
                        {selectedRepairs.includes(option) && <CheckCircle className="h-3.5 w-3.5 shrink-0" />}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Observações / Laudo Técnico</Label>
                  <Textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Adicione detalhes sobre o estado do aparelho ou o que deve ser feito..."
                    className="min-h-[80px]"
                  />
                </div>

                <Button 
                  className="w-full h-11 font-bold text-sm" 
                  onClick={handleStartRepair}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wrench className="h-4 w-4 mr-2" />}
                  Confirmar e Enviar para Reparo
                </Button>
              </div>
            ) : (
              // SE HÁ REPARO ATIVO (Gerenciar Peças e Vouchers)
              <div className="space-y-4">
                {/* Tipos de Reparo Ativos */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">Reparos Solicitados</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeRepair.repair_types.map((type: string) => (
                      <span key={type} className="text-[10px] font-bold bg-primary/15 text-primary border border-primary/20 px-2 py-0.5 rounded">
                        {type}
                      </span>
                    ))}
                  </div>
                  {activeRepair.notes && (
                    <p className="text-xs bg-muted/40 p-2.5 rounded border border-border text-muted-foreground mt-1.5 italic">
                      "{activeRepair.notes}"
                    </p>
                  )}
                </div>

                {/* Seção de Peças */}
                <div className="space-y-3 border border-border rounded-xl p-4 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5">
                      <Cpu className="h-4 w-4" /> Peças Utilizadas
                    </p>
                    {/* Toggle Estoque / Avulso */}
                    <div className="flex rounded-lg border border-border overflow-hidden text-[10px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setAddMode('stock')}
                        className={`px-2.5 py-1 transition-colors ${
                          addMode === 'stock'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        Do Estoque
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddMode('manual')}
                        className={`px-2.5 py-1 transition-colors border-l border-border ${
                          addMode === 'manual'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-background text-muted-foreground hover:bg-muted/50'
                        }`}
                      >
                        </button>
                    </div>
                  </div>

                  {addMode === 'stock' ? (
                    <>
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-[10px] uppercase font-semibold text-muted-foreground">Peça cadastrada no Estoque</Label>
                          <Select value={selectedPartId} onValueChange={setSelectedPartId}>
                            <SelectTrigger className="h-9 text-xs bg-background">
                              <SelectValue placeholder="Selecione uma peça..." />
                            </SelectTrigger>
                            <SelectContent>
                              {availableParts.length === 0 ? (
                                <SelectItem value="none" disabled className="text-xs">Nenhuma peça em estoque nesta loja.</SelectItem>
                              ) : (
                                availableParts.map(p => (
                                  <SelectItem key={p.id} value={p.id} className="text-xs">
                                    {p.name} {p.brand} {p.model} — {formatCurrency(p.cost_price)}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          className="h-9 px-3"
                          onClick={handleAddPart}
                          disabled={!selectedPartId || selectedPartId === "none" || loading}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase font-semibold text-muted-foreground">Peça avulsa (cadastra e dá baixa automática)</Label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={manualPartName}
                            onChange={e => setManualPartName(e.target.value)}
                            placeholder="Nome da peça (ex: Tela iPhone 13)"
                            className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={manualPartCost}
                            onChange={e => setManualPartCost(e.target.value)}
                            placeholder="R$ Custo"
                            className="w-24 h-9 rounded-md border border-input bg-background px-3 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                          <Button
                            className="h-9 px-3 shrink-0"
                            onClick={handleAddManualPart}
                            disabled={!manualPartName.trim() || !manualPartCost || loading}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        {/* Supplier for manual part */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-semibold text-muted-foreground">Fornecedor (opcional)</label>
                          <Select value={manualPartSupplierId} onValueChange={setManualPartSupplierId}>
                            <SelectTrigger className="h-9 text-xs bg-background">
                              <SelectValue placeholder="Selecione o fornecedor..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-xs">— Sem fornecedor —</SelectItem>
                              {suppliers.map(s => (
                                <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Comprovante para peça avulsa */}
                        <div className="space-y-1.5">
                          <label className="text-[10px] uppercase font-semibold text-muted-foreground">Comprovante de Pagamento (opcional)</label>
                          <input
                            ref={fileInputManualPartRef}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={e => setManualPartReceipt(e.target.files?.[0] || null)}
                          />
                          {manualPartReceipt ? (
                            <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
                              <LucideImage className="h-4 w-4 text-primary shrink-0" />
                              <span className="flex-1 truncate text-primary">{manualPartReceipt.name}</span>
                              <button
                                type="button"
                                onClick={() => setManualPartReceipt(null)}
                                className="text-muted-foreground hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full h-8 text-xs gap-1.5 border-dashed bg-background"
                              onClick={() => fileInputManualPartRef.current?.click()}
                            >
                              <Upload className="h-3.5 w-3.5" />
                              Anexar comprovante (Saída Confirmada no Caixa)
                            </Button>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground">A peça avulsa será cadastrada no estoque com baixa automática e o custo correspondente será lançado no caixa.</p>
                      </div>
                    </>
                  )}

                  {/* Lista de Peças Vinculadas */}
                  {repairItems.length === 0 ? (
                    <div className="text-center py-4 border border-dashed rounded-lg bg-background text-muted-foreground">
                      <p className="text-xs">Nenhuma peça vinculada a este reparo ainda.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {repairItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-xs p-2.5 rounded-lg border border-border bg-background group">
                          <div>
                            <p className="font-semibold text-foreground">{item.part_name}</p>
                            <p className="text-[10px] text-muted-foreground">Custo da Peça: {formatCurrency(item.unit_cost)}</p>
                            {(item as any).supplier_name && (
                              <p className="text-[10px] text-blue-500 font-medium">🏭 {(item as any).supplier_name}</p>
                            )}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => handleRemovePart(item.id, item.part_product_id)}
                            disabled={loading}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Comprovantes de Pagamento */}
                <div className="space-y-2 border border-border rounded-xl p-4 bg-muted/10">
                  <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2">
                    <Receipt className="h-4 w-4" /> Comprovantes de Custos
                  </p>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Comprovante do Aparelho */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-muted-foreground">Comprovante do Aparelho</Label>
                      {(product as any).device_payment_voucher ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-500/10 border border-green-500/20 p-2 rounded-lg font-medium">
                            <CheckCircle className="h-4 w-4 shrink-0" />
                            <span className="truncate">Enviado</span>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1" onClick={() => window.open((product as any).device_payment_voucher, "_blank")}>Ver</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive flex-1" onClick={() => fileInputRef.current?.click()}>Alterar</Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="outline" className="w-full h-9 text-xs gap-1.5 bg-background" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-3.5 w-3.5" /> Enviar Arquivo
                        </Button>
                      )}
                    </div>

                    {/* Comprovante das Peças */}
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-semibold text-muted-foreground">Comprovante das Peças</Label>
                      {(product as any).parts_payment_voucher ? (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-500/10 border border-green-500/20 p-2 rounded-lg font-medium">
                            <CheckCircle className="h-4 w-4 shrink-0" />
                            <span className="truncate">Enviado</span>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="outline" className="h-7 text-[10px] flex-1" onClick={() => window.open((product as any).parts_payment_voucher, "_blank")}>Ver</Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] text-destructive flex-1" onClick={() => fileInputPartsRef.current?.click()}>Alterar</Button>
                          </div>
                        </div>
                      ) : (
                        <Button variant="outline" className="w-full h-9 text-xs gap-1.5 bg-background" onClick={() => fileInputPartsRef.current?.click()}>
                          <Upload className="h-3.5 w-3.5" /> Enviar Arquivo
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Hidden inputs para upload */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => handleUploadVoucher(e, 'device')}
                  />
                  <input
                    ref={fileInputPartsRef}
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => handleUploadVoucher(e, 'parts')}
                  />
                </div>

                {/* Botão de Finalização */}
                <Button 
                  className="w-full h-11 bg-primary text-primary-foreground font-bold hover:bg-primary/90"
                  onClick={handleFinishRepair}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Concluir Reparo e Retornar ao Estoque
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
