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
import { convertToWebP } from "@/utils/imageOptimizer";
import DeviceRepairModal from "@/components/DeviceRepairModal";
import { AparelhosTable } from "@/components/features/estoque/AparelhosTable";
import { AcessoriosTable } from "@/components/features/estoque/AcessoriosTable";
import { PecasTab } from "@/components/features/estoque/PecasTab";
import { VendidosTab } from "@/components/features/estoque/VendidosTab";
import { EmReparoTab } from "@/components/features/estoque/EmReparoTab";
import { ProductHistoryDialog } from "@/components/features/estoque/ProductHistoryDialog";
import { ProductDefectsDialog } from "@/components/features/estoque/ProductDefectsDialog";
import { ProductTransferDialog } from "@/components/features/estoque/ProductTransferDialog";
import { ProductEditDialog } from "@/components/features/estoque/ProductEditDialog";
import { ProductDeleteDialog } from "@/components/features/estoque/ProductDeleteDialog";
import { AccessoryModal } from "@/components/features/estoque/AccessoryModal";

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
  const [repairCostsMap, setRepairCostsMap] = useState<Map<string, number>>(new Map());
  const [showAlerts, setShowAlerts] = useState(false);

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
    console.log("[Estoque] fetchData iniciou. activeStoreId:", activeStoreId);
    if (!activeStoreId) return;
    setLoading(true);
    
    let productsQuery = supabase.from("products").select("*");
    let accQuery = supabase.from("accessories" as any).select("*");

    if (activeStoreId !== "all") {
      productsQuery = productsQuery.eq("store_id", activeStoreId);
      accQuery = accQuery.eq("store_id", activeStoreId);
    }

    const [productsRes, storesRes, accRes, partsRes, suppRes, repairsRes] = await Promise.all([
      productsQuery.order("created_at", { ascending: false }),
      supabase.from("stores").select("*"),
      accQuery.order("created_at", { ascending: false }),
      (activeStoreId !== "all"
        ? supabase.from("products").select("*").eq("store_id", activeStoreId).in("product_type", ["peca", "acessorio"]).eq("status", "in_stock")
        : supabase.from("products").select("*").in("product_type", ["peca", "acessorio"]).eq("status", "in_stock")
      ).order("created_at", { ascending: false }),
      (supabase.from("suppliers" as any).select("id, name, credit_balance").order("name") as any),
      (supabase.from("product_repairs" as any).select("id, product_id, status, product_repair_items(unit_cost, quantity)").eq("status", "completed") as any),
    ]);

    const pErr = productsRes.error;
    if (pErr) {
      console.error("Erro ao buscar produtos:", pErr);
      toast.error(`Falha ao carregar estoque: ${pErr.message}`);
    }
    console.log(`[DEBUG] Estoque carregado. Qtd: ${productsRes.data?.length || 0}. Loja Selecionada: ${activeStoreId}`);
    
    const costsMap = new Map<string, number>();
    if (repairsRes?.data) {
      repairsRes.data.forEach((r: any) => {
        const items = r.product_repair_items || [];
        const cost = items.reduce((sum: number, item: any) => sum + (Number(item.unit_cost) * Number(item.quantity || 1)), 0);
        const current = costsMap.get(r.product_id) || 0;
        costsMap.set(r.product_id, current + cost);
      });
    }
    setRepairCostsMap(costsMap);

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

    const parsedCost = parseFloat(form.cost_price);
    const { data, error } = await supabase.from("products").insert({
      name: form.name, brand: form.brand, model: form.model,
      imei: form.imei || null, serial_number: form.serial_number || null,
      cost_price: parsedCost,
      original_cost_price: parsedCost,
      sale_price: form.sale_price ? parseFloat(form.sale_price) : null,
      store_id: activeStoreId, created_by: user.id,
      product_type: form.product_type, condition: form.condition,
      color: form.color || null, 
      capacity: form.capacity ? (form.capacity.toUpperCase().endsWith("GB") ? form.capacity.toUpperCase() : `${form.capacity.toUpperCase()}GB`) : null,
      battery_percentage: form.battery_percentage ? parseInt(form.battery_percentage) : null,
      status: initialStatus,
      notes: form.notes || null
    } as any).select().single();
    
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
      await supabase.from("product_history" as any).insert({
        product_id: transferProduct.id, action: "Transferência de Loja", 
        notes: `Transferência de ${storeMap.get(transferProduct.store_id) || "Origem"} para ${storeMap.get(transferStoreId) || "Destino"}. Motivo: ${justification}`,
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
      
      const soldIds = [...new Set((sales || []).map(s => s.product_id).filter(Boolean))];
      
      // 2. Atualizar status dos produtos vendidos que ainda constam como 'in_stock'
      let reconciledSold = 0;
      if (soldIds.length > 0) {
        const { data: updated, error: updateError } = await supabase
          .from("products")
          .update({ status: "sold" })
          .in("id", soldIds)
          .eq("status", "in_stock")
          .select();

        if (updateError) throw updateError;
        reconciledSold = updated?.length || 0;
      }

      // 3. Conciliar peças consumidas em Ordens de Serviço
      const { data: osItems } = await supabase.from("service_order_items" as any).select("product_id");
      const osProductIds = [...new Set((osItems || []).map((i: any) => i.product_id).filter(Boolean))];
      let reconciledOSParts = 0;
      if (osProductIds.length > 0) {
        const { data: updatedOSParts } = await supabase
          .from("products")
          .update({ status: "sold" })
          .in("id", osProductIds)
          .eq("status", "in_stock")
          .select();
        reconciledOSParts = updatedOSParts?.length || 0;
      }

      // 4. Preencher original_cost_price para aparelhos legados onde está nulo
      const { data: legacyNullProds } = await supabase
        .from("products")
        .select("id, cost_price")
        .is("original_cost_price", null);

      if (legacyNullProds && legacyNullProds.length > 0) {
        for (const lp of legacyNullProds) {
          await supabase
            .from("products")
            .update({ original_cost_price: lp.cost_price } as any)
            .eq("id", lp.id)
            .is("original_cost_price", null);
        }
      }
      
      const totalReconciled = reconciledSold + reconciledOSParts;
      if (totalReconciled > 0) {
        toast.success(`Estoque conciliado! ${reconciledSold} aparelhos e ${reconciledOSParts} peças de OS sincronizados.`);
      } else {
        toast.info("O estoque, vendas e ordens de serviço já estão 100% conciliados.");
      }
      fetchData();
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
        const optimizedVoucher = await convertToWebP(partVoucherFile);
        const fileExt = optimizedVoucher.name.split(".").pop();
        const safeName = optimizedVoucher.name.replace(/[^a-zA-Z0-9]/g, "_");
        const path = `pecas/comprovante-${Date.now()}-${safeName}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from("comprovantes").upload(path, optimizedVoucher, { upsert: true });
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

      await logAction("UPDATE_RECORD", "products", p.id, p, { ...p, status: "returned", credit_added: p.cost_price }, activeStoreId || "");

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

    const toastId = toast.loading("Enviando comprovante... 0%");
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + Math.floor(Math.random() * 15) + 5, 95);
      toast.loading(`Enviando comprovante... ${progress}%`, { id: toastId });
    }, 200);

    try {
      const optimizedFile = await convertToWebP(file);
      const fileExt = optimizedFile.name.split(".").pop();
      const safeName = optimizedFile.name.replace(/[^a-zA-Z0-9]/g, "_");
      const path = `pecas/comprovante-${Date.now()}-${safeName}.${fileExt}`;
      const { data: uploadData, error: uploadError } = await supabase.storage.from("comprovantes").upload(path, optimizedFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(uploadData.path);
      const publicUrl = urlData.publicUrl;

      const { error: dbError } = await supabase.from("products").update({ parts_payment_voucher: publicUrl } as any).eq("id", productId);
      if (dbError) throw dbError;

      clearInterval(progressInterval);
      toast.success("Comprovante enviado com sucesso!", { id: toastId });
      fetchData();
    } catch (err: any) {
      clearInterval(progressInterval);
      toast.error("Erro ao enviar comprovante: " + err.message, { id: toastId });
    } finally {
      setLoading(false);
    }
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
    setLoading(true);
    try {
      // 1. Bloquear se o produto possui venda consolidada no financeiro/fiscal
      const { data: linkedSales, error: salesCheckErr } = await supabase
        .from("sales")
        .select("id")
        .eq("product_id", id)
        .limit(1);

      if (salesCheckErr) throw salesCheckErr;
      if (linkedSales && linkedSales.length > 0) {
        toast.error("Este aparelho possui venda registrada no financeiro/fiscal e não pode ser excluído.");
        setLoading(false);
        return;
      }

      // 2. Bloquear se a peça está vinculada a Ordem de Serviço
      const { data: linkedOS, error: osCheckErr } = await supabase
        .from("service_order_items" as any)
        .select("id")
        .eq("product_id", id)
        .limit(1);

      if (osCheckErr) throw osCheckErr;
      if (linkedOS && linkedOS.length > 0) {
        toast.error("Esta peça está vinculada a uma Ordem de Serviço e não pode ser excluída.");
        setLoading(false);
        return;
      }

      // 3. Set trade_in_product_id references in sales to null
      await supabase.from("sales").update({ trade_in_product_id: null } as any).eq("trade_in_product_id", id);

      // 4. Delete references in product_history
      await supabase.from("product_history" as any).delete().eq("product_id", id);

      // 5. Delete references in product_repair_items (where this product was used as a part)
      await supabase.from("product_repair_items" as any).delete().eq("part_product_id", id);

      // 6. For repairs of this product, delete repair items first, then the repair
      const { data: repairs } = await (supabase.from("product_repairs" as any).select("id").eq("product_id", id) as any);
      if (repairs && repairs.length > 0) {
        const repairIds = repairs.map(r => r.id);
        await supabase.from("product_repair_items" as any).delete().in("repair_id", repairIds);
        await supabase.from("product_repairs" as any).delete().in("id", repairIds);
      }

      // 7. Finally delete the product
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;

      logAction("DELETE_RECORD", "products", id, productToDelete, { reason }, productToDelete?.store_id);
      toast.success("Aparelho removido com sucesso!");
      fetchData();
    } catch (error: any) {
      console.error("Erro ao deletar produto:", error);
      toast.error("Erro ao deletar produto: " + error.message);
    } finally {
      setLoading(false);
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
        <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 overflow-hidden">
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className="w-full flex items-center justify-between p-3 text-xs font-semibold text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10 transition-colors"
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span>{lowStockStores.length + lowStockAcc.length} alertas de estoque baixo detectados</span>
            </div>
            <span className="text-[10px] underline decoration-dotted">
              {showAlerts ? "Recolher detalhes" : "Ver detalhes"}
            </span>
          </button>
          
          {showAlerts && (
            <div className="border-t border-yellow-500/10 p-3 space-y-1.5 bg-background/50 max-h-[220px] overflow-y-auto">
              {lowStockStores.map(s => (
                <div key={s.id} className="flex items-center gap-2 rounded border border-destructive/20 bg-destructive/5 p-2 text-[11px]">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <p><span className="font-semibold text-foreground">{s.name}</span>: estoque baixo de aparelhos — apenas <span className="font-bold text-destructive">{storeStockCounts[s.id] || 0}</span></p>
                </div>
              ))}
              {lowStockAcc.map(a => (
                <div key={a.id} className="flex items-center gap-2 rounded border border-yellow-500/20 bg-yellow-500/5 p-2 text-[11px]">
                  <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                  <p><span className="font-semibold text-foreground">{a.name}</span>: apenas <span className="font-bold text-yellow-500">{a.quantity}</span> unidades (mín: {a.min_quantity})</p>
                </div>
              ))}
            </div>
          )}
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
            repairCostsMap={repairCostsMap}
          />
        </TabsContent>

        {/* ABA PEÇAS */}
        <TabsContent value="pecas" className="mt-4 space-y-3">
          <PecasTab
            partsSearch={partsSearch}
            setPartsSearch={setPartsSearch}
            addPartOpen={addPartOpen}
            setAddPartOpen={setAddPartOpen}
            activeStoreId={activeStoreId}
            partForm={partForm}
            setPartForm={setPartForm}
            setPartVoucherFile={setPartVoucherFile}
            suppliers={suppliers}
            supplierMap={supplierMap}
            storeMap={storeMap}
            filteredParts={filteredParts}
            formatCurrency={formatCurrency}
            handleAddPart={handleAddPart}
            handleQuickUploadVoucher={handleQuickUploadVoucher}
            handleReturnPart={handleReturnPart}
            onRequestDeletePart={(id) => {
              setDeleteId(id);
              setDeleteType("product");
              setJustification("");
              setDeleteDialogOpen(true);
            }}
            loading={loading}
          />
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
          <VendidosTab
            soldProducts={filteredProducts.filter(p => p.status === 'sold')}
            formatCurrency={formatCurrency}
            loadHistory={loadHistory}
          />
        </TabsContent>

        {/* ABA EM REPARO */}
        <TabsContent value="reparo" className="mt-4 space-y-3">
          <EmReparoTab
            inRepair={inRepair}
            activeStoreId={activeStoreId}
            storeMap={storeMap}
            formatCurrency={formatCurrency}
            setRepairProduct={setRepairProduct}
            setRepairModalOpen={setRepairModalOpen}
            setDefectsProduct={setDefectsProduct}
            setDefectsList={setDefectsList}
            setCustomDefect={setCustomDefect}
            setDefectsDialogOpen={setDefectsDialogOpen}
            loadHistory={loadHistory}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog Acessório */}
      <AccessoryModal
        open={accDialogOpen}
        onOpenChange={(o) => {
          setAccDialogOpen(o);
          if (!o) setEditAcc(null);
        }}
        editAcc={editAcc}
        accForm={accForm}
        setAccForm={setAccForm}
        activeStoreId={activeStoreId}
        storeMap={storeMap}
        onSubmit={handleAccSubmit}
        loading={loading}
      />

      {/* Transfer dialog */}
      <ProductTransferDialog
        open={transferDialogOpen}
        onOpenChange={(open) => {
          setTransferDialogOpen(open);
          if (!open) {
            setTransferProduct(null);
            setTransferStoreId("");
          }
        }}
        transferProduct={transferProduct}
        storeMap={storeMap}
        stores={stores}
        transferStoreId={transferStoreId}
        setTransferStoreId={setTransferStoreId}
        justification={justification}
        setJustification={setJustification}
        onTransfer={handleTransfer}
        loading={loading}
      />

      {/* Edit Product Dialog */}
      <ProductEditDialog
        open={editProductOpen}
        onOpenChange={setEditProductOpen}
        editForm={editForm}
        setEditForm={setEditForm}
        stores={stores}
        onSubmit={handleUpdateProduct}
        loading={loading}
      />

      {/* Product History Dialog */}
      <ProductHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        historyProduct={historyProduct}
        productHistory={productHistory}
        formatCurrency={formatCurrency}
      />

      {/* Delete Confirmation Dialog with Justification */}
      <ProductDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        justification={justification}
        setJustification={setJustification}
        onConfirmDelete={async () => {
          setLoading(true);
          if (deleteType === "product" && deleteId) {
            await handleDeleteProduct(deleteId, justification);
          } else if (deleteType === "accessory" && deleteId) {
            await handleDeleteAcc(deleteId, justification);
          }
          setLoading(false);
          setDeleteDialogOpen(false);
        }}
        loading={loading}
      />

      {/* Defects Dialog */}
      <ProductDefectsDialog
        open={defectsDialogOpen}
        onOpenChange={setDefectsDialogOpen}
        defectsProduct={defectsProduct}
        defectsList={defectsList}
        setDefectsList={setDefectsList}
        customDefect={customDefect}
        setCustomDefect={setCustomDefect}
        onSaveDefects={handleSaveDefects}
        loading={loading}
      />
      
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
