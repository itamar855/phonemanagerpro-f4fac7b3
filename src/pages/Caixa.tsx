import { useState, useEffect, useRef } from "react";
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
  Truck, CreditCard, TrendingDown, TrendingUp, Phone, Building2
} from "lucide-react";
import { toast } from "sonner";
import { logAction } from "@/utils/auditLogger";
import { SuppliersTab } from "@/components/features/caixa/SuppliersTab";

interface CashEntry {
  id: string;
  type: "entrada" | "saida" | "sangria" | "abertura";
  amount: number;
  description: string;
  payment_method: string;
  confirmed: boolean;
  receipt_url: string | null;
  created_at: string;
}

interface CashRegister {
  id: string;
  store_id: string;
  opened_by: string;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number | null;
  difference: number | null;
  difference_reason?: string | null;
  closing_note?: string | null;
  status: "open" | "closed";
  profiles?: { display_name: string };
  stores?: { name: string };
}

const Caixa = () => {
  const { user, userRole, userPermissions, activeStoreId, userStoreIds } = useAuth();
  const [activeTab, setActiveTab] = useState("current");
  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
  const [allOpenRegisters, setAllOpenRegisters] = useState<CashRegister[]>([]);
  const [entries, setEntries] = useState<CashEntry[]>([]);
  const [registersHistory, setRegistersHistory] = useState<CashRegister[]>([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Dialogs
  const [openDialog, setOpenDialog] = useState(false);
  const [entryDialog, setEntryDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [sangriaDialog, setSangriaDialog] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(false);
  const [justDialogOpened, setJustDialogOpened] = useState(false);
  
  // Forms
  const [openForm, setOpenForm] = useState({ amount: "", note: "", receipt: null as File | null });
  const [entryForm, setEntryForm] = useState({ type: "entrada" as "entrada" | "saida", amount: "", description: "", payment_method: "dinheiro" });
  const [closeForm, setCloseForm] = useState({ amount: "", note: "", reason: "", receipt: null as File | null });
  const [sangriaForm, setSangriaForm] = useState({ amount: "", description: "" });
  const [confirmEntry, setConfirmEntry] = useState<CashEntry | null>(null);
  const [confirmFile, setConfirmFile] = useState<File | null>(null);
  const [justification, setJustification] = useState("");
  const [pendingAction, setPendingAction] = useState<{type: "delete" | "unconfirm" | "reopen", id: string} | null>(null);

  // View Details
  const [viewDialog, setViewDialog] = useState(false);
  const [viewRegister, setViewRegister] = useState<CashRegister | null>(null);
  const [historyEntries, setHistoryEntries] = useState<CashEntry[]>([]);
  const [loadingHistoryEntries, setLoadingHistoryEntries] = useState(false);
  
  // Suppliers state
  interface Supplier {
    id: string; store_id: string | null; name: string; document: string | null;
    phone: string | null; email: string | null; category: string | null;
    notes: string | null; credit_balance: number; created_at: string;
  }
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

  const paymentLabels: Record<string, string> = {
    dinheiro: "Dinheiro",
    pix: "PIX",
    cartao_credito: "Crédito",
    cartao_debito: "Débito",
    transferencia: "Transferência",
    misto: "Misto"
  };

  const getMistoValues = (description: string | null): Record<string, number> => {
    if (!description) return {};
    const match = description.match(/\[MISTO:(\{.*?\})\]/);
    if (match && match[1]) {
      try { return JSON.parse(match[1]); } catch { return {}; }
    }
    return {};
  };

  const getMistoLabel = (description: string | null): string => {
    const vals = getMistoValues(description);
    const parts: string[] = [];
    if (vals.dinheiro > 0) parts.push(`Dinheiro: ${formatCurrency(vals.dinheiro)}`);
    if (vals.pix > 0) parts.push(`PIX: ${formatCurrency(vals.pix)}`);
    if (vals.cartao_credito > 0) parts.push(`Cartão: ${formatCurrency(vals.cartao_credito)}`);
    return parts.length > 0 ? `Misto (${parts.join(" | ")})` : "Misto";
  };

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

    // Se for Vendedor/Gerente, o caixa padrão deve ser o dele especificamente nesta loja selecionada
    const userOwnedReg = mappedOpenData.find((reg: any) => reg.opened_by === user?.id && reg.store_id === storeId);
    const activeOne = mappedOpenData.find((reg: any) => reg.store_id === storeId);

    if (userRole !== "admin") {
      // Vendedores/Gerentes sempre veem o próprio caixa da loja selecionada se existir, ou null
      setCurrentRegister(userOwnedReg || null);
    } else {
      // Administradores:
      if (storeId !== "all") {
        const isCurrentlyManagingOpen = currentRegister ? mappedOpenData.find((r: any) => r.id === currentRegister.id) : null;
        // Se mudou de loja e não estávamos gerenciando outro caixa aberto especificamente nessa nova loja:
        if (!isCurrentlyManagingOpen || currentRegister.store_id !== storeId) {
          setCurrentRegister(userOwnedReg || activeOne || null);
        }
      } else if (currentRegister) {
        // No modo "Todas as Unidades", atualizamos os dados se o caixa ainda estiver aberto
        const updatedReg = mappedOpenData.find(r => r.id === currentRegister.id);
        if (updatedReg) setCurrentRegister(updatedReg);
      }
    }

    // Identifica qual caixa as entradas devem carregar
    const regToUse = currentRegister || (userRole !== "admin" ? (userOwnedReg || activeOne) : activeOne);
    
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
    const { error } = await supabase.from("suppliers" as any).insert({
      store_id: activeStoreId === "all" ? null : activeStoreId,
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
      receiptUrl = await uploadReceipt(payForm.receipt, `fornecedor/${selectedSupplier.id}-${Date.now()}`);
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
    const newBalance = Number(selectedSupplier.credit_balance) - amount + creditAdjust;
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
    const safePath = path.replace(/[^a-zA-Z0-9.\-_/]/g, "_");
    const { data, error } = await supabase.storage.from("comprovantes").upload(safePath, file, { upsert: true });
    if (error) { toast.error("Erro no upload: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  const handleFileSelect = (file: File) => {
    if (activeTarget === "open")    setOpenForm(f => ({ ...f, receipt: file }));
    if (activeTarget === "close")   setCloseForm(f => ({ ...f, receipt: file }));
    if (activeTarget === "confirm") setConfirmFile(file);
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
    if (e.payment_method === "pix") return s + Number(e.amount);
    if (e.payment_method === "misto") return s + Number(getMistoValues(e.description).pix || 0);
    return s;
  }, 0);
  const totalCard = confirmedEntries.reduce((s, e) => {
    if (["cartao_credito", "cartao_debito"].includes(e.payment_method)) return s + Number(e.amount);
    if (e.payment_method === "misto") return s + Number(getMistoValues(e.description).cartao_credito || 0);
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
    if (openForm.receipt) receiptUrl = await uploadReceipt(openForm.receipt, `abertura/${activeStoreId}-${Date.now()}-${openForm.receipt.name}`);

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
    if (Math.abs(difference) > 5 && !closeForm.reason) {
      toast.error("Informe o motivo da diferença!");
      return;
    }
    setLoading(true);
    let receiptUrl: string | null = null;
    if (closeForm.receipt) receiptUrl = await uploadReceipt(closeForm.receipt, `fechamento/${currentRegister.id}-${Date.now()}`);

    await supabase.from("cash_registers" as any).update({
      closing_amount: closingAmount, expected_amount: totalTotal, difference,
      difference_reason: closeForm.reason || null,
      closing_note: closeForm.note || null,
      closing_receipt_url: receiptUrl,
      status: "closed", closed_at: new Date().toISOString(),
    }).eq("id", currentRegister.id);

    toast.success("Caixa fechado!");
    logAction("DELETE_RECORD" as any, "cash_registers", currentRegister.id, { status: "open" }, { status: "closed", difference });
    setCloseDialog(false);
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

  const openConfirmDialog = (entry: CashEntry) => {
    setConfirmEntry(entry);
    setConfirmFile(null);
    setConfirmDialog(true);
  };

  const handleConfirmEntry = async () => {
    if (!confirmEntry || !confirmFile) return;
    setLoading(true);
    const url = await uploadReceipt(confirmFile, `confirmacao/${confirmEntry.id}-${Date.now()}`);
    if (url) {
      await supabase.from("cash_entries" as any).update({ confirmed: true, receipt_url: url }).eq("id", confirmEntry.id);
      toast.success("Confirmado!");
      setConfirmDialog(false);
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

  const formatCurrency = (val: number | null) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val || 0);

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); e.target.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); e.target.value = ""; }} />

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
              allOpenRegisters.map(reg => (
                <Card key={reg.id} className="overflow-hidden border-primary/20 hover:border-primary/40 transition-all cursor-pointer group"
                  onClick={() => {
                    setCurrentRegister(reg);
                    setActiveTab("current");
                  }}>
                  <div className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {reg.profiles?.display_name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-sm tracking-tight">{reg.profiles?.display_name}</p>
                          <Badge variant="outline" className="text-[10px] py-0 h-4 bg-primary/5 border-primary/20">
                            {reg.stores?.name}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Aberto há</p>
                        <p className="text-xs font-mono">{new Date(reg.opened_at).toLocaleTimeString()}</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase font-semibold">Fundo</p>
                        <p className="font-bold text-sm">{formatCurrency(reg.opening_amount)}</p>
                      </div>
                      <div className="text-right">
                         <Button variant="ghost" size="sm" className="h-7 text-[10px] group-hover:bg-primary group-hover:text-white">
                           Gerenciar <ArrowUpRight className="ml-1 h-3 w-3" />
                         </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))
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
                      <Button className="h-9 text-[11px] bg-destructive hover:bg-destructive/90 text-white" onClick={() => setCloseDialog(true)}>Fechar Caixa</Button>
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
                    <div key={entry.id} className="flex items-center justify-between text-xs border rounded-lg p-2 bg-muted/20" onClick={() => !entry.confirmed && openConfirmDialog(entry)}>
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

      {/* Dialogs */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogTitle>Abrir Caixa</DialogTitle>
          <div className="space-y-4 mt-2">
            <Label className="text-xs">Fundo inicial (R$)</Label>
            <Input type="number" step="0.01" value={openForm.amount} onChange={e => setOpenForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            <div className="space-y-2">
              <Label className="text-xs">Comprovante</Label>
              <Input type="file" onChange={e => setOpenForm(f => ({ ...f, receipt: e.target.files?.[0] || null }))} />
            </div>
            <Button className="w-full" onClick={handleOpenRegister} disabled={loading}>Abrir Caixa</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDialog} onOpenChange={setConfirmDialog}>
        <DialogContent>
          <DialogTitle>Confirmar Lançamento</DialogTitle>
          <div className="space-y-4 mt-2">
            <p className="text-xs">{confirmEntry?.description} - {confirmEntry && formatCurrency(Number(confirmEntry.amount))}</p>
            <div className="space-y-2">
              <Label className="text-xs">Comprovante (obrigatório)</Label>
              <Input type="file" onChange={e => setConfirmFile(e.target.files?.[0] || null)} />
            </div>
            <Button className="w-full" onClick={handleConfirmEntry} disabled={loading || !confirmFile}>Confirmar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogTitle>Fechar Caixa</DialogTitle>
          <div className="space-y-4 mt-2">
            {!isBlind && (
              <div className="space-y-1 bg-muted/30 p-3 rounded-lg border border-border/50">
                <div className="flex justify-between text-[10px] uppercase text-muted-foreground font-bold">
                  <span>Dinheiro (Gaveta):</span>
                  <span>{formatCurrency(expectedCash)}</span>
                </div>
                <div className="flex justify-between text-[10px] uppercase text-muted-foreground font-bold border-b pb-1">
                  <span>PIX e Cartão:</span>
                  <span>{formatCurrency(totalPix + totalCard)}</span>
                </div>
                <div className="flex justify-between text-xs font-bold pt-1 text-primary">
                  <span>Total Geral Esperado:</span>
                  <span>{formatCurrency(totalTotal)}</span>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs">Valor Total Informado (R$)</Label>
              <Input type="number" step="0.01" value={closeForm.amount} onChange={e => setCloseForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
              {!isBlind && (
                <p className={`text-xs font-semibold ${Math.abs(difference) < 0.1 ? "text-primary" : "text-destructive"}`}>
                  Diferença: {formatCurrency(difference)}
                </p>
              )}
            </div>
            {Math.abs(difference) > 0.1 && (
              <Textarea value={closeForm.reason} onChange={e => setCloseForm(f => ({ ...f, reason: e.target.value }))} placeholder="Motivo da diferença..." className="min-h-[60px]" />
            )}
            <div className="space-y-2">
              <Label className="text-xs">Comprovante</Label>
              <Input type="file" onChange={e => setCloseForm(f => ({ ...f, receipt: e.target.files?.[0] || null }))} />
            </div>
            <Button className="w-full bg-destructive text-white" onClick={handleCloseRegister} disabled={loading || !closeForm.amount}>Fechar Caixa</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={sangriaDialog} onOpenChange={setSangriaDialog}>
        <DialogContent>
          <DialogTitle>Realizar Sangria</DialogTitle>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor da Sangria (Dinheiro)</Label>
              <Input type="number" step="0.01" value={sangriaForm.amount} onChange={e => setSangriaForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição / Destino</Label>
              <Input value={sangriaForm.description} onChange={e => setSangriaForm(f => ({ ...f, description: e.target.value }))} placeholder="Ex: Retirada para o banco, pagamento fornecedor..." />
            </div>
            <Button className="w-full bg-yellow-600 hover:bg-yellow-700 text-white" onClick={handleSangria} disabled={loading || !sangriaForm.amount}>
              Confirmar Sangria
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={entryDialog} onOpenChange={setEntryDialog}>
        <DialogContent>
          <DialogTitle>Novo Lançamento</DialogTitle>
          <div className="space-y-4 mt-2">
             <Select value={entryForm.type} onValueChange={v => setEntryForm(f => ({ ...f, type: v as any }))}>
               <SelectTrigger><SelectValue /></SelectTrigger>
               <SelectContent><SelectItem value="entrada">Entrada</SelectItem><SelectItem value="saida">Saída</SelectItem></SelectContent>
             </Select>
             <Input value={entryForm.description} onChange={e => setEntryForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição" />
             <Input type="number" step="0.01" value={entryForm.amount} onChange={e => setEntryForm(f => ({ ...f, amount: e.target.value }))} placeholder="Valor" />
             <Button className="w-full" onClick={handleEntry} disabled={loading}>Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={viewDialog} onOpenChange={setViewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogTitle>Detalhes do Caixa Fechado</DialogTitle>
          {viewRegister && (
            <div className="space-y-4 mt-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-muted/20 p-4 rounded-lg border">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Abertura</p>
                  <p className="font-medium text-sm">{new Date(viewRegister.opened_at).toLocaleString("pt-BR")}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Fechamento</p>
                  <p className="font-medium text-sm">{viewRegister.closed_at ? new Date(viewRegister.closed_at).toLocaleString("pt-BR") : "-"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Usuário</p>
                  <p className="font-medium text-sm">{viewRegister.profiles?.display_name || "Desconhecido"}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase font-semibold">Loja</p>
                  <p className="font-medium text-sm text-primary">{viewRegister.stores?.name || "Desconhecida"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card className="border-border/50">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Fundo Inicial</p>
                    <p className="font-bold text-blue-500">{formatCurrency(viewRegister.opening_amount)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Valor Informado</p>
                    <p className="font-bold text-primary">{formatCurrency(viewRegister.closing_amount)}</p>
                  </CardContent>
                </Card>
                <Card className="border-border/50">
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Valor Esperado</p>
                    <p className="font-bold text-muted-foreground">{formatCurrency(viewRegister.expected_amount)}</p>
                  </CardContent>
                </Card>
                <Card className={`border-border/50 ${Math.abs(viewRegister.difference || 0) > 0 ? "border-destructive/30 bg-destructive/5" : ""}`}>
                  <CardContent className="p-3">
                    <p className="text-[10px] text-muted-foreground uppercase">Diferença</p>
                    <p className={`font-bold ${Math.abs(viewRegister.difference || 0) > 0 ? "text-destructive" : "text-primary"}`}>
                      {formatCurrency(viewRegister.difference)}
                    </p>
                  </CardContent>
                </Card>
              </div>
              
              {viewRegister.difference_reason && (
                <div className="bg-destructive/10 border border-destructive/20 p-3 rounded-md text-sm text-destructive">
                  <p className="font-semibold text-xs uppercase mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3"/> Motivo da Diferença</p>
                  <p>{viewRegister.difference_reason}</p>
                </div>
              )}
              {viewRegister.closing_note && (
                <div className="bg-muted p-3 rounded-md text-sm">
                  <p className="font-semibold text-xs uppercase mb-1">Observação do Fechamento</p>
                  <p>{viewRegister.closing_note}</p>
                </div>
              )}

              <div className="mt-6 border rounded-lg overflow-hidden">
                <div className="bg-muted px-4 py-2 border-b">
                  <h3 className="text-sm font-semibold">Lançamentos ({historyEntries.length})</h3>
                </div>
                <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
                  {loadingHistoryEntries ? (
                    <p className="text-center py-4 text-xs text-muted-foreground">Carregando...</p>
                  ) : historyEntries.length === 0 ? (
                    <p className="text-center py-4 text-xs text-muted-foreground">Nenhum lançamento registrado neste caixa.</p>
                  ) : (
                    historyEntries.map(entry => (
                      <div key={entry.id} className="flex items-center justify-between text-xs border rounded-lg p-2 bg-muted/20">
                        <div className="min-w-0 flex-1 mr-2">
                          <p className="font-medium truncate">{(entry.description || "").replace(/\s*\[MISTO:\{.*?\}\]/, "")}</p>
                          <p className="text-muted-foreground">
                            {entry.payment_method === "misto" ? getMistoLabel(entry.description) : (paymentLabels[entry.payment_method || ""] || "Outro")} · {new Date(entry.created_at).toLocaleTimeString("pt-BR")}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`font-bold ${["entrada","abertura"].includes(entry.type) ? "text-primary" : "text-destructive"}`}>
                            {["entrada","abertura"].includes(entry.type) ? "+" : "-"}{formatCurrency(Number(entry.amount))}
                          </p>
                          {!entry.confirmed && <Badge className="text-[8px] bg-orange-500/20 text-orange-600 mt-1">Não confirmado</Badge>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={justDialogOpened} onOpenChange={setJustDialogOpened}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Justificar Ação
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground italic">
              {pendingAction?.type === "delete" ? "Esta exclusão é permanente." : 
               pendingAction?.type === "unconfirm" ? "Este lançamento voltará a ser pendente." : 
               "O caixa será reaberto."}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-primary">Campo Obrigatório: Motivo</Label>
              <Input value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Informe o motivo desta alteração..." required className="h-10" />
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setJustDialogOpened(false)}>Cancelar</Button>
              <Button variant={pendingAction?.type === "delete" ? "destructive" : "default"} className="flex-1" disabled={!justification || loading}
                onClick={async () => {
                  if (!pendingAction) return;
                  if (pendingAction.type === "delete") await handleDeleteEntry(pendingAction.id, justification);
                  if (pendingAction.type === "unconfirm") await handleUnconfirmEntry(pendingAction.id, justification);
                  if (pendingAction.type === "reopen") await handleReopenRegister(pendingAction.id, justification);
                  setJustDialogOpened(false);
                  setPendingAction(null);
                }}
              >
                {loading ? "Processando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Caixa;
