import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Plus, Trash2, Loader2, Cpu, ChevronDown, ChevronUp, Image, Upload, X } from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  brand: string;
  model: string;
  cost_price: number;
  sale_price: number | null;
}

interface ServiceOrderItem {
  id: string;
  service_order_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  created_at: string;
  receipt_url?: string | null;
  supplier_id?: string | null;
  supplier_name?: string | null;
  products?: {
    name: string;
    brand: string;
    model: string;
  };
}

interface Supplier {
  id: string;
  name: string;
}

interface OsPartsProps {
  orderId: string;
  storeId: string;
  readonly?: boolean;
}

const formatMonetary = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

export function OsParts({ orderId, storeId, readonly = false }: OsPartsProps) {
  const { user } = useAuth();
  const [items, setItems] = useState<ServiceOrderItem[]>([]);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [stockSupplierId, setStockSupplierId] = useState<string>("");

  // Mode: "stock" = select from stock | "new" = register new part
  const [addMode, setAddMode] = useState<"stock" | "new">("stock");

  // New part inline form
  const [newPart, setNewPart] = useState({
    name: "",
    brand: "",
    model: "",
    cost_price: "",
    sale_price: "",
    supplier_id: "",
    receipt: null as File | null,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data: itemsData, error: itemsError } = await supabase
        .from("service_order_items" as any)
        .select(`*, products (name, brand, model)`)
        .eq("service_order_id", orderId);

      if (itemsError) throw itemsError;
      setItems((itemsData as unknown as ServiceOrderItem[]) || []);

      if (!readonly && storeId) {
        const { data: productsData, error: productsError } = await (supabase
          .from("products")
          .select("id, name, brand, model, cost_price, sale_price, supplier_id, supplier_name") as any)
          .eq("store_id", storeId)
          .eq("status", "in_stock")
          .in("product_type", ["peca", "acessorio", "outro"]);

        if (productsError) throw productsError;
        setAvailableProducts(productsData || []);
      }

      // Fetch suppliers
      const { data: suppData } = await (supabase
        .from("suppliers" as any)
        .select("id, name")
        .order("name") as any);
      setSuppliers(suppData || []);
    } catch (error: any) {
      console.error("Error fetching parts:", error);
      toast.error("Erro ao carregar peças da OS");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (orderId) fetchData();
  }, [orderId, storeId, readonly]);

  const uploadReceipt = async (file: File, prefix: string): Promise<string | null> => {
    const safeName = `${prefix}-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
    const { data, error } = await supabase.storage
      .from("comprovantes")
      .upload(`pecas/${safeName}`, file, { upsert: true });
    if (error) { toast.error("Erro no upload: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleAddFromStock = async () => {
    if (!selectedProductId) return;
    const product = availableProducts.find(p => p.id === selectedProductId);
    if (!product) return;

    setAdding(true);
    try {
      // Optimistic lock: mark product as sold
      const { error: prodError } = await supabase
        .from("products")
        .update({ status: "sold" })
        .eq("id", selectedProductId)
        .eq("status", "in_stock");

      if (prodError) throw new Error("Erro ao baixar produto do estoque.");

      const resolvedSupplierId = (product as any).supplier_id || null;
      const supplierName = (product as any).supplier_name || null;

      const { error: itemError } = await supabase
        .from("service_order_items" as any)
        .insert({
          service_order_id: orderId,
          product_id: selectedProductId,
          quantity: 1,
          unit_price: product.sale_price || product.cost_price * 1.5,
          unit_cost: product.cost_price,
          supplier_id: resolvedSupplierId,
          supplier_name: supplierName,
        });

      if (itemError) {
        await supabase.from("products").update({ status: "in_stock" }).eq("id", selectedProductId);
        throw itemError;
      }

      toast.success("Peça vinculada e baixada do estoque.");
      setSelectedProductId("");
      setStockSupplierId("");
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao adicionar peça.");
    } finally {
      setAdding(false);
    }
  };

  const handleAddNewPart = async () => {
    if (!newPart.name || !newPart.cost_price) {
      toast.error("Nome e custo da peça são obrigatórios.");
      return;
    }
    if (!user) return;

    setAdding(true);
    try {
      // 1. Upload receipt if provided
      let receiptUrl: string | null = null;
      if (newPart.receipt) {
        receiptUrl = await uploadReceipt(newPart.receipt, `os-${orderId.slice(0, 8)}`);
      }

      const costPrice = parseFloat(newPart.cost_price) || 0;
      const salePrice = parseFloat(newPart.sale_price) || costPrice * 1.5;
      const resolvedSupplierId = (!newPart.supplier_id || newPart.supplier_id === "none") ? null : newPart.supplier_id;
      const supplierName = resolvedSupplierId ? (suppliers.find(s => s.id === resolvedSupplierId)?.name || null) : null;

      // 2. Insert product into stock with status=sold (keeps history, not phantom)
      const { data: prodData, error: prodError } = await supabase
        .from("products")
        .insert({
          store_id: storeId,
          name: newPart.name,
          brand: newPart.brand || "Genérico",
          model: newPart.model || newPart.name,
          cost_price: costPrice,
          sale_price: salePrice,
          status: "sold",           // Already used — not going through stock flow
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

      // 3. Insert into service_order_items with receipt and supplier
      const { error: itemError } = await supabase
        .from("service_order_items" as any)
        .insert({
          service_order_id: orderId,
          product_id: (prodData as any).id,
          quantity: 1,
          unit_price: salePrice,
          unit_cost: costPrice,
          receipt_url: receiptUrl,
          supplier_id: resolvedSupplierId,
          supplier_name: supplierName,
        });

      if (itemError) throw itemError;

      // 4. Automatic cash out and transaction entry
      let { data: register } = await supabase
        .from("cash_registers" as any)
        .select("id")
        .eq("store_id", storeId)
        .eq("status", "open")
        .eq("opened_by", user.id)
        .maybeSingle();

      if (!register) {
        const { data: fallbackRegister } = await supabase
          .from("cash_registers" as any)
          .select("id")
          .eq("store_id", storeId)
          .eq("status", "open")
          .limit(1)
          .maybeSingle();
        register = fallbackRegister;
      }
      
      const registerId = register ? (register as any).id : null;
      const desc = `Compra de Peça Avulsa (OS): ${newPart.name.trim()}${supplierName ? ` [Fornecedor: ${supplierName}]` : ""}`;
      const hasReceipt = !!receiptUrl;

      if (registerId) {
        await supabase.from("cash_entries" as any).insert({
          register_id: registerId,
          type: "saida",
          amount: costPrice,
          description: desc,
          payment_method: "pix",
          confirmed: hasReceipt,
          receipt_url: receiptUrl || null,
          created_by: user.id,
        } as any);
      }

      await supabase.from("transactions").insert({
        type: "expense_pj",
        amount: costPrice,
        net_amount: costPrice,
        description: desc,
        net_earnings: -costPrice,
        category: "reparo",
        payment_method: "pix",
        status: hasReceipt ? "completed" : "pending",
        store_id: storeId,
        created_by: user.id,
        receipt_url: receiptUrl || null,
      } as any);

      toast.success("Peça cadastrada no estoque, vinculada à OS e lançada no caixa!");
      setNewPart({ name: "", brand: "", model: "", cost_price: "", sale_price: "", supplier_id: "", receipt: null });
      setAddMode("stock");
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao cadastrar peça.");
    } finally {
      setAdding(false);
    }
  };

  const handleRemovePart = async (itemId: string, productId: string) => {
    try {
      const { error: itemError } = await supabase
        .from("service_order_items" as any)
        .delete()
        .eq("id", itemId);

      if (itemError) throw itemError;

      // Return to stock only if it was an in-stock product
      await supabase
        .from("products")
        .update({ status: "in_stock" })
        .eq("id", productId)
        .eq("status", "sold");

      toast.success("Peça removida e retornada ao estoque.");
      fetchData();
    } catch (error: any) {
      toast.error(error.message || "Erro ao remover peça.");
    }
  };

  if (loading) return <div className="text-muted-foreground text-xs"><Loader2 className="h-4 w-4 animate-spin" /></div>;

  const totalCost = items.reduce((acc, item) => acc + (item.unit_cost * item.quantity), 0);
  const totalCharge = items.reduce((acc, item) => acc + (item.unit_price * item.quantity), 0);

  return (
    <div className="space-y-4 rounded-lg bg-card border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide flex items-center gap-1.5">
          <Cpu className="h-3.5 w-3.5" /> Peças Utilizadas ({items.length})
        </p>
      </div>

      {!readonly && (
        <div className="space-y-3">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-lg bg-muted/30 border border-border/50">
            <button
              type="button"
              onClick={() => setAddMode("stock")}
              className={`flex-1 text-[10px] py-1.5 rounded-md font-medium transition-all ${addMode === "stock" ? "bg-background shadow border border-border/50 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              📦 Do Estoque
            </button>
            <button
              type="button"
              onClick={() => setAddMode("new")}
              className={`flex-1 text-[10px] py-1.5 rounded-md font-medium transition-all ${addMode === "new" ? "bg-background shadow border border-border/50 text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
            </button>
          </div>

          {addMode === "stock" ? (
            /* ── Select from stock ──────────────────────────── */
            <div className="bg-muted/20 p-3 rounded-lg border border-border/50 space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-[10px] uppercase">Vincular Peça do Estoque</Label>
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger className="h-8 text-xs bg-background">
                      <SelectValue placeholder="Selecione uma peça em estoque..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProducts.length === 0 ? (
                        <SelectItem value="none" disabled className="text-xs">Nenhuma peça (product_type: peça) no estoque.</SelectItem>
                      ) : (
                        availableProducts.map(p => (
                          <SelectItem key={p.id} value={p.id} className="text-xs">
                            {p.name} {p.brand} {p.model} — Custo: {formatMonetary(p.cost_price)}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="h-8 shrink-0 px-3"
                  onClick={handleAddFromStock}
                  disabled={!selectedProductId || selectedProductId === "none" || adding}
                >
                  {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          ) : (
            /* ── New part inline form ───────────────────────── */
            <div className="bg-muted/20 p-3 rounded-lg border border-primary/20 space-y-3">
              <p className="text-[10px] uppercase font-semibold text-primary tracking-wide flex items-center gap-1">
                <Plus className="h-3 w-3" /> Cadastrar Nova Peça
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px]">Nome da Peça *</Label>
                  <Input
                    value={newPart.name}
                    onChange={e => setNewPart(p => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Tela iPhone 13"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Marca / Fabricante</Label>
                  <Input
                    value={newPart.brand}
                    onChange={e => setNewPart(p => ({ ...p, brand: e.target.value }))}
                    placeholder="Apple, Samsung..."
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Modelo</Label>
                  <Input
                    value={newPart.model}
                    onChange={e => setNewPart(p => ({ ...p, model: e.target.value }))}
                    placeholder="iPhone 13 Pro"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Custo (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newPart.cost_price}
                    onChange={e => setNewPart(p => ({ ...p, cost_price: e.target.value }))}
                    placeholder="0.00"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px]">Valor Cobrado (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={newPart.sale_price}
                    onChange={e => setNewPart(p => ({ ...p, sale_price: e.target.value }))}
                    placeholder="0.00 (auto)"
                    className="h-8 text-xs"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Fornecedor da Peça</Label>
                  <Select value={newPart.supplier_id} onValueChange={v => setNewPart(p => ({ ...p, supplier_id: v }))}>
                    <SelectTrigger className="h-8 text-xs bg-background">
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
              </div>

              {/* Receipt upload */}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wide">Comprovante de Pagamento</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={e => setNewPart(p => ({ ...p, receipt: e.target.files?.[0] || null }))}
                />
                {newPart.receipt ? (
                  <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2 text-xs">
                    <Image className="h-4 w-4 text-primary shrink-0" />
                    <span className="flex-1 truncate text-primary">{newPart.receipt.name}</span>
                    <button
                      type="button"
                      onClick={() => setNewPart(p => ({ ...p, receipt: null }))}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-8 text-xs gap-1.5 border-dashed"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Anexar comprovante (imagem ou PDF)
                  </Button>
                )}
              </div>

              <Button
                className="w-full h-8 text-xs"
                onClick={handleAddNewPart}
                disabled={adding || !newPart.name || !newPart.cost_price}
              >
                {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Salvar Peça na OS e no Estoque
              </Button>
            </div>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-4 border border-dashed rounded bg-muted/10 text-muted-foreground">
          <Package className="h-5 w-5 mx-auto opacity-30 mb-1" />
          <p className="text-[10px]">Nenhuma peça vinculada.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between text-xs p-2 rounded border border-border/50 bg-background group">
              <div className="flex-1 min-w-0">
                <p className="font-medium">{item.products?.name} {item.products?.brand}</p>
                <p className="text-[10px] text-muted-foreground">Custo: {formatMonetary(item.unit_cost)} · Cobrado: {formatMonetary(item.unit_price)}</p>
                {(item as any).supplier_name && (
                  <p className="text-[10px] text-blue-500 font-medium mt-0.5">🏭 Fornecedor: {(item as any).supplier_name}</p>
                )}
                {(item as any).receipt_url && (
                  <a
                    href={(item as any).receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] text-primary underline flex items-center gap-0.5 mt-0.5"
                  >
                    <Image className="h-2.5 w-2.5" /> Ver comprovante
                  </a>
                )}
              </div>

              {!readonly && (
                <Button
                  className="h-6 w-6 p-0 text-destructive bg-transparent hover:bg-destructive/10 border-0 opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
                  onClick={() => handleRemovePart(item.id, item.product_id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          ))}

          <div className="flex justify-between items-center text-[10px] bg-muted/50 p-2 rounded-md font-semibold text-muted-foreground">
            <span>Total Custo Peças: {formatMonetary(totalCost)}</span>
            <span>Repasse: {formatMonetary(totalCharge)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
