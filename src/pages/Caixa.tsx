import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Wallet, RefreshCw, Plus, Minus, History, Trash2, CheckCircle, 
  Clock, AlertTriangle, Filter, Store, User, Camera, Upload, Receipt, ArrowUpRight, Unlock, Eye,
  Truck, CreditCard, TrendingDown, TrendingUp, Phone, Building2, Wrench, ExternalLink, Smartphone, Package
} from "lucide-react";
import { toast } from "sonner";
import { logAction } from "@/utils/auditLogger";
import { SuppliersTab } from "@/components/features/caixa/SuppliersTab";
import { convertToWebP } from "@/utils/imageOptimizer";
import { openComprovante } from "@/lib/storageHelper";
import {
  CashEntry,
  CashRegister,
  Supplier,
  paymentLabels,
  statusConfig,
  formatCurrency,
  getMistoLabel,
  getMistoValues,
} from "@/components/features/caixa/types";
import { CashActionModals } from "@/components/features/caixa/CashActionModals";
import { CashRegisterDetailModal } from "@/components/features/caixa/CashRegisterDetailModal";
import { CashEntryDetailModal } from "@/components/features/caixa/CashEntryDetailModal";

const Caixa = () => {
  const { user, userRole, userPermissions, activeStoreId, userStoreIds } = useAuth();
  const [activeTab, setActiveTab] = useState("current");
  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
  const [allOpenRegisters, setAllOpenRegisters] = useState<CashRegister[]>([]);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [registersHistory, setRegistersHistory] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const selectedRegisterIdRef = useRef<string | null>(null);
  
  // Dialogs
  const [openDialog, setOpenDialog] = useState(false);
  const [entryDialog, setEntryDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [blockCloseDialog, setBlockCloseDialog] = useState(false);
  const [sangriaDialog, setSangriaDialog] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [justDialogOpened, setJustDialogOpened] = useState(false);
  // Dialog de detalhes de lançamento individual
  const [entryDetailDialog, setEntryDetailDialog] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CashEntry | null>(null);
  const [linkedServiceOrder, setLinkedServiceOrder] = useState<any | null>(null);
  const [linkedOrderItems, setLinkedOrderItems] = useState<any[]>([]);
  const [loadingLinkedOrder, setLoadingLinkedOrder] = useState(false);

  // Dialog de Ordem de Serviço aberta a partir do Caixa
  const [osModalOpen, setOsModalOpen] = useState(false);
  const [osModalOrder, setOsModalOrder] = useState<any | null>(null);
  const [osModalItems, setOsModalItems] = useState<any[]>([]);
  const [loadingOsItems, setLoadingOsItems] = useState(false);
  const [storeList, setStoreList] = useState<{ id: string; name: string }[]>([]);
  
  // Forms
  const [openForm, setOpenForm] = useState({ amount: "", note: "", receipt: null as File | null });
  const [entryForm, setEntryForm] = useState({ type: "entrada" as "entrada" | "saida", amount: "", description: "", payment_method: "dinheiro" });
  const [closeForm, setCloseForm] = useState({ amount: "", note: "", reason: "", receipt: null as File | null });
  const [sangriaForm, setSangriaForm] = useState({ amount: "", description: "" });
  const [confirmEntry, setConfirmEntry] = useState<CashEntry | null>(null);
  const [confirmFile, setConfirmFile] = useState<File | null>(null);
  const [confirmFiles, setConfirmFiles] = useState<File[]>([]);
  const [confirmOrderFile, setConfirmOrderFile] = useState<File | null>(null);
  const [justification, setJustification] = useState("");
  const [pendingAction, setPendingAction] = useState<{type: "delete" | "unconfirm" | "reopen", id: string} | null>(null);

  // View Details
  const [viewDialog, setViewDialog] = useState(false);
  const [viewRegister, setViewRegister] = useState<CashRegister | null>(null);
  const [historyEntries, setHistoryEntries] = useState<CashEntry[]>([]);
  const [loadingHistoryEntries, setLoadingHistoryEntries] = useState(false);
  
  // Suppliers state
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierDialog, setSupplierDialog] = useState(false);
  const [paySupplierDialog, setPaySupplierDialog] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({ name: "", document: "", phone: "", category: "", notes: "" });
  const [payForm, setPayForm] = useState({ amount: "", description: "", payment_method: "dinheiro", credit_adjust: "0", receipt: null as File | null });
  
  // Media Upload Utilities
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [activeTarget, setActiveTarget] = useState<"open" | "close" | "confirm" | null>(null);

  const navigate = useNavigate();

  const fetchRegister = async (storeId: string | null) => {
    if (!storeId) return;
    setLoading(true);
    
    // 1. Busca de Caixas Abertos
    let openQuery = supabase.from("cash_registers" as any).select("*").eq("status", "open");
    
    // Se NÃO for admin, filtramos pela loja ativa
    if (userRole !== "admin" && storeId !== "all") {
      openQuery = openQuery.eq("store_id", storeId);
    }
    
    const { data: openData, error: openError } = await openQuery;
    if (openError) {
      console.error("Error fetching open registers:", openError);
      toast.error("Erro ao buscar caixas abertos: " + openError.message);
    }

    const [profilesRes, storesRes] = await Promise.all([
       supabase.from("profiles").select("user_id, display_name"),
       supabase.from("stores").select("id, name")
    ]);
    
    setStoreList(storesRes.data || []);
    
    const profileMap = new Map((profilesRes.data || []).map(p => [p.user_id, p.display_name]));
    const storeMap = new Map((storesRes.data || []).map(s => [s.id, s.name]));

    const mappedOpenData = (openData || []).map((reg: any) => ({
      ...reg,
      profiles: { display_name: profileMap.get(reg.opened_by) },
      stores: { name: storeMap.get(reg.store_id) }
    }));

    // Admin always gets all open registers for monitoring
    if (userRole === "admin") {
      setAllOpenRegisters(mappedOpenData);
    }

    // Se houver um caixa selecionado manualmente, priorizamos ele
    let regToUse: CashRegister | null = null;
    const selectedId = selectedRegisterIdRef.current;

    if (userRole === "admin") {
      const activeReg = selectedId 
        ? mappedOpenData.find(r => r.id === selectedId)
        : (currentRegister ? mappedOpenData.find(r => r.id === currentRegister.id) : null);

      // Se mudou de loja, limpamos a seleção manual para evitar conflitos
      const isDifferentStore = activeReg && storeId !== "all" && activeReg.store_id !== storeId;
      const targetReg = isDifferentStore ? null : activeReg;

      if (isDifferentStore) {
        selectedRegisterIdRef.current = null;
      }

      if (targetReg) {
        setCurrentRegister(targetReg);
        regToUse = targetReg;
      } else {
        if (storeId !== "all") {
          const userOwnedReg = mappedOpenData.find((reg: any) => reg.opened_by === user?.id && reg.store_id === storeId);
          const activeOne = mappedOpenData.find((reg: any) => reg.store_id === storeId);
          const defaultReg = userOwnedReg || activeOne || null;
          setCurrentRegister(defaultReg);
          regToUse = defaultReg;
        } else {
          setCurrentRegister(null);
          regToUse = null;
        }
      }
    } else {
      // Vendedores/Gerentes sempre veem o próprio caixa da loja selecionada se existir, ou null
      const userOwnedReg = mappedOpenData.find((reg: any) => reg.opened_by === user?.id && reg.store_id === storeId);
      const activeOne = mappedOpenData.find((reg: any) => reg.store_id === storeId);
      const defaultReg = userOwnedReg || activeOne || null;
      setCurrentRegister(defaultReg);
      regToUse = defaultReg;
    }

    // regToUse já foi computado acima
    
    if (regToUse) {
       const { data: entriesData, error: entriesError } = await supabase
         .from("cash_entries" as any).select("*")
         .eq("cash_register_id", (regToUse as any).id)
         .order("confirmed", { ascending: true })
         .order("created_at", { ascending: false });
       
       if (entriesError) console.error("Error fetching entries:", entriesError);
       setEntries((entriesData as unknown as CashEntry[]) ?? []);
    } else {
       setEntries([]);
    }

    // 2. Histórico
    if (userRole === "admin" || activeTab === "history") {
      setHistoryLoading(true);
      let historyQuery = supabase.from("cash_registers" as any)
        .select("*")
        .eq("status", "closed")
        .order("opened_at", { ascending: false })
        .limit(20);
      
      if (storeId !== "all") {
        historyQuery = historyQuery.eq("store_id", storeId);
      }

      if (userRole !== "admin") {
        historyQuery = historyQuery.eq("opened_by", user?.id);
      }
      
      const { data: historyData, error: historyError } = await historyQuery;
      if (historyError) console.error("Error fetching history:", historyError);
      
      const mappedHistoryData = (historyData || []).map((reg: any) => ({
        ...reg,
        profiles: { display_name: profileMap.get(reg.opened_by) },
        stores: { name: storeMap.get(reg.store_id) }
      }));

      setRegistersHistory(mappedHistoryData as unknown as CashRegister[]);
      setHistoryLoading(false);
    }
    setLoading(false);
  };

  useEffect(() => { 
    if (activeStoreId) fetchRegister(activeStoreId); 
  }, [activeStoreId, activeTab]);

  useEffect(() => {
    const reconcileMissing = async () => {
      if (!user) return;
      const { data: missingTx } = await supabase.from("transactions").select("*").eq("type", "sale").like("description", "%[MISTO:%");
      if (!missingTx || missingTx.length === 0) return;
      let reconciledAny = false;
      for (const tx of missingTx) {
        const match = tx.description.match(/\[MISTO:(\{.*\})\]/);
        if (!match) continue;
        try {
          const parsed = JSON.parse(match[1]);
          const cleanDesc = tx.description.replace(/\[MISTO:.*\]/, '').trim();
          
          // Check if already reconciled
          const { data: ceCheck } = await supabase.from("cash_entries" as any).select("id").like("description", `${cleanDesc}%`).limit(1);
          if (ceCheck && ceCheck.length > 0) continue;
          
          // Find open register
          const { data: regList } = await supabase.from("cash_registers" as any).select("id").eq("store_id", tx.store_id).eq("status", "open").limit(1);
          if (!regList || regList.length === 0) continue;
          const regId = (regList[0] as any).id;

          const payload = {
            cash_register_id: regId, store_id: tx.store_id, type: "entrada",
            confirmed: false, created_by: tx.created_by, created_at: tx.created_at
          };

          if (parsed.dinheiro > 0) await supabase.from("cash_entries" as any).insert({ ...payload, payment_method: "dinheiro", amount: parsed.dinheiro, description: cleanDesc + " (Parte em Dinheiro)" });
          if (parsed.pix > 0) await supabase.from("cash_entries" as any).insert({ ...payload, payment_method: "pix", amount: parsed.pix, description: cleanDesc + " (Parte em PIX)" });
          if (parsed.cartao_credito > 0) await supabase.from("cash_entries" as any).insert({ ...payload, payment_method: "cartao_credito", amount: parsed.cartao_credito, description: cleanDesc + " (Parte em Cartão)" });
          
          reconciledAny = true;
        } catch (e) {
          console.error("Error reconciling tx:", tx.id, e);
        }
      }
      if (reconciledAny) fetchRegister(activeStoreId);
    };
    reconcileMissing();
  }, [user]);

  // ── Suppliers ────────────────────────────────────────────
  const fetchSuppliers = async () => {
    const { data, error } = await supabase
      .from("suppliers" as any)
      .select("*")
      .order("name");
    if (!error) setSuppliers((data as unknown as Supplier[]) ?? []);
  };

  useEffect(() => { fetchSuppliers(); }, [activeStoreId]);

  const handleSaveSupplier = async () => {
    if (!supplierForm.name) { toast.error("Informe o nome do fornecedor!"); return; }
    if (!activeStoreId || activeStoreId === "all") {
      toast.error("Selecione uma loja específica no topo antes de cadastrar um fornecedor.");
      return;
    }
    const { error } = await supabase.from("suppliers" as any).insert({
      store_id: activeStoreId,
      created_by: user?.id,
      name: supplierForm.name,
      document: supplierForm.document || null,
      phone: supplierForm.phone || null,
      category: supplierForm.category || null,
      notes: supplierForm.notes || null,
      credit_balance: 0,
    } as any);
    if (error) { toast.error("Erro ao salvar fornecedor: " + error.message); return; }
    toast.success("Fornecedor cadastrado!");
    setSupplierDialog(false);
    setSupplierForm({ name: "", document: "", phone: "", category: "", notes: "" });
    fetchSuppliers();
  };

  const handlePaySupplier = async () => {
    if (!selectedSupplier || !payForm.amount || !currentRegister) {
      toast.error("Selecione um fornecedor, valor e certifique-se que o caixa está aberto!");
      return;
    }
    const amount = parseFloat(payForm.amount) || 0;
    const creditAdjust = parseFloat(payForm.credit_adjust) || 0;

    let receiptUrl: string | null = null;
    if (payForm.receipt) {
      const storePrefix = selectedSupplier.store_id || currentRegister.store_id || activeStoreId;
      receiptUrl = await uploadReceipt(payForm.receipt, `${storePrefix}/fornecedor/${selectedSupplier.id}-${Date.now()}`);
    }

    // 1. Cash out from register
    const { error: entryErr } = await supabase.from("cash_entries" as any).insert({
      cash_register_id: currentRegister.id,
      store_id: currentRegister.store_id,
      type: "saida",
      amount,
      description: payForm.description || `Pagamento fornecedor: ${selectedSupplier.name}`,
      payment_method: payForm.payment_method,
      confirmed: true,
      receipt_url: receiptUrl,
      created_by: user?.id,
    } as any);

    if (entryErr) { toast.error("Erro ao lançar saída: " + entryErr.message); return; }

    await supabase.from("transactions").insert({
      type: "expense_pj",
      amount,
      net_amount: amount,
      description: payForm.description || `Pagamento fornecedor: ${selectedSupplier.name}`,
      category: "Fornecedores",
      store_id: currentRegister.store_id,
      created_by: user.id,
      expected_settlement_date: new Date().toISOString(),
      reconciled: true,
      receipt_url: receiptUrl
    });

    // 2. Update supplier credit balance
    const newBalance = Number(selectedSupplier.credit_balance) + amount + creditAdjust;
    await supabase.from("suppliers" as any)
      .update({ credit_balance: newBalance } as any)
      .eq("id", selectedSupplier.id);

    toast.success(`Pagamento de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amount)} registrado!`);
    setPaySupplierDialog(false);
    setPayForm({ amount: "", description: "", payment_method: "dinheiro", credit_adjust: "0", receipt: null });
    setSelectedSupplier(null);
    fetchSuppliers();
    fetchRegister(activeStoreId);
  };

  const handleDeleteSupplier = async (id: string) => {
    const { error } = await supabase.from("suppliers" as any).delete().eq("id", id);
    if (error) { toast.error("Erro ao remover fornecedor"); return; }
    toast.success("Fornecedor removido!");
    fetchSuppliers();
  };


  const uploadReceipt = async (file: File, path: string): Promise<string | null> => {
    const optimizedFile = await convertToWebP(file);
    let finalPath = path;
    if (optimizedFile.type === "image/webp" && !finalPath.toLowerCase().endsWith(".webp")) {
      finalPath = finalPath.replace(/\.[^/.]+$/, "") + ".webp";
    }
    const safePath = finalPath.replace(/[^a-zA-Z0-9.\-_/]/g, "_");
    const { data, error } = await supabase.storage.from("comprovantes").upload(safePath, optimizedFile, { upsert: true });
    if (error) { toast.error("Erro no upload: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleFileSelect = (file: File) => {
    if (activeTarget === "open")    setOpenForm(f => ({ ...f, receipt: file }));
    if (activeTarget === "close")   setCloseForm(f => ({ ...f, receipt: file }));
    if (activeTarget === "confirm") {
      setConfirmFile(file);
      setConfirmFiles(prev => [...prev, file]);
    }
  };

  const confirmedEntries = entries.filter(e => e.confirmed === true);
  
  const cashIn = confirmedEntries.filter(e => ["entrada"].includes(e.type)).reduce((s, e) => {
    if (e.payment_method === "dinheiro") return s + Number(e.amount);
    if (e.payment_method === "misto") return s + Number(getMistoValues(e.description).dinheiro || 0);
    return s;
  }, 0);
  const cashOut = confirmedEntries.filter(e => ["saida","sangria"].includes(e.type)).reduce((s, e) => {
    if (e.payment_method === "dinheiro") return s + Number(e.amount);
    if (e.payment_method === "misto") return s + Number(getMistoValues(e.description).dinheiro || 0);
    return s;
  }, 0);
  const expectedCash = Number(currentRegister?.opening_amount || 0) + cashIn - cashOut;

  const totalPix = confirmedEntries.reduce((s, e) => {
    const isOutflow = ["saida", "sangria"].includes(e.type || "");
    const coef = isOutflow ? -1 : 1;
    if (e.payment_method === "pix") return s + (coef * Number(e.amount));
    if (e.payment_method === "misto") return s + (coef * Number(getMistoValues(e.description).pix || 0));
    return s;
  }, 0);
  const totalCard = confirmedEntries.reduce((s, e) => {
    const isOutflow = ["saida", "sangria"].includes(e.type || "");
    const coef = isOutflow ? -1 : 1;
    if (["cartao_credito", "cartao_debito"].includes(e.payment_method)) return s + (coef * Number(e.amount));
    if (e.payment_method === "misto") return s + (coef * Number(getMistoValues(e.description).cartao_credito || 0));
    return s;
  }, 0);
  const totalTotal = expectedCash + totalPix + totalCard;

  const closingAmount = parseFloat(closeForm.amount) || 0;
  const expectedAmountToCompare = totalTotal;
  const difference = closingAmount - totalTotal;
  const pendingCount = entries.filter(e => !e.confirmed).length;
  const isBlind = userRole === "vendedor";

  const handleOpenRegister = async () => {
    if (!user || !activeStoreId) return;
    setLoading(true);
    let receiptUrl: string | null = null;
    const targetStoreId = activeStoreId === "all" ? userStoreIds[0] : activeStoreId;

    // Trava de segurança: impede abrir múltiplos caixas simultâneos para a mesma loja
    if (targetStoreId) {
      const { data: existingOpen } = await supabase
        .from("cash_registers" as any)
        .select("id, opened_at")
        .eq("store_id", targetStoreId)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();

      if (existingOpen) {
        toast.error("Já existe um caixa aberto para esta loja! Encerre o caixa anterior antes de abrir um novo.");
        setLoading(false);
        return;
      }
    }

    if (openForm.receipt) receiptUrl = await uploadReceipt(openForm.receipt, `${targetStoreId}/abertura/${Date.now()}-${openForm.receipt.name}`);

    const { data: reg, error } = await supabase.from("cash_registers" as any).insert({
      store_id: activeStoreId === "all" ? userStoreIds[0] : activeStoreId,
      opened_by: user.id,
      opening_amount: parseFloat(openForm.amount) || 0,
      opening_receipt_url: receiptUrl,
      status: "open",
      opened_at: new Date().toISOString(),
    } as any).select().single();

    if (error) { toast.error(error.message); setLoading(false); return; }

    await supabase.from("cash_entries" as any).insert({
      cash_register_id: (reg as any).id,
      store_id: (reg as any).store_id,
      type: "abertura",
      amount: parseFloat(openForm.amount) || 0,
      description: "Abertura de caixa",
      payment_method: "dinheiro",
      confirmed: true,
      created_by: user.id,
    } as any);

    toast.success("Caixa aberto com sucesso!");
    setOpenDialog(false);
    setOpenForm({ amount: "", note: "", receipt: null });
    fetchRegister(activeStoreId);
  };

  const handleCloseRegister = async () => {
    if (!currentRegister) return;

    const hasFinancialError = Math.abs(difference) > 0.01;
    const hasPendingEntries = pendingCount > 0;
    
    if ((hasFinancialError || hasPendingEntries) && userRole !== "admin") {
      setBlockCloseDialog(true);
      return;
    }

    if (Math.abs(difference) > 5 && !closeForm.reason) {
      toast.error("Informe o motivo da diferença!");
      return;
    }
    setLoading(true);
    let receiptUrl: string | null = null;
    if (closeForm.receipt) receiptUrl = await uploadReceipt(closeForm.receipt, `${currentRegister.store_id}/fechamento/${currentRegister.id}-${Date.now()}`);

    const { error: updateError } = await supabase.from("cash_registers" as any).update({
      closing_amount: closingAmount, expected_amount: totalTotal, difference,
      difference_reason: closeForm.reason || null,
      closing_note: closeForm.note || null,
      closing_receipt_url: receiptUrl,
      status: "closed", closed_at: new Date().toISOString(),
    }).eq("id", currentRegister.id);

    if (updateError) {
      toast.error("Erro ao fechar o caixa: " + updateError.message);
      setLoading(false);
      return;
    }

    toast.success("Caixa fechado!");
    logAction("UPDATE_RECORD" as any, "cash_registers", currentRegister.id, { status: "open" }, { status: "closed", difference });
    setCloseDialog(false);
    selectedRegisterIdRef.current = null;
    setCurrentRegister(null);
    fetchRegister(activeStoreId);
  };

  const handleEntry = async () => {
    if (!currentRegister || !user) return;
    setLoading(true);
    await supabase.from("cash_entries" as any).insert({
      cash_register_id: currentRegister.id, store_id: currentRegister.store_id,
      type: entryForm.type, amount: parseFloat(entryForm.amount) || 0,
      description: entryForm.description, payment_method: entryForm.payment_method,
      confirmed: false, created_by: user.id,
    });
    
    await supabase.from("transactions").insert({
      type: entryForm.type === "entrada" ? "income" : "expense_pj",
      amount: parseFloat(entryForm.amount) || 0,
      net_amount: parseFloat(entryForm.amount) || 0,
      description: entryForm.description,
      category: entryForm.type === "entrada" ? "Suprimento" : "Despesa Caixa",
      store_id: currentRegister.store_id,
      created_by: user.id,
      expected_settlement_date: new Date().toISOString(),
      reconciled: false
    });
    setEntryDialog(false);
    toast.success("Lançamento registrado!");
    fetchRegister(activeStoreId);
  };

  const handleSangria = async () => {
    if (!currentRegister || !user) return;
    setLoading(true);
    const { error } = await supabase.from("cash_entries" as any).insert({
      cash_register_id: currentRegister.id, store_id: currentRegister.store_id,
      type: "sangria", amount: parseFloat(sangriaForm.amount) || 0,
      description: "Sangria: " + sangriaForm.description, payment_method: "dinheiro",
      confirmed: true, created_by: user.id,
    } as any);

    if (!error) {
      await supabase.from("transactions").insert({
        type: "sangria",
        amount: parseFloat(sangriaForm.amount) || 0,
        net_amount: parseFloat(sangriaForm.amount) || 0,
        description: "Sangria: " + sangriaForm.description,
        category: "Sangria",
        store_id: currentRegister.store_id,
        created_by: user.id,
        expected_settlement_date: new Date().toISOString(),
        reconciled: true
      });
    }

    if (error) {
      toast.error("Erro na sangria: " + error.message);
    } else {
      setSangriaDialog(false);
      setSangriaForm({ amount: "", description: "" });
      toast.success("Sangria realizada!");
      fetchRegister(activeStoreId);
    }
    setLoading(false);
  };

  const resolveLinkedOrder = async (entry: CashEntry) => {
    setLoadingLinkedOrder(true);
    setLinkedServiceOrder(null);
    try {
      const desc = entry.description || "";

      // 0. Trava de segurança: Vendas de PDV, vendas de aparelhos, aberturas ou sangrias NUNCA são Ordens de Serviço
      const isSaleOrRegisterOp =
        desc.startsWith("PDV:") ||
        desc.startsWith("Venda:") ||
        entry.type === "abertura" ||
        entry.type === "sangria";

      if (isSaleOrRegisterOp) {
        // Se for venda de PDV que foi contaminada por auto-vinculação anterior, restaura reference_id
        if (desc.startsWith("PDV:") && (entry as any).reference_id) {
          const { data: isOs } = await supabase
            .from("service_orders")
            .select("id")
            .eq("id", (entry as any).reference_id)
            .maybeSingle();

          if (isOs) {
            const cleanDesc = desc.replace(/\s*\[MISTO:\{.*?\}\]/, "");
            const { data: tx } = await supabase
              .from("transactions")
              .select("id")
              .like("description", `${cleanDesc}%`)
              .limit(1)
              .maybeSingle();

            await supabase
              .from("cash_entries" as any)
              .update({ reference_id: tx?.id || null })
              .eq("id", entry.id);

            (entry as any).reference_id = tx?.id || null;
          }
        }

        setLinkedServiceOrder(null);
        setLinkedOrderItems([]);
        return;
      }

      let foundOrder: any = null;

      // 1. Diretamente por reference_id
      if ((entry as any).reference_id) {
        const { data } = await supabase
          .from("service_orders")
          .select("*")
          .eq("id", (entry as any).reference_id)
          .maybeSingle();
        if (data) foundOrder = data;
      }

      // 2. Por número de OS na descrição (ex: "OS #70", "(OS #70)", "OS 70")
      // Usa \b para evitar capturar palavras como "IOS 30", "CABOS 10", etc.
      if (!foundOrder && entry.description) {
        const match = entry.description.match(/\bOS\s*#?\s*(\d+)\b/i);
        if (match && match[1]) {
          const orderNum = parseInt(match[1], 10);
          let osQuery = supabase
            .from("service_orders")
            .select("*")
            .eq("order_number", orderNum);

          if ((entry as any).store_id && (entry as any).store_id !== "all") {
            osQuery = osQuery.eq("store_id", (entry as any).store_id);
          }

          const { data } = await osQuery.maybeSingle();
          if (data) {
            foundOrder = data;
            // Só auto-vincula se a descrição for comprovadamente formato de OS
            if (entry.description.startsWith("OS #") || entry.description.includes("(OS #")) {
              supabase.from("cash_entries" as any).update({ reference_id: data.id }).eq("id", entry.id).then();
            }
          }
        }
      }

      // 3. Fallback inteligente para peças avulsas já cadastradas ("Compra de Peça Avulsa (OS): ...")
      if (!foundOrder && entry.description && entry.description.includes("Compra de Peça Avulsa")) {
        const matchPart = entry.description.match(/Compra de Peça Avulsa(?:\s*\(.*?\))?:\s*([^\[]+)/i);
        const partName = matchPart ? matchPart[1].trim() : "";

        // Estratégia A: Busca o produto pelo nome correspondente
        let matchingProductIds: string[] = [];
        if (partName) {
          const { data: prods } = await supabase
            .from("products")
            .select("id, name")
            .ilike("name", `%${partName}%`)
            .limit(10);
          if (prods && prods.length > 0) {
            matchingProductIds = prods.map(p => p.id);
          }
        }

        // Estratégia B: Busca item de OS pelo product_id encontrado ou pelo custo unitário
        let matchedOrderId: string | null = null;
        if (matchingProductIds.length > 0) {
          const { data: itemsByProd } = await (supabase
            .from("service_order_items" as any)
            .select("service_order_id")
            .in("product_id", matchingProductIds)
            .limit(10) as any);
          if (itemsByProd && itemsByProd.length > 0) {
            matchedOrderId = itemsByProd[0].service_order_id;
          }
        }

        // Fallback por custo unitário caso não encontre por nome
        if (!matchedOrderId) {
          const { data: itemsByCost } = await (supabase
            .from("service_order_items" as any)
            .select("service_order_id")
            .eq("unit_cost", entry.amount)
            .limit(10) as any);
          if (itemsByCost && itemsByCost.length > 0) {
            matchedOrderId = itemsByCost[0].service_order_id;
          }
        }

        if (matchedOrderId) {
          const { data } = await supabase
            .from("service_orders")
            .select("*")
            .eq("id", matchedOrderId)
            .maybeSingle();
          if (data) {
            foundOrder = data;
            supabase.from("cash_entries" as any).update({ reference_id: data.id }).eq("id", entry.id).then();
          }
        }
      }

      // 4. Fallback pelo prefixo de OS no comprovante anexado (ex: "os-3b2d1844/...")
      if (!foundOrder && entry.receipt_url) {
        const matchOs = entry.receipt_url.match(/os-([a-f0-9\-]{8})/i);
        if (matchOs && matchOs[1]) {
          const { data: osList } = await supabase
            .from("service_orders")
            .select("*")
            .ilike("id", `${matchOs[1]}%`)
            .limit(1);
          if (osList && osList.length > 0) {
            foundOrder = osList[0];
            supabase.from("cash_entries" as any).update({ reference_id: foundOrder.id }).eq("id", entry.id).then();
          }
        }
      }

      setLinkedServiceOrder(foundOrder);
      if (foundOrder) {
        const { data: items } = await supabase
          .from("service_order_items" as any)
          .select(`*, products (name, brand, model, parts_payment_voucher)`)
          .eq("service_order_id", foundOrder.id);
        setLinkedOrderItems(items || []);
      } else {
        setLinkedOrderItems([]);
      }
    } catch (err) {
      console.error("Erro ao resolver OS vinculada ao lançamento:", err);
      setLinkedOrderItems([]);
    } finally {
      setLoadingLinkedOrder(false);
    }
  };

  const handleOpenFullOs = async (order: any) => {
    setOsModalOrder(order);
    setOsModalOpen(true);
    setLoadingOsItems(true);
    try {
      const { data: items } = await (supabase
        .from("service_order_items" as any)
        .select("*")
        .eq("service_order_id", order.id) as any);

      if (items && items.length > 0) {
        const productIds = Array.from(new Set(items.map((it: any) => it.product_id).filter(Boolean))) as string[];
        const prodMap = new Map<string, any>();
        if (productIds.length > 0) {
          const { data: prods } = await supabase
            .from("products")
            .select("id, name, brand, model")
            .in("id", productIds);
          (prods || []).forEach((p: any) => prodMap.set(p.id, p));
        }
        const enrichedItems = items.map((it: any) => ({
          ...it,
          products: prodMap.get(it.product_id) || null
        }));
        setOsModalItems(enrichedItems);
      } else {
        setOsModalItems([]);
      }
    } catch (err) {
      console.error("Erro ao carregar peças da OS:", err);
      setOsModalItems([]);
    } finally {
      setLoadingOsItems(false);
    }
  };

  const openEntryDetail = (entry: CashEntry) => {
    setSelectedEntry(entry);
    setEntryDetailDialog(true);
    resolveLinkedOrder(entry);
    // Se pendente, prepara confirmação embutida
    if (!entry.confirmed) {
      setConfirmEntry(entry);
      setConfirmFile(null);
      setConfirmFiles([]);
      setConfirmOrderFile(null);
    }
  };

  const openConfirmDialog = (entry: CashEntry) => {
    setConfirmEntry(entry);
    setConfirmFile(null);
    setConfirmFiles([]);
    setConfirmOrderFile(null);
    setConfirmDialog(true);
  };

  const handleConfirmEntry = async (fromDetailDialog = false) => {
    if (!confirmEntry) return;
    const isCash = confirmEntry.payment_method === "dinheiro";
    const filesToUpload = confirmFiles.length > 0 ? confirmFiles : (confirmFile ? [confirmFile] : []);

    // Se não for dinheiro em espécie, é obrigatório anexar comprovante
    if (!isCash && filesToUpload.length === 0) {
      toast.error("Anexe pelo menos um comprovante para confirmar este lançamento!");
      return;
    }

    setLoading(true);
    const confirmStoreId = (confirmEntry as any).store_id || activeStoreId;

    let finalReceiptUrl: string | null = null;
    if (filesToUpload.length > 0) {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < filesToUpload.length; i++) {
        const f = filesToUpload[i];
        const u = await uploadReceipt(f, `${confirmStoreId}/confirmacao/${confirmEntry.id}-${Date.now()}-${i}`);
        if (u) uploadedUrls.push(u);
      }
      if (uploadedUrls.length === 1) {
        finalReceiptUrl = uploadedUrls[0];
      } else if (uploadedUrls.length > 1) {
        finalReceiptUrl = JSON.stringify(uploadedUrls);
      }
    }

    let orderUrl: string | null = null;
    if (confirmOrderFile) {
      orderUrl = await uploadReceipt(confirmOrderFile, `${confirmStoreId}/pedido-confirmacao/${confirmEntry.id}-${Date.now()}`);
    }

    const { error: updateErr } = await supabase.from("cash_entries" as any).update({
      confirmed: true,
      ...(finalReceiptUrl ? { receipt_url: finalReceiptUrl } : {}),
      ...(orderUrl ? { supplier_order_receipt_url: orderUrl } : {}),
    }).eq("id", confirmEntry.id);

    if (updateErr) {
      toast.error("Erro ao confirmar lançamento: " + updateErr.message);
    } else {
      toast.success("Confirmado com sucesso!");
      if (fromDetailDialog) {
        setEntryDetailDialog(false);
        setSelectedEntry(null);
      } else {
        setConfirmDialog(false);
      }
      fetchRegister(activeStoreId);
    }
    setLoading(false);
  };

  const handleDeleteEntry = async (id: string, reason: string) => {
    setLoading(true);
    await supabase.from("cash_entries" as any).delete().eq("id", id);
    logAction("DELETE_RECORD" as any, "cash_entries", id, null, { reason });
    toast.success("Lançamento apagado!");
    fetchRegister(activeStoreId);
    setLoading(false);
  };

  const handleUnconfirmEntry = async (id: string, reason: string) => {
    setLoading(true);
    await supabase.from("cash_entries" as any).update({ confirmed: false, receipt_url: null }).eq("id", id);
    logAction("UPDATE_RECORD" as any, "cash_entries", id, { status: "confirmed" }, { status: "unconfirmed", reason });
    toast.success("Lançamento desconfirmado!");
    fetchRegister(activeStoreId);
    setLoading(false);
  };

  const openViewDialog = async (reg: CashRegister) => {
    setViewRegister(reg);
    setViewDialog(true);
    setLoadingHistoryEntries(true);
    
    const { data: entriesData, error } = await supabase
      .from("cash_entries" as any)
      .select("*")
      .eq("cash_register_id", reg.id)
      .order("created_at", { ascending: false });
      
    if (error) {
      toast.error("Erro ao carregar detalhes: " + error.message);
    } else {
      setHistoryEntries(entriesData as unknown as CashEntry[]);
    }
    setLoadingHistoryEntries(false);
  };

  const handleReopenRegister = async (id: string, reason: string) => {
    setLoading(true);
    await supabase.from("cash_registers" as any).update({ status: "open", closed_at: null }).eq("id", id);
    logAction("UPDATE_RECORD" as any, "cash_registers", id, { status: "closed" }, { status: "open", reason });
    toast.success("Caixa reaberto!");
    setActiveTab("current");
    fetchRegister(activeStoreId);
    setLoading(false);
  };



  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
        onChange={e => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            if (activeTarget === "confirm") {
              setConfirmFiles(prev => [...prev, ...files]);
              setConfirmFile(files[0]);
            } else {
              handleFileSelect(files[0]);
            }
          }
          e.target.value = "";
        }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => {
          if (e.target.files?.[0]) {
            if (activeTarget === "confirm") {
              setConfirmFiles(prev => [...prev, e.target.files![0]]);
              setConfirmFile(e.target.files[0]);
            } else {
              handleFileSelect(e.target.files[0]);
            }
          }
          e.target.value = "";
        }} />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Caixa</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Visão consolidada e controle financeiro {activeStoreId === "all" ? "(Todas as Lojas)" : ""}</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)}>
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="current" className="flex-1 sm:flex-none">Caixa Atual</TabsTrigger>
          {userRole === "admin" && (
            <TabsTrigger value="all-open" className="flex-1 sm:flex-none">Caixas Abertos</TabsTrigger>
          )}
          {(userRole === "admin" || userPermissions?.gerenciar_financeiro) && (
            <TabsTrigger value="history" className="flex-1 sm:flex-none">Histórico (Admin)</TabsTrigger>
          )}
          <TabsTrigger value="suppliers" className="flex-1 sm:flex-none flex items-center gap-1">
            <Truck className="h-3.5 w-3.5" /> Fornecedores
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all-open" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {allOpenRegisters.length === 0 ? (
              <div className="col-span-full py-12 text-center text-muted-foreground bg-muted/20 rounded-xl border border-dashed">
                Nenhum caixa aberto no momento.
              </div>
            ) : (
              allOpenRegisters.map(reg => {
                const operatorName = reg.profiles?.display_name || "Operador";
                const initial = operatorName.charAt(0).toUpperCase();
                const openedDate = new Date(reg.opened_at);
                const diffMs = Date.now() - openedDate.getTime();
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

                let relativeTime = "";
                if (diffDays > 0) {
                  relativeTime = `há ${diffDays} dia${diffDays > 1 ? "s" : ""}`;
                } else if (diffHours > 0) {
                  relativeTime = `há ${diffHours}h`;
                } else {
                  relativeTime = "hoje";
                }

                return (
                  <Card key={reg.id} className="overflow-hidden border-primary/20 hover:border-primary/40 transition-all cursor-pointer group"
                    onClick={() => {
                      selectedRegisterIdRef.current = reg.id;
                      setCurrentRegister(reg);
                      setActiveTab("current");
                    }}>
                    <div className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                            {initial}
                          </div>
                          <div>
                            <p className="font-bold text-sm tracking-tight">{operatorName}</p>
                            <Badge variant="outline" className="text-[10px] py-0 h-4 bg-primary/5 border-primary/20">
                              {reg.stores?.name || "Loja"}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Aberto em</p>
                          <p className="text-xs font-mono font-medium">
                            {openedDate.toLocaleDateString("pt-BR")} às {openedDate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          <span className="text-[10px] text-amber-500 font-semibold">{relativeTime}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-border/50">
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase font-semibold">Fundo Inicial</p>
                          <p className="font-bold text-sm">{formatCurrency(reg.opening_amount)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-[10px] text-destructive hover:bg-destructive/10 border-destructive/30"
                            onClick={(e) => {
                              e.stopPropagation();
                              selectedRegisterIdRef.current = reg.id;
                              setCurrentRegister(reg);
                              setCloseForm({
                                amount: String(reg.opening_amount || 0),
                                note: "Fechamento pelo Administrador",
                                reason: "Regularização de caixa",
                                receipt: null,
                              });
                              setCloseDialog(true);
                            }}
                          >
                            Fechar Caixa
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] group-hover:bg-primary group-hover:text-white">
                            Gerenciar <ArrowUpRight className="ml-1 h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </TabsContent>

        <TabsContent value="current" className="mt-4 space-y-4">
          {!currentRegister ? (
            <Card className="border-dashed border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-4">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                  <Wallet className="h-8 w-8 text-muted-foreground opacity-50" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">Caixa fechado</p>
                  <p className="text-xs text-muted-foreground mt-1">Abra o caixa para começar a registrar lançamentos</p>
                </div>
                {pendingCount > 0 && (
                  <div className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-500">
                    <Clock className="h-4 w-4 shrink-0" />
                    {pendingCount} lançamento(s) pendente(s) aguardando confirmação
                  </div>
                )}
                <Button className="gap-2" onClick={() => setOpenDialog(true)} disabled={!activeStoreId || activeStoreId === "all"}>
                  <Unlock className="h-4 w-4" /> Abrir Caixa
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {pendingCount > 0 && (
                <div className="flex items-center gap-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-4 py-3">
                  <Clock className="h-4 w-4 text-orange-500 shrink-0" />
                  <p className="text-sm text-orange-500 font-medium">{pendingCount} lançamento(s) pendente(s) de confirmação.</p>
                </div>
              )}

              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <Unlock className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-semibold text-sm text-primary">Caixa Aberto</p>
                        <p className="text-xs text-muted-foreground">Desde {new Date(currentRegister.opened_at).toLocaleString("pt-BR")}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {userRole === "admin" && (
                        <Button className="h-9 text-[11px] bg-transparent border border-yellow-500/30 text-yellow-500 hover:bg-yellow-500/10" onClick={() => setSangriaDialog(true)}>Sangria</Button>
                      )}
                      <Button className="h-9 text-[11px] bg-transparent border border-border text-foreground hover:bg-muted" onClick={() => setEntryDialog(true)}>Lançamento</Button>
                      <Button className="h-9 text-[11px] bg-destructive hover:bg-destructive/90 text-white" onClick={() => {
                        if (pendingCount > 0 && userRole !== "admin") {
                          setBlockCloseDialog(true);
                        } else {
                          setCloseDialog(true);
                        }
                      }}>Fechar Caixa</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: "Fundo Inicial",  value: Number(currentRegister.opening_amount), color: "text-blue-500", visible: true },
                  { label: "Saldo Dinheiro", value: expectedCash, color: "text-primary", visible: !isBlind },
                  { label: "PIX / Cartão",   value: totalPix + totalCard, color: "text-purple-500", visible: !isBlind },
                  { label: "Saldo Total",    value: totalTotal, color: "text-primary font-extrabold", visible: !isBlind },
                ].map(card => (
                  <Card key={card.label} className="border-border/50">
                    <CardContent className="p-4">
                      <p className="text-[11px] text-muted-foreground uppercase">{card.label}</p>
                      <p className={`font-display text-lg font-bold mt-1 ${card.visible ? card.color : "text-muted-foreground"}`}>
                        {card.visible ? formatCurrency(card.value) : "******"}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="border-border/50">
                <CardHeader className="pb-2"><CardTitle className="text-sm">Lançamentos Recentes ({entries.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {entries.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between text-xs border rounded-lg p-2 bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => openEntryDetail(entry)}>
                      <div className="min-w-0 flex-1 mr-2">
                        <p className="font-medium truncate">{(entry.description || "").replace(/\s*\[MISTO:\{.*?\}\]/, "")}</p>
                        <p className="text-muted-foreground">{entry.payment_method === "misto" ? getMistoLabel(entry.description) : (paymentLabels[entry.payment_method || ""] || "Outro")} · {new Date(entry.created_at).toLocaleTimeString("pt-BR")}</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <div className="space-y-1">
                          <p className={`font-bold ${["entrada","abertura"].includes(entry.type) ? "text-primary" : "text-destructive"}`}>
                            {["entrada","abertura"].includes(entry.type) ? "+" : "-"}{formatCurrency(Number(entry.amount))}
                          </p>
                          {!entry.confirmed && <Badge className="text-[8px] bg-orange-500/20 text-orange-600">Pendente</Badge>}
                        </div>
                        {userRole === "admin" && (
                          <div className="flex flex-col gap-1">
                            {entry.confirmed && (
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-yellow-500" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPendingAction({ type: "unconfirm", id: entry.id });
                                  setJustification("");
                                  setJustDialogOpened(true);
                                }}>
                                <Unlock className="h-3 w-3" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingAction({ type: "delete", id: entry.id });
                                setJustification("");
                                setJustDialogOpened(true);
                              }}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          <Card className="border-border/50">
            <CardHeader><CardTitle className="text-sm">Histórico de Fechamentos (Admin)</CardTitle></CardHeader>
            <CardContent>
              {historyLoading ? <p className="text-center py-4">Carregando...</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="border-b">
                      <tr>
                        <th className="py-2">Data</th>
                        <th className="py-2">Loja</th>
                        <th className="py-2">Vendedor</th>
                        <th className="py-2 text-right">Fechamento</th>
                        <th className="py-2 text-right">Diferença</th>
                        <th className="py-2 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {registersHistory.map(reg => (
                        <tr key={reg.id}>
                          <td className="py-2">{new Date(reg.opened_at).toLocaleDateString("pt-BR")}</td>
                          <td className="py-2">
                            <Badge variant="outline" className="text-[9px] py-0 h-4">{reg.stores?.name || "—"}</Badge>
                          </td>
                          <td className="py-2 font-medium">{reg.profiles?.display_name || "—"}</td>
                          <td className="py-2 text-right font-bold">{formatCurrency(Number(reg.closing_amount))}</td>
                          <td className={`py-2 text-right ${Math.abs(reg.difference || 0) < 0.1 ? "text-primary" : "text-destructive"}`}>
                            {formatCurrency(reg.difference || 0)}
                          </td>
                          <td className="py-2 text-center flex items-center justify-center gap-2">
                            <Button variant="outline" className="h-6 px-2 text-[9px] gap-1"
                              onClick={() => openViewDialog(reg)}>
                              <Eye className="h-3 w-3" /> Visualizar
                            </Button>
                            {userRole === "admin" && (
                              <Button className="h-6 text-[9px]" 
                                onClick={() => {
                                  setPendingAction({ type: "reopen", id: reg.id });
                                  setJustification("");
                                  setJustDialogOpened(true);
                                }}>
                                Reabrir
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers" className="mt-4 space-y-4">
          <SuppliersTab
            suppliers={suppliers}
            setSupplierDialog={setSupplierDialog}
            supplierDialog={supplierDialog}
            supplierForm={supplierForm}
            setSupplierForm={setSupplierForm}
            handleSaveSupplier={handleSaveSupplier}
            setSelectedSupplier={setSelectedSupplier}
            setPaySupplierDialog={setPaySupplierDialog}
            paySupplierDialog={paySupplierDialog}
            payForm={payForm}
            setPayForm={setPayForm}
            handlePaySupplier={handlePaySupplier}
            handleDeleteSupplier={handleDeleteSupplier}
            currentRegister={currentRegister}
            formatCurrency={formatCurrency}
            fileInputRef={fileInputRef}
            cameraInputRef={cameraInputRef}
            setActiveTarget={setActiveTarget}
          />
          {!currentRegister && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-500">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Abra o caixa para registrar pagamentos a fornecedores.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modais de Ação do Caixa */}
      <CashActionModals
        openDialog={openDialog}
        setOpenDialog={setOpenDialog}
        openForm={openForm}
        setOpenForm={setOpenForm}
        handleOpenRegister={handleOpenRegister}
        confirmDialog={confirmDialog}
        setConfirmDialog={setConfirmDialog}
        confirmEntry={confirmEntry}
        confirmFile={confirmFile}
        setConfirmFile={setConfirmFile}
        confirmFiles={confirmFiles}
        setConfirmFiles={setConfirmFiles}
        confirmOrderFile={confirmOrderFile}
        setConfirmOrderFile={setConfirmOrderFile}
        handleConfirmEntry={handleConfirmEntry}
        closeDialog={closeDialog}
        setCloseDialog={setCloseDialog}
        closeForm={closeForm}
        setCloseForm={setCloseForm}
        handleCloseRegister={handleCloseRegister}
        isBlind={isBlind}
        expectedCash={expectedCash}
        totalPix={totalPix}
        totalCard={totalCard}
        totalTotal={totalTotal}
        difference={difference}
        sangriaDialog={sangriaDialog}
        setSangriaDialog={setSangriaDialog}
        sangriaForm={sangriaForm}
        setSangriaForm={setSangriaForm}
        handleSangria={handleSangria}
        entryDialog={entryDialog}
        setEntryDialog={setEntryDialog}
        entryForm={entryForm}
        setEntryForm={setEntryForm}
        handleEntry={handleEntry}
        blockCloseDialog={blockCloseDialog}
        setBlockCloseDialog={setBlockCloseDialog}
        pendingCount={pendingCount}
        justDialogOpened={justDialogOpened}
        setJustDialogOpened={setJustDialogOpened}
        justification={justification}
        setJustification={setJustification}
        pendingAction={pendingAction}
        setPendingAction={setPendingAction}
        handleDeleteEntry={handleDeleteEntry}
        handleUnconfirmEntry={handleUnconfirmEntry}
        handleReopenRegister={handleReopenRegister}
        loading={loading}
      />

      {/* Modal de Detalhes do Caixa Fechado (Histórico) */}
      <CashRegisterDetailModal
        open={viewDialog}
        onOpenChange={setViewDialog}
        viewRegister={viewRegister}
        historyEntries={historyEntries}
        loadingHistoryEntries={loadingHistoryEntries}
      />

      {/* Modal de Detalhes de Lançamento e Ordem de Serviço Vinculada */}
      <CashEntryDetailModal
        entryDetailDialog={entryDetailDialog}
        setEntryDetailDialog={setEntryDetailDialog}
        selectedEntry={selectedEntry}
        setSelectedEntry={setSelectedEntry}
        linkedServiceOrder={linkedServiceOrder}
        linkedOrderItems={linkedOrderItems}
        loadingLinkedOrder={loadingLinkedOrder}
        confirmFile={confirmFile}
        setConfirmFile={setConfirmFile}
        confirmFiles={confirmFiles}
        setConfirmFiles={setConfirmFiles}
        confirmOrderFile={confirmOrderFile}
        setConfirmOrderFile={setConfirmOrderFile}
        handleConfirmEntry={handleConfirmEntry}
        loading={loading}
        handleOpenFullOs={handleOpenFullOs}
        osModalOpen={osModalOpen}
        setOsModalOpen={setOsModalOpen}
        osModalOrder={osModalOrder}
        osModalItems={osModalItems}
        loadingOsItems={loadingOsItems}
        storeList={storeList}
        currentRegister={currentRegister}
        navigate={navigate}
      />
    </div>
  );
};

export default Caixa;
