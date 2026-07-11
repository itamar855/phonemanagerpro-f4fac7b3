import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Search, Package, ArrowRightLeft, AlertTriangle, Zap, Pencil, Trash2, Store, Wrench, Cpu, Upload, FileText } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { logAction } from "@/utils/auditLogger";
import DeviceRepairModal from "@/components/DeviceRepairModal";
import { AparelhosTable } from "@/components/features/estoque/AparelhosTable";
import { AcessoriosTable } from "@/components/features/estoque/AcessoriosTable";

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

const PREDEFINED_DEFECTS = [
  "Câmera Frontal com defeito",
  "Câmera Traseira com defeito",
  "Tela com manchas/riscos",
  "Touch travando",
  "Bateria viciada",
  "Não carrega",
  "Wi-Fi/Bluetooth com falha",
  "Alto-falante com chiado",
  "Face ID/Touch ID com defeito",
  "Botão Power/Volume com defeito",
  "Vidro traseiro quebrado",
  "Carcaça amassada/riscada"
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const statusLabels: Record<string, string> = {
  in_stock: "Em estoque", sold: "Vendido", reserved: "Reservado", repair: "Em reparo",
};
const statusColors: Record<string, string> = {
  in_stock: "bg-primary/15 text-primary border-primary/20",
  sold: "bg-muted text-muted-foreground border-border",
  reserved: "bg-accent/15 text-accent border-accent/20",
  repair: "bg-destructive/15 text-destructive border-destructive/20",
};

const categoryLabels: Record<string, string> = {
  carregador: "Carregador", cabo: "Cabo", capa: "Capa", pelicula: "Película",
  fone: "Fone", peca: "Peça", ferramenta: "Ferramenta", outro: "Outro",
};

const LOW_STOCK_THRESHOLD = 3;

type Accessory = {
  id: string; store_id: string; name: string; category: string; brand: string | null;
  quantity: number; min_quantity: number; cost_price: number; sale_price: number | null;
  description: string | null; created_by: string; created_at: string; updated_at: string;
};

const Estoque = () => {
  const { user, userRole, activeStoreId, setActiveStoreId } = useAuth();
  const [products, setProducts] = useState<Tables<"products">[]>([]);
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [stores, setStores] = useState<Tables<"stores">[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [accDialogOpen, setAccDialogOpen] = useState(false);
  const [editAcc, setEditAcc] = useState<Accessory | null>(null);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transferProduct, setTransferProduct] = useState<Tables<"products"> | null>(null);
  const [transferStoreId, setTransferStoreId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [editProductOpen, setEditProductOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<Tables<"products"> | null>(null);
  const [editForm, setEditForm] = useState({ name: "", brand: "iPhone", model: "", imei: "", serial_number: "", cost_price: "", sale_price: "", store_id: "", condition: "used", color: "", capacity: "", battery_percentage: "", justification: "", status: "in_stock" });
  const [historyProduct, setHistoryProduct] = useState<Tables<"products"> | null>(null);
  const [productHistory, setProductHistory] = useState<any[]>([]);
  const [justification, setJustification] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<"product" | "accessory" | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [repairModalOpen, setRepairModalOpen] = useState(false);
  const [repairProduct, setRepairProduct] = useState<any>(null);
  const [defectsDialogOpen, setDefectsDialogOpen] = useState(false);
  const [defectsProduct, setDefectsProduct] = useState<Tables<"products"> | null>(null);
  const [defectsList, setDefectsList] = useState<string[]>([]);
  const [customDefect, setCustomDefect] = useState("");
  const [parts, setParts] = useState<any[]>([]);
  const [partsSearch, setPartsSearch] = useState("");
  const [addPartOpen, setAddPartOpen] = useState(false);
  const [partForm, setPartForm] = useState({
    name: "", brand: "", model: "", cost_price: "", sale_price: "",
    supplier_id: "", launch_cash_out: false, payment_method: "dinheiro",
    use_credit: false
  });
  const [partVoucherFile, setPartVoucherFile] = useState<File | null>(null);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  const [form, setForm] = useState({
    name: "", brand: "iPhone" as string, model: "", imei: "",
    serial_number: "", cost_price: "", sale_price: "", store_id: "",
    product_type: "celular", condition: "used", color: "", capacity: "",
    battery_percentage: "",
    needsRepair: false,
    selectedRepairs: [] as string[],
    notes: ""
  });

  const [accForm, setAccForm] = useState({
    name: "", category: "outro", brand: "", quantity: "0", min_quantity: "5",
    cost_price: "", sale_price: "", store_id: "", description: "", justification: "",
  });

  const fetchData = async () => {
    if (!activeStoreId) return;
    setLoading(true);
    
    let productsQuery = supabase.from("products").select("*");
    let accQuery = supabase.from("accessories" as any).select("*");

    if (activeStoreId !== "all") {
      productsQuery = productsQuery.eq("store_id", activeStoreId);
      accQuery = accQuery.eq("store_id", activeStoreId);
    }

    const [productsRes, storesRes, accRes, partsRes, suppRes] = await Promise.all([
      productsQuery.order("created_at", { ascending: false }),
      supabase.from("stores").select("*"),
      accQuery.order("created_at", { ascending: false }),
      (activeStoreId !== "all"
        ? supabase.from("products").select("*").eq("store_id", activeStoreId).in("product_type", ["peca", "acessorio"]).eq("status", "in_stock")
        : supabase.from("products").select("*").in("product_type", ["peca", "acessorio"]).eq("status", "in_stock")
      ).order("created_at", { ascending: false }),
      (supabase.from("suppliers" as any).select("id, name, credit_balance").order("name") as any),
    ]);

    const pErr = productsRes.error;
    if (pErr) {
      console.error("Erro ao buscar produtos:", pErr);
      toast.error(`Falha ao carregar estoque: ${pErr.message}`);
    }
    console.log(`[DEBUG] Estoque carregado. Qtd: ${productsRes.data?.length || 0}. Loja Selecionada: ${activeStoreId}`);
    setProducts(productsRes.data ?? []);
    setStores(storesRes.data ?? []);
    setAccessories((accRes.data ?? []) as unknown as Accessory[]);
    setParts(partsRes.data ?? []);
    setSuppliers(suppRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [activeStoreId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const initialStatus = form.needsRepair ? "repair" : "in_stock";

    const { data, error } = await supabase.from("products").insert({
      name: form.name, brand: form.brand, model: form.model,
      imei: form.imei || null, serial_number: form.serial_number || null,
      cost_price: parseFloat(form.cost_price),
      sale_price: form.sale_price ? parseFloat(form.sale_price) : null,
      store_id: activeStoreId, created_by: user.id,
      product_type: form.product_type, condition: form.condition,
      color: form.color || null, 
      capacity: form.capacity ? (form.capacity.toUpperCase().endsWith("GB") ? form.capacity.toUpperCase() : `${form.capacity.toUpperCase()}GB`) : null,
      battery_percentage: form.battery_percentage ? parseInt(form.battery_percentage) : null,
      status: initialStatus,
      notes: form.notes || null
    }).select().single();
    
    if (error) {
      toast.error(error.message.includes("imei") ? "IMEI já cadastrado!" : error.message);
    } else if (data) {
      await supabase.from("product_history" as any).insert({
        product_id: data.id, action: "Entrada inicial", new_cost: data.cost_price, created_by: user.id,
      });

      if (form.needsRepair && form.selectedRepairs.length > 0) {
        // Criar o registro de reparo pendente associado
        const { error: repairError } = await supabase
          .from("product_repairs" as any)
          .insert({
            product_id: data.id,
            store_id: activeStoreId,
            repair_types: form.selectedRepairs,
            notes: "Reparo iniciado no cadastro de compra",
            status: "pending",
            created_by: user.id
          });
        if (repairError) {
          console.error("Erro ao criar reparo inicial:", repairError);
          toast.error("Aparelho cadastrado, mas erro ao iniciar reparo inicial: " + repairError.message);
        } else {
          await logAction("CREATE_RECORD", "product_repairs", data.id, null, { repair_types: form.selectedRepairs }, activeStoreId);
        }
      }

      toast.success(form.needsRepair ? "Aparelho cadastrado e enviado para Reparo!" : "Aparelho cadastrado!");
      setDialogOpen(false);
      setForm({ name: "", brand: "iPhone", model: "", imei: "", serial_number: "", cost_price: "", sale_price: "", store_id: "", product_type: "celular", condition: "used", color: "", capacity: "", battery_percentage: "", needsRepair: false, selectedRepairs: [], notes: "" });
      fetchData();
    }
    setLoading(false);
  };

  const loadHistory = async (p: Tables<"products">) => {
    setHistoryProduct(p);
    const { data } = await supabase.from("product_history" as any).select(`*, created_by_profile:profiles!product_history_created_by_fkey(display_name)`).eq("product_id", p.id).order("created_at", { ascending: false });
    setProductHistory(data ?? []);
    setHistoryOpen(true);
  };

  const handleAccSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (editAcc && !accForm.justification) { toast.error("Informe o motivo da alteração!"); return; }
    setLoading(true);

    const payload = {
      name: accForm.name, category: accForm.category, brand: accForm.brand || null,
      quantity: parseInt(accForm.quantity), min_quantity: parseInt(accForm.min_quantity),
      cost_price: parseFloat(accForm.cost_price),
      sale_price: accForm.sale_price ? parseFloat(accForm.sale_price) : null,
      store_id: activeStoreId, description: accForm.description || null,
      created_by: user.id,
    };

    let error;
    if (editAcc) {
      ({ error } = await supabase.from("accessories" as any).update(payload).eq("id", editAcc.id));
    } else {
      // Verifica se o acessório já existe
      const { data: existingAcc } = await supabase
        .from("accessories" as any)
        .select("id")
        .ilike("name", accForm.name)
        .eq("store_id", activeStoreId)
        .maybeSingle();

      if (existingAcc) {
        toast.error("Este acessório já existe no estoque! Busque por ele e edite-o para atualizar a quantidade.");
        setLoading(false);
        return;
      }
      ({ error } = await supabase.from("accessories" as any).insert(payload));
    }

    if (error) {
      toast.error(error.message);
    } else {
      logAction(editAcc ? "UPDATE_RECORD" : "CREATE_RECORD", "accessories", editAcc ? editAcc.id : "new", editAcc, { ...payload, justification: accForm.justification }, payload.store_id);
      toast.success(editAcc ? "Acessório atualizado!" : "Acessório cadastrado!");
      setAccDialogOpen(false);
      setEditAcc(null);
      setAccForm({ name: "", category: "outro", brand: "", quantity: "0", min_quantity: "5", cost_price: "", sale_price: "", store_id: "", description: "", justification: "" });
      fetchData();
    }
    setLoading(false);
  };

  const handleDeleteAcc = async (accId: string, reason: string) => {
    const acc = accessories.find(a => a.id === accId);
    if (!acc) return;
    const { error } = await supabase.from("accessories" as any).delete().eq("id", accId);
    if (error) toast.error(error.message);
    else { 
      logAction("DELETE_RECORD", "accessories", acc.id, acc, { reason }, acc.store_id);
      toast.success("Acessório removido!"); 
      fetchData(); 
    }
  };

  const handleTransfer = async () => {
    if (!transferProduct || !transferStoreId || !user) return;
    if (!justification) { toast.error("Informe o motivo da transferência!"); return; }
    setLoading(true);
    const { error } = await supabase.from("products").update({ store_id: transferStoreId } as any).eq("id", transferProduct.id);
    if (error) {
      toast.error("Erro na transferência: " + error.message);
    } else {
      logAction("TRANSFER_STOCK", "products", transferProduct.id, transferProduct, { ...transferProduct, store_id: transferStoreId, reason: justification }, transferStoreId);
      const storeMap = new Map(stores.map(s => [s.id, s.name]));
      await supabase.from("transactions").insert({
        type: "income", amount: 0,
        description: `Transferência: ${transferProduct.name} de ${storeMap.get(transferProduct.store_id)} → ${storeMap.get(transferStoreId)}`,
        store_id: transferStoreId, product_id: transferProduct.id, created_by: user.id,
      });
      await supabase.from("product_history" as any).insert({
        product_id: transferProduct.id, action: "Transferência de Loja", 
        notes: `Transferência: ${justification}`,
        created_by: user.id,
      });
      toast.success("Produto transferido!");
      setTransferDialogOpen(false);
      setTransferProduct(null);
      setTransferStoreId("");
      fetchData();
    }
    setLoading(false);
  };

  const handleReconcile = async () => {
    setLoading(true);
    try {
      // 1. Buscar todos os IDs de produtos que já foram vendidos
      const { data: sales, error: salesError } = await supabase.from("sales").select("product_id");
      if (salesError) throw salesError;
      
      const soldIds = [...new Set(sales.map(s => s.product_id))];
      
      // 2. Atualizar status dos produtos que estão 'in_stock' mas deveriam ser 'sold'
      const { data: updated, error: updateError } = await supabase
        .from("products")
        .update({ status: "sold" })
        .in("id", soldIds)
        .eq("status", "in_stock")
        .select();

      if (updateError) throw updateError;
      
      const count = updated?.length || 0;
      if (count > 0) {
        toast.success(`${count} aparelhos foram conciliados e marcados como vendidos.`);
        fetchData();
      } else {
        toast.info("O estoque já está conciliado com as vendas.");
      }
    } catch (err: any) {
      toast.error("Erro na conciliação: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const storeMap = new Map(stores.map((s) => [s.id, s.name]));
  const supplierMap = new Map(suppliers.map((s: any) => [s.id, s.name]));

  const filteredParts = parts.filter((p) => {
    const q = partsSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.brand && p.brand.toLowerCase().includes(q)) || (p.model && p.model.toLowerCase().includes(q));
  });

  const handleAddPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeStoreId || activeStoreId === "all") { toast.error("Selecione uma loja específica."); return; }
    if (!partForm.name || !partForm.cost_price) { toast.error("Nome e custo são obrigatórios."); return; }
    setLoading(true);

    try {
      let voucherUrl = null;
      if (partVoucherFile) {
        const fileExt = partVoucherFile.name.split(".").pop();
        const safeName = partVoucherFile.name.replace(/[^a-zA-Z0-9]/g, "_");
        const path = `pecas/comprovante-${Date.now()}-${safeName}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from("comprovantes").upload(path, partVoucherFile, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(uploadData.path);
        voucherUrl = urlData.publicUrl;
      }

      let registerId = null;
      if (partForm.launch_cash_out) {
        const { data: register } = (await supabase.from("cash_registers" as any).select("id").eq("store_id", activeStoreId).eq("status", "open").eq("opened_by", user?.id).maybeSingle()) as any;
        if (!register) {
          toast.error("Não há caixa aberto para esta loja! Abra o caixa antes de registrar a compra com saída.");
          setLoading(false);
          return;
        }
        registerId = register.id;
      }

      const supplierName = partForm.supplier_id ? supplierMap.get(partForm.supplier_id) : null;

      let creditToUse = 0;
      let remainingAmount = parseFloat(partForm.cost_price);

      if (partForm.use_credit && partForm.supplier_id) {
        const selectedSup = suppliers.find(s => s.id === partForm.supplier_id);
        if (selectedSup && Number(selectedSup.credit_balance) > 0) {
          creditToUse = Math.min(remainingAmount, Number(selectedSup.credit_balance));
          remainingAmount -= creditToUse;

          const { error: supUpdateErr } = await supabase
            .from("suppliers" as any)
            .update({ credit_balance: Number(selectedSup.credit_balance) - creditToUse } as any)
            .eq("id", partForm.supplier_id);

          if (supUpdateErr) throw supUpdateErr;
        }
      }

      const { data: insertedPart, error } = await supabase.from("products").insert({
        store_id: activeStoreId,
        name: partForm.name,
        brand: partForm.brand || "Genérico",
        model: partForm.model || partForm.name,
        cost_price: parseFloat(partForm.cost_price),
        sale_price: partForm.sale_price ? parseFloat(partForm.sale_price) : null,
        status: "in_stock",
        product_type: "peca",
        condition: "new",
        created_by: user.id,
        supplier_id: partForm.supplier_id || null,
        supplier_name: supplierName || null,
        parts_payment_voucher: voucherUrl || null,
      } as any).select().single();

      if (error) {
        toast.error(error.message);
      } else {
        const desc = `Compra de Peça: ${partForm.name}${supplierName ? ` [Fornecedor: ${supplierName}]` : ""}${creditToUse > 0 ? ` (Abatido R$ ${creditToUse.toFixed(2)} do crédito)` : ""}`;
        
        if (partForm.launch_cash_out && registerId && remainingAmount > 0) {
          await supabase.from("cash_entries" as any).insert({
            cash_register_id: registerId,
            store_id: activeStoreId,
            type: "saida",
            amount: remainingAmount,
            description: desc,
            payment_method: partForm.payment_method,
            confirmed: true,
            receipt_url: voucherUrl || null,
            created_by: user.id,
          } as any);
        }

        // Sempre lança a transação financeira
        const transactionAmount = remainingAmount > 0 ? remainingAmount : parseFloat(partForm.cost_price);
        await supabase.from("transactions").insert({
          type: "expense_pj",
          amount: transactionAmount,
          net_amount: transactionAmount,
          description: desc,
          category: "Peças",
          store_id: activeStoreId,
          created_by: user.id,
          receipt_url: voucherUrl || null,
          expected_settlement_date: new Date().toISOString(),
          reconciled: true,
        });

        toast.success("Peça adicionada ao estoque!");
        setAddPartOpen(false);
        setPartForm({ name: "", brand: "", model: "", cost_price: "", sale_price: "", supplier_id: "", launch_cash_out: false, payment_method: "dinheiro", use_credit: false });
        setPartVoucherFile(null);
        fetchData();
      }
    } catch (err: any) {
      toast.error("Erro ao processar cadastro: " + err.message);
    }
    setLoading(false);
  };

  const handleReturnPart = async (p: any) => {
    const confirm = window.confirm(`Deseja realmente devolver a peça "${p.name}" ao fornecedor? O valor de custo de R$ ${p.cost_price.toFixed(2)} será revertido em crédito.`);
    if (!confirm) return;

    setLoading(true);
    try {
      const { error: prodErr } = await supabase
        .from("products")
        .update({ status: "returned" } as any)
        .eq("id", p.id);

      if (prodErr) throw prodErr;

      const { data: supplierObj, error: suppErr } = await supabase
        .from("suppliers" as any)
        .select("credit_balance")
        .eq("id", p.supplier_id)
        .single() as any;

      if (suppErr) throw suppErr;

      const newBalance = Number(supplierObj.credit_balance || 0) + Number(p.cost_price);

      const { error: supUpdateErr } = await supabase
        .from("suppliers" as any)
        .update({ credit_balance: newBalance } as any)
        .eq("id", p.supplier_id);

      if (supUpdateErr) throw supUpdateErr;

      await logAction("return_part_to_supplier", "products", p.id, p, { ...p, status: "returned", credit_added: p.cost_price }, activeStoreId || "");

      toast.success(`Peça devolvida! R$ ${p.cost_price.toFixed(2)} creditados ao fornecedor.`);
      fetchData();
    } catch (err: any) {
      toast.error("Erro ao processar devolução: " + err.message);
    }
    setLoading(false);
  };

  const handleQuickUploadVoucher = async (e: React.ChangeEvent<HTMLInputElement>, productId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const safeName = file.name.replace(/[^a-zA-Z0-9]/g, "_");
      const path = `pecas/comprovante-${Date.now()}-${safeName}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from("comprovantes").upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(uploadData.path);
      const publicUrl = urlData.publicUrl;

      const { error: dbError } = await supabase.from("products").update({ parts_payment_voucher: publicUrl } as any).eq("id", productId);
      if (dbError) throw dbError;

      toast.success("Comprovante enviado com sucesso!");
      fetchData();
    } catch (err: any) {
      toast.error("Erro ao enviar comprovante: " + err.message);
    }
    setLoading(false);
  };

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();
    return (p.name.toLowerCase().includes(q) || p.model.toLowerCase().includes(q) || (p.imei && p.imei.includes(search)));
  });

  const filteredAccessories = accessories.filter((a) => {
    const q = search.toLowerCase();
    return (a.name.toLowerCase().includes(q) || (a.brand && a.brand.toLowerCase().includes(q)));
  });

  const inStock = filteredProducts.filter((p) => p.status === "in_stock");
  const inRepair = filteredProducts.filter((p) => p.status === "repair");
  const totalInvestedProducts = inStock.reduce((sum, p) => sum + Number(p.cost_price), 0);
  const totalInvestedAcc = filteredAccessories.reduce((sum, a) => sum + Number(a.cost_price) * a.quantity, 0);

  const storeStockCounts: Record<string, number> = {};
  products.filter(p => p.status === "in_stock").forEach(p => {
    storeStockCounts[p.store_id] = (storeStockCounts[p.store_id] || 0) + 1;
  });
  const lowStockStores = stores.filter(s => (storeStockCounts[s.id] || 0) <= LOW_STOCK_THRESHOLD);
  const lowStockAcc = accessories.filter(a => a.quantity <= a.min_quantity);

  const openEditProduct = (p: Tables<"products">) => {
    setEditProduct(p);
    setEditForm({
      name: p.name,
      brand: p.brand,
      model: p.model,
      imei: p.imei || "",
      serial_number: p.serial_number || "",
      cost_price: String(p.cost_price),
      sale_price: p.sale_price ? String(p.sale_price) : "",
      store_id: p.store_id,
      condition: p.condition || "used",
      color: p.color || "",
      capacity: p.capacity || "",
      battery_percentage: (p as any).battery_percentage ? String((p as any).battery_percentage) : "",
      justification: "",
      status: p.status,
    });
    setEditProductOpen(true);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct || !user) return;
    if (!editForm.justification) { toast.error("Informe o motivo da alteração!"); return; }
    setLoading(true);
    const oldCost = Number(editProduct.cost_price);
    const newCost = parseFloat(editForm.cost_price);
    const updatePayload = {
      name: editForm.name,
      brand: editForm.brand,
      model: editForm.model,
      imei: editForm.imei || null,
      serial_number: editForm.serial_number || null,
      cost_price: newCost,
      sale_price: editForm.sale_price ? parseFloat(editForm.sale_price) : null,
      store_id: editForm.store_id,
      condition: editForm.condition,
      color: editForm.color || null,
      capacity: editForm.capacity ? (editForm.capacity.toUpperCase().endsWith("GB") ? editForm.capacity.toUpperCase() : `${editForm.capacity.toUpperCase()}GB`) : null,
      battery_percentage: editForm.battery_percentage ? parseInt(editForm.battery_percentage) : null,
      status: editForm.status,
    };
    const { error } = await supabase.from("products").update(updatePayload as any).eq("id", editProduct.id);

    if (error) {
      toast.error(error.message);
    } else {
      logAction("UPDATE_RECORD", "products", editProduct.id, editProduct, { ...updatePayload, justification: editForm.justification }, editForm.store_id);
      if (oldCost !== newCost) {
        await supabase.from("product_history" as any).insert({
          product_id: editProduct.id,
          action: "Edição",
          old_cost: oldCost,
          new_cost: newCost,
          notes: `Edição: ${editForm.justification}`,
          created_by: user.id,
        });
      }
      toast.success("Aparelho atualizado!");
      setEditProductOpen(false);
      setEditProduct(null);
      fetchData();
    }
    setLoading(false);
  };

  const handleSaveDefects = async () => {
    if (!defectsProduct || !user) return;
    setLoading(true);

    const oldDefects = defectsProduct.defects || [];
    const newDefects = defectsList;

    const { error } = await supabase
      .from("products")
      .update({ defects: newDefects } as any)
      .eq("id", defectsProduct.id);

    if (error) {
      toast.error("Erro ao salvar defeitos: " + error.message);
    } else {
      await supabase.from("product_history" as any).insert({
        product_id: defectsProduct.id,
        action: "Atualização de Defeitos",
        notes: `Defeitos atualizados: [${oldDefects.join(", ")}] → [${newDefects.join(", ")}]`,
        created_by: user.id,
      });

      await logAction(
        "UPDATE_RECORD",
        "products",
        defectsProduct.id,
        defectsProduct,
        { defects: newDefects, justification: "Atualização de defeitos do aparelho" },
        defectsProduct.store_id
      );

      toast.success("Defeitos atualizados com sucesso!");
      setDefectsDialogOpen(false);
      setDefectsProduct(null);
      fetchData();
    }
    setLoading(false);
  };

  const handleDeleteProduct = async (id: string, reason: string) => {
    const productToDelete = products.find(p => p.id === id);
    if (!productToDelete) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { 
      logAction("DELETE_RECORD", "products", id, productToDelete, { reason }, productToDelete?.store_id);
      toast.success("Aparelho removido!"); fetchData(); 
    }
  };

  const openAccDialog = (acc?: Accessory) => {
    if (acc) {
      setEditAcc(acc);
      setAccForm({
        name: acc.name, category: acc.category, brand: acc.brand || "",
        quantity: String(acc.quantity), min_quantity: String(acc.min_quantity),
        cost_price: String(acc.cost_price), sale_price: acc.sale_price ? String(acc.sale_price) : "",
        store_id: acc.store_id, description: acc.description || "", justification: ""
      });
    } else {
      setEditAcc(null);
      setAccForm({ name: "", category: "outro", brand: "", quantity: "0", min_quantity: "5", cost_price: "", sale_price: "", store_id: "", description: "", justification: "" });
    }
    setAccDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Estoque</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {inStock.length} aparelhos · {filteredAccessories.length} acessórios · {formatCurrency(totalInvestedProducts + totalInvestedAcc)} investido
            {activeStoreId === "all" && " (Global)"}
          </p>
        </div>
        {userRole === "admin" && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReconcile} disabled={loading} className="h-9 gap-2 border-primary/20 hover:bg-primary/5 text-primary">
              <ArrowRightLeft className="h-4 w-4" /> Conciliar Estoque
            </Button>
            <Store className="h-4 w-4 text-muted-foreground" />
            <Select value={activeStoreId} onValueChange={(v) => {
              setActiveStoreId(v);
              const s = stores.find(s => s.id === v);
              window.dispatchEvent(new CustomEvent("store-changed", { detail: { id: v, name: s?.name || "Todas as lojas" } }));
            }}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Selecionar Loja" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Lojas</SelectItem>
                {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Alertas */}
      {(lowStockStores.length > 0 || lowStockAcc.length > 0) && (
        <div className="space-y-2">
          {lowStockStores.map(s => (
            <div key={s.id} className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-xs"><span className="font-semibold">{s.name}</span>: estoque baixo de aparelhos — apenas <span className="font-bold text-destructive">{storeStockCounts[s.id] || 0}</span></p>
            </div>
          ))}
          {lowStockAcc.map(a => (
            <div key={a.id} className="flex items-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
              <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
              <p className="text-xs"><span className="font-semibold">{a.name}</span>: apenas <span className="font-bold text-yellow-500">{a.quantity}</span> unidades (mín: {a.min_quantity})</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar no estoque da loja..." className="pl-9 h-10" />
        </div>
      </div>

      <Tabs defaultValue="aparelhos">
        <TabsList className="w-full sm:w-auto flex overflow-x-auto whitespace-nowrap pb-1 justify-start gap-1 bg-transparent border-b border-border/50 h-auto rounded-none scrollbar-none">
          <TabsTrigger value="aparelhos" className="gap-2 shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
            <Package className="h-4 w-4" /> Aparelhos ({inStock.length})
          </TabsTrigger>
          <TabsTrigger value="acessorios" className="gap-2 shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
            <Zap className="h-4 w-4" /> Acessórios ({filteredAccessories.length})
          </TabsTrigger>
          <TabsTrigger value="pecas" className="gap-2 shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
            <Cpu className="h-4 w-4" /> Peças ({parts.length})
          </TabsTrigger>
          <TabsTrigger value="vendidos" className="gap-2 shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent">
            <Package className="h-4 w-4" /> Vendidos ({filteredProducts.filter(p => p.status === 'sold').length})
          </TabsTrigger>
          <TabsTrigger value="reparo" className="gap-2 shrink-0 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none bg-transparent relative">
            <Wrench className="h-4 w-4" /> Em Reparo
            {inRepair.length > 0 && (
              <span className="ml-1 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                {inRepair.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="aparelhos" className="mt-4 space-y-3">
          <AparelhosTable
            inStock={inStock}
            form={form}
            setForm={setForm}
            dialogOpen={dialogOpen}
            setDialogOpen={setDialogOpen}
            handleSubmit={handleSubmit}
            loading={loading}
            activeStoreId={activeStoreId}
            storeMap={storeMap}
            stores={stores}
            formatCurrency={formatCurrency}
            loadHistory={loadHistory}
            setTransferProduct={setTransferProduct}
            setTransferDialogOpen={setTransferDialogOpen}
            setRepairProduct={setRepairProduct}
            setRepairModalOpen={setRepairModalOpen}
            setDefectsProduct={setDefectsProduct}
            setDefectsList={setDefectsList}
            setCustomDefect={setCustomDefect}
            setDefectsDialogOpen={setDefectsDialogOpen}
            openEditProduct={openEditProduct}
            setDeleteId={setDeleteId}
            setDeleteType={setDeleteType}
            setJustification={setJustification}
            setDeleteDialogOpen={setDeleteDialogOpen}
          />
        </TabsContent>

        {/* ABA PEÇAS */}
        <TabsContent value="pecas" className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={partsSearch}
                onChange={e => setPartsSearch(e.target.value)}
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
                      <Input value={partForm.name} onChange={e => setPartForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Tela iPhone 13" required className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Marca / Fabricante</Label>
                      <Input value={partForm.brand} onChange={e => setPartForm(f => ({ ...f, brand: e.target.value }))} placeholder="Apple, Samsung..." className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Modelo</Label>
                      <Input value={partForm.model} onChange={e => setPartForm(f => ({ ...f, model: e.target.value }))} placeholder="iPhone 13 Pro" className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Custo (R$) *</Label>
                      <Input type="number" step="0.01" value={partForm.cost_price} onChange={e => setPartForm(f => ({ ...f, cost_price: e.target.value }))} placeholder="0.00" required className="h-10" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Preço de Venda (R$)</Label>
                      <Input type="number" step="0.01" value={partForm.sale_price} onChange={e => setPartForm(f => ({ ...f, sale_price: e.target.value }))} placeholder="0.00 (auto)" className="h-10" />
                    </div>

                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">Fornecedor</Label>
                      <Select value={partForm.supplier_id} onValueChange={v => setPartForm(f => ({ ...f, supplier_id: v === "none" ? "" : v }))}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Selecione o fornecedor (opcional)" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhum fornecedor</SelectItem>
                          {suppliers.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {partForm.supplier_id && (suppliers.find(s => s.id === partForm.supplier_id)?.credit_balance ?? 0) > 0 && (
                      <div className="col-span-2 flex items-center justify-between border border-primary/20 bg-primary/5 rounded-lg p-2.5 animate-in fade-in-50 duration-200">
                        <div className="space-y-0.5">
                          <Label className="text-xs font-bold cursor-pointer text-primary" htmlFor="part-credit-toggle">
                            Abater do saldo de crédito existente?
                          </Label>
                          <p className="text-[10px] text-muted-foreground">
                            Saldo disponível: {formatCurrency(Number(suppliers.find(s => s.id === partForm.supplier_id)?.credit_balance))}
                          </p>
                        </div>
                        <input
                          id="part-credit-toggle"
                          type="checkbox"
                          checked={partForm.use_credit}
                          onChange={e => setPartForm(f => ({ ...f, use_credit: e.target.checked }))}
                          className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                        />
                      </div>
                    )}

                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs">Comprovante de Pagamento</Label>
                      <Input type="file" onChange={e => setPartVoucherFile(e.target.files?.[0] || null)} className="h-10 text-xs py-2" accept="image/*,application/pdf" />
                    </div>

                    <div className="col-span-2 flex items-center justify-between border border-border/60 rounded-lg p-2.5 bg-muted/20">
                      <div className="space-y-0.5">
                        <Label className="text-xs font-bold cursor-pointer" htmlFor="part-cash-out-toggle">Lançar saída no Caixa?</Label>
                        <p className="text-[10px] text-muted-foreground">Cria uma despesa correspondente no caixa aberto da loja</p>
                      </div>
                      <input
                        id="part-cash-out-toggle"
                        type="checkbox"
                        checked={partForm.launch_cash_out}
                        onChange={e => setPartForm(f => ({ ...f, launch_cash_out: e.target.checked }))}
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary accent-primary cursor-pointer"
                      />
                    </div>

                    {partForm.launch_cash_out && (
                      <div className="col-span-2 space-y-1.5 animate-in fade-in-50 duration-200">
                        <Label className="text-xs">Forma de Pagamento</Label>
                        <Select value={partForm.payment_method} onValueChange={v => setPartForm(f => ({ ...f, payment_method: v }))}>
                          <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
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
                  <p className="text-[10px] text-muted-foreground">A peça ficará disponível em estoque para ser vinculada a OS e Reparos.</p>
                  <Button type="submit" className="w-full h-10 font-semibold" disabled={loading}>
                    {loading ? "Salvando..." : "Adicionar ao Estoque"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {filteredParts.length > 0 ? (
            <div className="space-y-2">
              {filteredParts.map(p => {
                const supplierName = (p as any).supplier_name || (p as any).supplier_id ? supplierMap.get((p as any).supplier_id) : null;
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
                              <Badge variant="outline" className="text-[9px] bg-muted/50 border-primary/20 text-primary">
                                {storeMap.get(p.store_id) || "—"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.brand && `${p.brand} · `}{p.model && p.model !== p.name && `${p.model}`}
                          </p>
                          {supplierName && (
                            <p className="text-[10px] text-blue-500 font-medium mt-0.5">🏭 {supplierName}</p>
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
                                <Label
                                  className="h-7 px-2 text-[10px] flex items-center justify-center border border-border bg-transparent text-foreground hover:bg-muted shadow-none rounded-md cursor-pointer font-medium"
                                >
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
                              <Label
                                className="h-7 px-2 text-[10px] flex items-center justify-center gap-1 border border-border bg-transparent text-muted-foreground hover:bg-muted shadow-none rounded-md cursor-pointer font-medium"
                              >
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
                              onClick={() => {
                                setDeleteId(p.id);
                                setDeleteType("product");
                                setJustification("");
                                setDeleteDialogOpen(true);
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-muted-foreground">Custo</p>
                          <p className="font-display font-bold text-base">{formatCurrency(Number(p.cost_price))}</p>
                          {p.sale_price && (
                            <p className="text-xs text-muted-foreground">Venda: {formatCurrency(Number(p.sale_price))}</p>
                          )}
                          {margin !== null && margin > 0 && (
                            <p className="text-[10px] text-primary font-medium">+{formatCurrency(margin)}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              <div className="text-xs text-center text-muted-foreground pt-1">
                Total investido em peças: <span className="font-semibold text-foreground">{formatCurrency(filteredParts.reduce((s, p) => s + Number(p.cost_price), 0))}</span>
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
        </TabsContent>

        {/* ABA ACESSÓRIOS */}
        <TabsContent value="acessorios" className="mt-4 space-y-3">
          <AcessoriosTable
            filteredAccessories={filteredAccessories}
            activeStoreId={activeStoreId}
            storeMap={storeMap}
            formatCurrency={formatCurrency}
            openAccDialog={openAccDialog}
            setDeleteId={setDeleteId}
            setDeleteType={setDeleteType}
            setJustification={setJustification}
            setDeleteDialogOpen={setDeleteDialogOpen}
          />
        </TabsContent>
        
        {/* ABA VENDIDOS */}
        <TabsContent value="vendidos" className="mt-4 space-y-3">
          {filteredProducts.filter(p => p.status === 'sold').length > 0 ? (
            <div className="space-y-2">
              {filteredProducts.filter(p => p.status === 'sold').map((p) => (
                <Card key={p.id} className="border-border/50 bg-muted/5- opacity-80">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{p.name}</p>
                          <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground">Vendido</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.brand} · {p.model} · IMEI: {p.imei}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-muted-foreground">Vendido por</p>
                        <p className="font-display font-bold text-sm">{formatCurrency(Number(p.sale_price || 0))}</p>
                        <Button className="h-7 text-[10px] mt-1 bg-transparent text-muted-foreground hover:bg-muted" onClick={() => loadHistory(p)}>
                          Ver Histórico
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Package className="h-10 w-10 mb-3 opacity-30" />
                <p className="font-medium text-sm">Nenhum aparelho vendido encontrado</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ABA EM REPARO */}
        <TabsContent value="reparo" className="mt-4 space-y-3">
          {inRepair.length > 0 ? (
            <div className="space-y-2">
              {inRepair.map((p) => {
                const conditionLabel = p.condition === "new" ? "Novo" : p.condition === "refurbished" ? "Recondicionado" : p.condition === "seminovo_americano" ? "Seminovo (Americano)" : "Usado";
                return (
                  <Card key={p.id} className="border-destructive/30 shadow-lg shadow-black/10 bg-destructive/5">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-sm truncate">{p.name}</p>
                            <Badge className="text-[10px] bg-destructive/15 text-destructive border-destructive/20">
                              🔧 Em Reparo
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {p.brand} · {p.model} {p.capacity && `· ${p.capacity}`} {p.color && `· ${p.color}`} · {conditionLabel}
                            {p.imei && ` · IMEI: ${p.imei}`}
                          </p>
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
                        <div className="text-right shrink-0 flex flex-col items-end gap-1">
                          <div>
                            <p className="text-xs text-muted-foreground">Custo atual</p>
                            <p className="font-display font-bold text-sm">{formatCurrency(Number(p.cost_price))}</p>
                          </div>
                          <Button
                            className="h-8 text-[11px] gap-1.5 bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive hover:text-destructive-foreground"
                            onClick={() => { setRepairProduct(p as any); setRepairModalOpen(true); }}
                          >
                            <Wrench className="h-3.5 w-3.5" /> Gerenciar Reparo
                          </Button>
                          <Button className="h-7 text-[10px] gap-1 bg-transparent text-muted-foreground hover:bg-muted"
                            onClick={() => {
                              setDefectsProduct(p);
                              setDefectsList(p.defects || []);
                              setCustomDefect("");
                              setDefectsDialogOpen(true);
                            }}>
                            <AlertTriangle className="h-3.5 w-3.5" /> Defeitos
                            {p.defects && p.defects.length > 0 && (
                              <span className="ml-0.5 px-1 py-0.5 text-[8px] bg-destructive text-destructive-foreground rounded-full leading-none font-bold">
                                {p.defects.length}
                              </span>
                            )}
                          </Button>
                          <Button className="h-7 text-[10px] gap-1 bg-transparent text-muted-foreground hover:bg-muted" onClick={() => loadHistory(p)}>
                            Ver Histórico
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
                <Wrench className="h-10 w-10 mb-3 opacity-30" />
                <p className="font-medium text-sm">Nenhum aparelho em reparo</p>
                <p className="text-xs mt-1">Aparelhos enviados para reparo aparecem aqui</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog Acessório */}
      <Dialog open={accDialogOpen} onOpenChange={(o) => { setAccDialogOpen(o); if (!o) setEditAcc(null); }}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">{editAcc ? "Editar Acessório" : "Cadastrar Acessório"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAccSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Nome</Label>
                <Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} placeholder="Carregador 20W" required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Categoria</Label>
                <Select value={accForm.category} onValueChange={(v) => setAccForm({ ...accForm, category: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="carregador">Carregador</SelectItem>
                    <SelectItem value="cabo">Cabo</SelectItem>
                    <SelectItem value="capa">Capa</SelectItem>
                    <SelectItem value="pelicula">Película</SelectItem>
                    <SelectItem value="fone">Fone</SelectItem>
                    <SelectItem value="peca">Peça de Reposição</SelectItem>
                    <SelectItem value="ferramenta">Ferramenta</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Marca</Label>
                <Input value={accForm.brand} onChange={(e) => setAccForm({ ...accForm, brand: e.target.value })} placeholder="Apple, Samsung..." className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Descrição</Label>
                <Input value={accForm.description} onChange={(e) => setAccForm({ ...accForm, description: e.target.value })} placeholder="USB-C 1m..." className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Quantidade</Label>
                <Input type="number" min="0" value={accForm.quantity} onChange={(e) => setAccForm({ ...accForm, quantity: e.target.value })} required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Qtd Mínima (alerta)</Label>
                <Input type="number" min="0" value={accForm.min_quantity} onChange={(e) => setAccForm({ ...accForm, min_quantity: e.target.value })} required className="h-10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Custo (R$)</Label>
                <Input type="number" step="0.01" value={accForm.cost_price} onChange={(e) => setAccForm({ ...accForm, cost_price: e.target.value })} placeholder="25.00" required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Venda (R$)</Label>
                <Input type="number" step="0.01" value={accForm.sale_price} onChange={(e) => setAccForm({ ...accForm, sale_price: e.target.value })} placeholder="50.00" className="h-10" />
              </div>
            </div>
            {editAcc && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-primary">Motivo da Alteração</Label>
                <Input value={accForm.justification} onChange={(e) => setAccForm({ ...accForm, justification: e.target.value })} placeholder="Ex: Correção de preço, ajuste de estoque..." required className="h-10 border-primary/30" />
              </div>
            )}
            <div className="space-y-1.5 grayscale opacity-60 pointer-events-none">
              <Label className="text-xs">Loja (Vinculada à Loja Ativa)</Label>
              <Input value={storeMap.get(activeStoreId || "") || ""} readOnly className="h-10" />
            </div>
            <Button type="submit" className="w-full h-11 font-semibold" disabled={loading || !activeStoreId}>
              {loading ? "Salvando..." : editAcc ? "Salvar Alterações" : "Cadastrar Acessório"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={(open) => { setTransferDialogOpen(open); if (!open) { setTransferProduct(null); setTransferStoreId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" /> Transferir Aparelho
            </DialogTitle>
          </DialogHeader>
          {transferProduct && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-semibold">{transferProduct.name}</p>
                <p className="text-muted-foreground">{transferProduct.brand} · {transferProduct.model}</p>
                <p className="text-muted-foreground">Loja atual: <span className="font-medium text-foreground">{storeMap.get(transferProduct.store_id)}</span></p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Transferir para</Label>
                <Select value={transferStoreId} onValueChange={setTransferStoreId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Selecione a loja destino" /></SelectTrigger>
                  <SelectContent>
                    {stores.filter(s => s.id !== transferProduct.store_id).map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-primary">Motivo da Transferência</Label>
                <Input value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Ex: Necessidade de estoque na outra loja" required className="h-10 border-primary/30" />
              </div>
              <Button onClick={handleTransfer} className="w-full h-11 font-semibold" disabled={loading || !transferStoreId}>
                {loading ? "Transferindo..." : "Confirmar Transferência"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      <Dialog open={editProductOpen} onOpenChange={setEditProductOpen}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Editar Aparelho</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateProduct} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Nome</Label><Input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} required className="h-10" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Marca</Label><Select value={editForm.brand} onValueChange={v => setEditForm(f => ({ ...f, brand: v }))}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="iPhone">iPhone</SelectItem><SelectItem value="Xiaomi">Xiaomi</SelectItem><SelectItem value="Samsung">Samsung</SelectItem><SelectItem value="Motorola">Motorola</SelectItem><SelectItem value="Outro">Outro</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Modelo</Label><Input value={editForm.model} onChange={e => setEditForm(f => ({ ...f, model: e.target.value }))} required className="h-10" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Condição</Label><Select value={editForm.condition} onValueChange={v => setEditForm(f => ({ ...f, condition: v }))}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="new">Novo</SelectItem><SelectItem value="used">Usado</SelectItem><SelectItem value="refurbished">Recondicionado</SelectItem><SelectItem value="seminovo_americano">Seminovo (Americano)</SelectItem></SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Capacidade (GB)</Label><Input value={editForm.capacity} onChange={e => setEditForm(f => ({ ...f, capacity: e.target.value }))} placeholder="128" className="h-10" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Cor</Label><Input value={editForm.color} onChange={e => setEditForm(f => ({ ...f, color: e.target.value }))} placeholder="Preto" className="h-10" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Bateria (%)</Label><Input type="number" value={editForm.battery_percentage} onChange={e => setEditForm(f => ({ ...f, battery_percentage: e.target.value }))} placeholder="100" className="h-10" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">IMEI</Label><Input value={editForm.imei} onChange={e => setEditForm(f => ({ ...f, imei: e.target.value }))} className="h-10" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Custo (R$)</Label><Input type="number" step="0.01" value={editForm.cost_price} onChange={e => setEditForm(f => ({ ...f, cost_price: e.target.value }))} required className="h-10" /></div>
              <div className="space-y-1.5"><Label className="text-xs">Venda (R$)</Label><Input type="number" step="0.01" value={editForm.sale_price} onChange={e => setEditForm(f => ({ ...f, sale_price: e.target.value }))} className="h-10" /></div>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Loja</Label><Select value={editForm.store_id} onValueChange={v => setEditForm(f => ({ ...f, store_id: v }))}><SelectTrigger className="h-10"><SelectValue /></SelectTrigger><SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5">
              <Label className="text-xs">Status do Aparelho</Label>
              <Select value={editForm.status} onValueChange={v => setEditForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in_stock">Em estoque</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                  <SelectItem value="reserved">Reservado</SelectItem>
                  <SelectItem value="repair">Em reparo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary">Motivo da Alteração</Label>
              <Input value={editForm.justification} onChange={e => setEditForm(f => ({ ...f, justification: e.target.value }))} placeholder="Ex: Erro no cadastro, atualização de preço..." required className="h-10 border-primary/30" />
            </div>
            <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>{loading ? "Salvando..." : "Salvar Alterações"}</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Product History Dialog */}
      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Histórico do Aparelho</DialogTitle>
          </DialogHeader>
          {historyProduct && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-semibold">{historyProduct.name}</p>
                <p className="text-muted-foreground">{historyProduct.imei && `IMEI: ${historyProduct.imei}`} · Custo: {formatCurrency(Number(historyProduct.cost_price))}</p>
              </div>
              <div className="space-y-3 relative before:absolute before:inset-0 before:ml-2 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                {productHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center">Nenhum registro encontrado.</p>
                ) : productHistory.map((h, i) => (
                  <div key={h.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-5 h-5 rounded-full border border-primary bg-background shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow"></div>
                    <div className="w-[calc(100%-2rem)] md:w-[calc(50%-1.25rem)] bg-card p-3 rounded border shadow-sm text-xs">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-semibold text-primary">{h.action}</span>
                        <span className="text-muted-foreground text-[10px]">{new Date(h.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="text-muted-foreground">
                        {h.notes && <p className="mb-0.5">{h.notes}</p>}
                        {h.old_cost !== null && h.new_cost !== null && (
                          <p>Custo: <span className="line-through">{formatCurrency(h.old_cost)}</span> → <span className="font-medium text-foreground">{formatCurrency(h.new_cost)}</span></p>
                        )}
                        {(h.old_cost === null && h.new_cost !== null) && (
                          <p>Custo: <span className="font-medium text-foreground">{formatCurrency(h.new_cost)}</span></p>
                        )}
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground mt-2 border-t pt-1 border-border/50">
                        {h.created_by_profile?.display_name || "Sistema"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog with Justification */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirmar Exclusão
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Esta ação é permanente. Por favor, informe o motivo da exclusão para continuar.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Motivo da Exclusão</Label>
              <Input 
                value={justification} 
                onChange={(e) => setJustification(e.target.value)} 
                placeholder="Ex: Item danificado, erro de entrada..." 
                required 
                className="h-10"
              />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
              <Button 
                variant="destructive" 
                className="flex-1" 
                disabled={!justification || loading}
                onClick={async () => {
                  setLoading(true);
                  if (deleteType === "product" && deleteId) {
                    await handleDeleteProduct(deleteId, justification);
                  } else if (deleteType === "accessory" && deleteId) {
                    await handleDeleteAcc(deleteId, justification);
                  }
                  setLoading(false);
                  setDeleteDialogOpen(false);
                }}
              >
                {loading ? "Excluindo..." : "Confirmar Exclusão"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Defects Dialog */}
      <Dialog open={defectsDialogOpen} onOpenChange={setDefectsDialogOpen}>
        <DialogContent className="max-w-md max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Gerenciar Defeitos do Aparelho
            </DialogTitle>
          </DialogHeader>
          {defectsProduct && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <p className="font-semibold">{defectsProduct.name}</p>
                <p className="text-muted-foreground">{defectsProduct.brand} · {defectsProduct.model} {defectsProduct.capacity && `· ${defectsProduct.capacity}`}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Defeitos Ativos</Label>
                {defectsList.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhum defeito registrado.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {defectsList.map((def, idx) => (
                      <Badge key={idx} variant="destructive" className="text-xs gap-1 py-1 px-2.5 bg-destructive hover:bg-destructive">
                        {def}
                        <button type="button" className="ml-1 hover:text-white/80 font-bold" onClick={() => {
                          setDefectsList(defectsList.filter((_, i) => i !== idx));
                        }}>
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <hr className="border-border/50" />

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Defeitos Comuns (Clique para adicionar)</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PREDEFINED_DEFECTS.map((def) => {
                    const active = defectsList.includes(def);
                    return (
                      <button
                        key={def}
                        type="button"
                        disabled={active}
                        onClick={() => setDefectsList([...defectsList, def])}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          active
                            ? "bg-muted text-muted-foreground border-border cursor-not-allowed"
                            : "bg-background text-foreground border-border hover:bg-muted"
                        }`}
                      >
                        {def}
                      </button>
                    );
                  })}
                </div>
              </div>

              <hr className="border-border/50" />

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Outro Defeito (Personalizado)</Label>
                <div className="flex gap-2">
                  <Input
                    value={customDefect}
                    onChange={(e) => setCustomDefect(e.target.value)}
                    placeholder="Ex: Câmera com foco ruim, traseira trincada..."
                    className="h-9 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (customDefect.trim()) {
                          if (!defectsList.includes(customDefect.trim())) {
                            setDefectsList([...defectsList, customDefect.trim()]);
                          }
                          setCustomDefect("");
                        }
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => {
                      if (customDefect.trim()) {
                        if (!defectsList.includes(customDefect.trim())) {
                          setDefectsList([...defectsList, customDefect.trim()]);
                        }
                        setCustomDefect("");
                      }
                    }}
                    className="h-9 px-3 text-xs"
                  >
                    Adicionar
                  </Button>
                </div>
              </div>

              <Button
                onClick={handleSaveDefects}
                className="w-full h-10 mt-2 font-semibold"
                disabled={loading}
              >
                {loading ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <DeviceRepairModal
        product={repairProduct}
        isOpen={repairModalOpen}
        onClose={() => { setRepairModalOpen(false); setRepairProduct(null); }}
        onSuccess={fetchData}
      />
    </div>
  );
};

export default Estoque;
