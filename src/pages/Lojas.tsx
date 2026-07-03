import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { logAction } from "@/utils/auditLogger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus, Store, MapPin, Landmark, Trash2, FileText, Phone, Edit2,
  Upload, CheckCircle, Building, Camera, RefreshCw, ArrowDownRight, Tag, AlertCircle
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import type { Tables } from "@/integrations/supabase/types";

const statusLabels: Record<string, string> = {
  active: "Ativa", inactive: "Inativa", renovation: "Em reforma", development: "Em desenvolvimento",
};
const statusColors: Record<string, string> = {
  active: "bg-primary/15 text-primary border-primary/20",
  inactive: "bg-muted text-muted-foreground border-border",
  renovation: "bg-accent/15 text-accent border-accent/20",
  development: "bg-secondary text-secondary-foreground border-border",
};

type BankAccount = {
  id: string; store_id: string; bank_name: string; account_type: string;
  agency: string | null; account_number: string | null; pix_key: string | null;
  holder_name: string | null; holder_document?: string | null; holder_cpf_cnpj?: string | null; is_primary: boolean;
  credit_fee_percent?: number | null; credit_settlement_days?: number | null;
  debit_fee_percent?: number | null; debit_settlement_days?: number | null;
  pix_fee_percent?: number | null; pix_settlement_days?: number | null;
};

type StoreDetails = {
  name: string; cnpj: string; phone: string; whatsapp: string;
  instagram: string; website: string; logo_url: string; pdf_footer: string;
};

const emptyDetails: StoreDetails = {
  name: "", cnpj: "", phone: "", whatsapp: "", instagram: "", website: "", logo_url: "", pdf_footer: "",
};

const Lojas = () => {
  const { userRole, userPermissions, activeStoreId } = useAuth();
  const [stores, setStores] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<Tables<"fixed_expenses">[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [fixedDialogOpen, setFixedDialogOpen] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [editingFixedId, setEditingFixedId] = useState<string | null>(null);

  const [form, setForm] = useState({ name: "", address: "", status: "active" });
  const [bankForm, setBankForm] = useState({
    bank_name: "", account_type: "corrente", agency: "", account_number: "",
    pix_key: "", holder_name: "", holder_cpf_cnpj: "", is_primary: false,
    owner_type: "PJ",
    credit_fee_percent: "0", credit_settlement_days: "30",
    debit_fee_percent: "0", debit_settlement_days: "1",
    pix_fee_percent: "0", pix_settlement_days: "0"
  });
  const [detailsForm, setDetailsForm] = useState<StoreDetails>(emptyDetails);
  
  const [fixedForm, setFixedForm] = useState({
    description: "",
    amount: "",
    category: "",
    due_day: "1",
    active: true
  });

  const logoInputRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    let storesQuery = supabase.from("stores").select("*").order("created_at");
    
    // If not admin, filter by active store
    if (userRole !== "admin" && activeStoreId) {
      storesQuery = storesQuery.eq("id", activeStoreId);
    }

    const [storesRes, bankRes, fixedRes] = await Promise.all([
      storesQuery,
      supabase.from("store_bank_accounts").select("*"),
      supabase.from("fixed_expenses").select("*").eq("is_pf", false).order("due_day"),
    ]);
    setStores(storesRes.data ?? []);
    setBankAccounts((bankRes.data as any[])?.map(acc => ({
      ...acc,
      holder_cpf_cnpj: acc.holder_document || acc.holder_cpf_cnpj
    })) ?? []);
    setFixedExpenses(fixedRes.data ?? []);
  };

  useEffect(() => { fetchData(); }, []);

  const isAdmin = userRole === "admin" || (userRole === "gerente" && userPermissions?.lojas);

  // ── Loja ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from("stores").insert({
      name: form.name, address: form.address || null, status: form.status,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("Loja cadastrada!");
      logAction("CREATE_RECORD", "stores", null, null, { name: form.name, address: form.address, status: form.status });
      setDialogOpen(false);
      setForm({ name: "", address: "", status: "active" });
      fetchData();
    }
    setLoading(false);
  };

  // ── Conta bancária ────────────────────────────────────────────────────────
  const handleBankSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId) return;
    setLoading(true);
    const { error } = await supabase.from("store_bank_accounts").insert({
      // PF accounts must NOT be tied to any store — store_id is null
      store_id: bankForm.owner_type === "PF" ? null : selectedStoreId,
      bank_name: bankForm.bank_name,
      account_type: bankForm.account_type, agency: bankForm.agency || null,
      account_number: bankForm.account_number || null, pix_key: bankForm.pix_key || null,
      holder_name: bankForm.holder_name || null, holder_cpf_cnpj: bankForm.holder_cpf_cnpj || null,
      owner_type: bankForm.owner_type,
      is_primary: bankForm.is_primary,
      credit_fee_percent: parseFloat(bankForm.credit_fee_percent) || 0,
      credit_settlement_days: parseInt(bankForm.credit_settlement_days) || 30,
      debit_fee_percent: parseFloat(bankForm.debit_fee_percent) || 0,
      debit_settlement_days: parseInt(bankForm.debit_settlement_days) || 1,
      pix_fee_percent: parseFloat(bankForm.pix_fee_percent) || 0,
      pix_settlement_days: parseInt(bankForm.pix_settlement_days) || 0,
    } as any);
    if (error) toast.error(error.message);
    else {
      toast.success("Conta cadastrada!");
      logAction("CREATE_RECORD", "store_bank_accounts", null, null, { ...bankForm, store_id: selectedStoreId });
      setBankDialogOpen(false);
      setBankForm({ bank_name: "", account_type: "corrente", agency: "", account_number: "", pix_key: "", holder_name: "", holder_cpf_cnpj: "", is_primary: false, owner_type: "PJ", credit_fee_percent: "0", credit_settlement_days: "30", debit_fee_percent: "0", debit_settlement_days: "1", pix_fee_percent: "0", pix_settlement_days: "0" });
      fetchData();
    }
    setLoading(false);
  };

  const deleteBankAccount = async (id: string) => {
    const { error } = await supabase.from("store_bank_accounts").delete().eq("id", id);
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Conta removida!");
      logAction("DELETE_RECORD", "store_bank_accounts", id, { id }, null);
      fetchData();
    }
  };

  // ── Detalhes da loja ──────────────────────────────────────────────────────
  const openDetailsDialog = (store: any) => {
    setSelectedStoreId(store.id);
    setDetailsForm({
      name:       store.name       ?? "",
      cnpj:       store.cnpj       ?? "",
      phone:      store.phone      ?? "",
      whatsapp:   store.whatsapp   ?? "",
      instagram:  store.instagram  ?? "",
      website:    store.website    ?? "",
      logo_url:   store.logo_url   ?? "",
      pdf_footer: store.pdf_footer ?? "",
    });
    setDetailsDialogOpen(true);
  };

  const handleLogoUpload = async (file: File) => {
    setLogoUploading(true);
    const ext = file.name.split(".").pop();
    const path = `logos/${selectedStoreId}-${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage
      .from("comprovantes").upload(path, file, { upsert: true });
    if (error) { toast.error("Erro ao enviar logo: " + error.message); setLogoUploading(false); return; }
    const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(data.path);
    setDetailsForm(f => ({ ...f, logo_url: urlData.publicUrl }));
    setLogoUploading(false);
    toast.success("Logo enviada!");
  };

  const handleDetailsSave = async () => {
    if (!selectedStoreId) return;
    setLoading(true);
    const { error } = await supabase.from("stores").update({
      name:       detailsForm.name,
      cnpj:       detailsForm.cnpj       || null,
      phone:      detailsForm.phone      || null,
      whatsapp:   detailsForm.whatsapp   || null,
      instagram:  detailsForm.instagram  || null,
      website:    detailsForm.website    || null,
      logo_url:   detailsForm.logo_url   || null,
      pdf_footer: detailsForm.pdf_footer || null,
    } as any).eq("id", selectedStoreId);

    if (error) toast.error(error.message);
    else {
      toast.success("Detalhes salvos! O PDF da OS já usará essas informações.");
      setDetailsDialogOpen(false);
      fetchData();
    }
    setLoading(false);
  };

  // ── Gastos Fixos ──────────────────────────────────────────────────────────
  const handleSaveFixedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStoreId || !supabase.auth.getUser()) return;
    setLoading(true);

    const userRes = await supabase.auth.getUser();
    const userId = userRes.data.user?.id;

    const payload = {
      description: fixedForm.description,
      amount: parseFloat(fixedForm.amount) || 0,
      category: fixedForm.category || null,
      due_day: parseInt(fixedForm.due_day) || 1,
      is_pf: false,
      store_id: selectedStoreId,
      active: fixedForm.active,
      created_by: userId,
    };

    if (editingFixedId) {
      const { error } = await supabase.from("fixed_expenses").update(payload).eq("id", editingFixedId);
      if (error) toast.error(error.message);
      else {
        toast.success("Gasto fixo atualizado!");
        setFixedDialogOpen(false);
        setEditingFixedId(null);
        fetchData();
      }
    } else {
      const { error } = await supabase.from("fixed_expenses").insert(payload);
      if (error) toast.error(error.message);
      else {
        toast.success("Gasto fixo cadastrado!");
        setFixedDialogOpen(false);
        fetchData();
      }
    }
    setLoading(false);
  };

  const deleteFixedExpense = async (id: string) => {
    const { error } = await supabase.from("fixed_expenses").delete().eq("id", id);
    if (error) toast.error("Erro: " + error.message);
    else { toast.success("Gasto removido!"); fetchData(); }
  };

  const handleLaunchStoreFixedExpenses = async (storeId: string) => {
    const storeExpenses = fixedExpenses.filter(e => e.store_id === storeId && e.active);
    if (storeExpenses.length === 0) {
      toast.error("Não há gastos fixos ativos para esta loja.");
      return;
    }

    const now = new Date();
    const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(now);
    
    if (!window.confirm(`Deseja lançar os ${storeExpenses.length} gastos fixos desta loja para o mês de ${monthName}?`)) return;

    setLoading(true);
    const userRes = await supabase.auth.getUser();
    const userId = userRes.data.user?.id;

    const transactionsToInsert = storeExpenses.map(e => ({
      type: "expense_pj",
      store_id: storeId,
      amount: e.amount,
      description: `[Fixo] ${e.description}`,
      category: e.category,
      created_by: userId,
      expected_settlement_date: new Date(now.getFullYear(), now.getMonth(), Math.min(e.due_day || 1, 28)).toISOString(),
      reconciled: false,
      net_amount: e.amount
    }));

    const { error } = await supabase.from("transactions").insert(transactionsToInsert as any);

    if (error) toast.error("Erro ao lançar: " + error.message);
    else { toast.success("Gastos fixos lançados com sucesso!"); fetchData(); }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Lojas</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Seus pontos comerciais</p>
        </div>
        {isAdmin && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 h-10"><Plus className="h-4 w-4" /> Nova Loja</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display">Cadastrar Loja</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Nome</Label>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Loja Centro" required className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Endereço</Label>
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Rua das Flores, 123" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativa</SelectItem>
                      <SelectItem value="inactive">Inativa</SelectItem>
                      <SelectItem value="renovation">Em reforma</SelectItem>
                      <SelectItem value="development">Em desenvolvimento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
                  {loading ? "Salvando..." : "Cadastrar"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Store cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {stores.length > 0 ? stores.map((store) => {
          const accounts = bankAccounts.filter((a) => a.store_id === store.id);
          const hasDetails = store.cnpj || store.phone || store.logo_url;
          return (
            <Card key={store.id} className="border-border/50 shadow-lg shadow-black/10">
              <CardContent className="p-4 space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    {store.logo_url ? (
                      <img src={store.logo_url} alt="Logo" className="h-10 w-10 rounded-lg object-contain bg-muted border border-border shrink-0" />
                    ) : (
                      <div className="rounded-lg bg-primary/15 p-2 shrink-0">
                        <Store className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold text-sm truncate">{store.name}</h3>
                      {store.address && (
                        <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate">{store.address}</span>
                        </div>
                      )}
                      {store.cnpj && <p className="text-[10px] text-muted-foreground mt-0.5">CNPJ: {store.cnpj}</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <Badge className={`text-[10px] ${statusColors[store.status]}`}>
                      {statusLabels[store.status]}
                    </Badge>
                    {hasDetails && (
                      <Badge className="text-[9px] bg-primary/10 text-primary border-primary/20 gap-1">
                        <CheckCircle className="h-2.5 w-2.5" /> PDF configurado
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Contatos rápidos */}
                {(store.phone || store.whatsapp || store.instagram) && (
                  <div className="flex flex-wrap gap-2">
                    {store.phone && (
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Phone className="h-3 w-3" /> {store.phone}
                      </span>
                    )}
                  </div>
                )}

                {/* Tabs: Banco + PDF */}
                <Tabs defaultValue="bank" className="w-full">
                  <TabsList className="h-7 w-full">
                    <TabsTrigger value="bank" className="flex-1 text-[10px] h-6">
                      <Landmark className="h-3 w-3 mr-1" /> Contas Bancárias
                    </TabsTrigger>
                    <TabsTrigger value="pdf" className="flex-1 text-[10px] h-6">
                      <FileText className="h-3 w-3 mr-1" /> Detalhes PDF
                    </TabsTrigger>
                    <TabsTrigger value="fixed" className="flex-1 text-[10px] h-6 font-bold text-primary">
                      <RefreshCw className="h-3 w-3 mr-1" /> Gastos Fixos
                    </TabsTrigger>
                  </TabsList>

                  {/* Aba Banco */}
                  <TabsContent value="bank" className="mt-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">{accounts.length} conta(s) cadastrada(s)</p>
                      {isAdmin && (
                        <Button className="h-6 text-[10px] px-2 bg-transparent text-primary hover:bg-primary/10"
                          onClick={() => { setSelectedStoreId(store.id); setBankDialogOpen(true); }}>
                          <Plus className="h-3 w-3 mr-1" /> Adicionar
                        </Button>
                      )}
                    </div>
                    {accounts.length > 0 ? accounts.map((acc) => (
                      <div key={acc.id} className="rounded-lg bg-muted/50 p-2.5 text-xs space-y-0.5">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">{acc.bank_name} ({acc.account_type})</p>
                          {isAdmin && (
                            <Button className="h-5 w-5 bg-transparent p-0 hover:bg-destructive/10" onClick={() => deleteBankAccount(acc.id)}>
                               <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          )}
                        </div>
                        {acc.agency && <p className="text-muted-foreground">Ag: {acc.agency} · CC: {acc.account_number}</p>}
                        {acc.pix_key && <p className="text-muted-foreground">PIX: {acc.pix_key}</p>}
                        {acc.holder_name && <p className="text-muted-foreground">{acc.holder_name}</p>}
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">Crédito: {acc.credit_fee_percent}% em {acc.credit_settlement_days}d</span>
                          <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">Débito: {acc.debit_fee_percent}% em {acc.debit_settlement_days}d</span>
                          <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded">Pix: {acc.pix_fee_percent}% em {acc.pix_settlement_days}d</span>
                        </div>
                      </div>
                    )) : (
                      <p className="text-[11px] text-muted-foreground">Nenhuma conta cadastrada</p>
                    )}
                  </TabsContent>

                  {/* Aba PDF */}
                  <TabsContent value="pdf" className="mt-2">
                    {store.cnpj || store.phone || store.pdf_footer ? (
                      <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                        {store.cnpj     && <p><span className="text-muted-foreground">CNPJ:</span> {store.cnpj}</p>}
                        {store.phone    && <p><span className="text-muted-foreground">Tel:</span> {store.phone}</p>}
                        {store.whatsapp && <p><span className="text-muted-foreground">WhatsApp:</span> {store.whatsapp}</p>}
                        {store.instagram && <p><span className="text-muted-foreground">Instagram:</span> {store.instagram}</p>}
                        {store.website  && <p><span className="text-muted-foreground">Site:</span> {store.website}</p>}
                        {store.pdf_footer && <p className="text-muted-foreground italic mt-1">"{store.pdf_footer}"</p>}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Nenhum detalhe configurado</p>
                    )}
                    {isAdmin && (
                      <Button className="w-full mt-2 h-8 text-xs gap-1.5 bg-transparent border border-primary/20 text-primary hover:bg-primary/10"
                        onClick={() => openDetailsDialog(store)}>
                        <Building className="h-3.5 w-3.5" />
                        {store.cnpj || store.phone ? "Editar Detalhes" : "Configurar Detalhes do PDF"}
                      </Button>
                    )}
                  </TabsContent>

                  {/* Aba Gastos Fixos */}
                  <TabsContent value="fixed" className="mt-2 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground">Custos recorrentes da loja</p>
                      {isAdmin && (
                        <div className="flex gap-1">
                          <Button className="h-6 text-[10px] px-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                            onClick={() => handleLaunchStoreFixedExpenses(store.id)} disabled={loading}>
                            <ArrowDownRight className="h-3 w-3 mr-1" /> Lançar Mês
                          </Button>
                          <Button className="h-6 text-[10px] px-2 bg-transparent text-primary hover:bg-primary/10"
                            onClick={() => { setSelectedStoreId(store.id); setEditingFixedId(null); setFixedForm({ description: "", amount: "", category: "", due_day: "1", active: true }); setFixedDialogOpen(true); }}>
                            <Plus className="h-3 w-3 mr-1" /> Adicionar
                          </Button>
                        </div>
                      )}
                    </div>
                    {fixedExpenses.filter(e => e.store_id === store.id).length > 0 ? (
                      <div className="space-y-1.5">
                        {fixedExpenses.filter(e => e.store_id === store.id).map((e) => (
                          <div key={e.id} className={`rounded-lg p-2 text-xs flex items-center justify-between gap-2 ${e.active ? "bg-muted/50" : "bg-muted/20 opacity-60"}`}>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{e.description}</p>
                              <p className="text-[9px] text-muted-foreground">Dia {e.due_day} · {e.category}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-destructive">R$ {e.amount.toFixed(2)}</p>
                              {isAdmin && (
                                <div className="flex gap-0.5">
                                  <Button className="h-5 w-5 p-0 bg-transparent hover:bg-muted" onClick={() => { setSelectedStoreId(store.id); setEditingFixedId(e.id); setFixedForm({ description: e.description, amount: e.amount.toString(), category: e.category || "", due_day: (e.due_day || 1).toString(), active: e.active || false }); setFixedDialogOpen(true); }}>
                                    <Edit2 className="h-3 w-3 text-muted-foreground" />
                                  </Button>
                                  <Button className="h-5 w-5 p-0 bg-transparent hover:bg-destructive/10" onClick={() => deleteFixedExpense(e.id)}>
                                    <Trash2 className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">Nenhum gasto fixo configurado</p>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          );
        }) : (
          <Card className="col-span-full border-border/50">
            <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Store className="h-10 w-10 mb-3 opacity-30" />
              <p className="font-medium text-sm">Nenhuma loja cadastrada</p>
              <p className="text-xs mt-1">{isAdmin ? "Cadastre sua primeira loja" : "Peça ao admin para cadastrar"}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Dialog Conta Bancária ─────────────────────────────────────────── */}
      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">Cadastrar Conta Bancária</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBankSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo de Conta</Label>
              <Select value={bankForm.owner_type} onValueChange={(v) => setBankForm({ ...bankForm, owner_type: v })}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PJ">🏢 Empresarial (PJ) — vinculada à loja</SelectItem>
                  <SelectItem value="PF">👤 Pessoal (PF) — minha conta particular</SelectItem>
                </SelectContent>
              </Select>
              {bankForm.owner_type === "PF" && (
                <p className="text-[10px] text-muted-foreground">Contas PF aparecem apenas na aba Pessoal do painel Contas.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Banco</Label>
                <Input value={bankForm.bank_name} onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })} placeholder="Nubank, Itaú..." required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Tipo de Conta</Label>
                <Select value={bankForm.account_type} onValueChange={(v) => setBankForm({ ...bankForm, account_type: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="pagamento">Pagamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Agência</Label>
                <Input value={bankForm.agency} onChange={(e) => setBankForm({ ...bankForm, agency: e.target.value })} placeholder="0001" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Conta</Label>
                <Input value={bankForm.account_number} onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })} placeholder="12345-6" className="h-10" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Chave PIX</Label>
              <Input value={bankForm.pix_key} onChange={(e) => setBankForm({ ...bankForm, pix_key: e.target.value })} placeholder="CPF, e-mail, telefone..." className="h-10" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Titular</Label>
                <Input value={bankForm.holder_name} onChange={(e) => setBankForm({ ...bankForm, holder_name: e.target.value })} placeholder="Nome do titular" className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CPF/CNPJ</Label>
                <Input value={bankForm.holder_cpf_cnpj} onChange={(e) => setBankForm({ ...bankForm, holder_cpf_cnpj: e.target.value })} placeholder="000.000.000-00" className="h-9" />
              </div>
            </div>
            
            <p className="text-xs font-semibold text-primary mt-4 pt-2 border-t border-border">Configuração da Maquininha / Taxas</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Crédito - Taxa (%)</Label>
                <Input type="number" step="0.01" value={bankForm.credit_fee_percent} onChange={(e) => setBankForm({ ...bankForm, credit_fee_percent: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Crédito - Recebimento (Dias)</Label>
                <Input type="number" value={bankForm.credit_settlement_days} onChange={(e) => setBankForm({ ...bankForm, credit_settlement_days: e.target.value })} className="h-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Débito - Taxa (%)</Label>
                <Input type="number" step="0.01" value={bankForm.debit_fee_percent} onChange={(e) => setBankForm({ ...bankForm, debit_fee_percent: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Débito - Recebimento (Dias)</Label>
                <Input type="number" value={bankForm.debit_settlement_days} onChange={(e) => setBankForm({ ...bankForm, debit_settlement_days: e.target.value })} className="h-9" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Pix - Taxa (%)</Label>
                <Input type="number" step="0.01" value={bankForm.pix_fee_percent} onChange={(e) => setBankForm({ ...bankForm, pix_fee_percent: e.target.value })} className="h-9" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Pix - Recebimento (Dias)</Label>
                <Input type="number" value={bankForm.pix_settlement_days} onChange={(e) => setBankForm({ ...bankForm, pix_settlement_days: e.target.value })} className="h-9" />
              </div>
            </div>
            <Button type="submit" className="w-full h-11 font-semibold" disabled={loading}>
              {loading ? "Salvando..." : "Cadastrar Conta"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Detalhes PDF ───────────────────────────────────────────── */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Detalhes para o PDF da OS
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-primary flex items-start gap-2">
              <FileText className="h-4 w-4 shrink-0 mt-0.5" />
              Essas informações aparecem no cabeçalho e rodapé do PDF da Ordem de Serviço gerado para os clientes.
            </div>

            {/* Logo */}
            <div className="space-y-2">
              <Label className="text-xs">Logo da Loja</Label>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleLogoUpload(e.target.files[0]); e.target.value = ""; }} />
              {detailsForm.logo_url ? (
                <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <img src={detailsForm.logo_url} alt="Logo" className="h-12 w-12 rounded object-contain bg-white border border-border" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-primary font-medium">Logo carregada</p>
                    <p className="text-[10px] text-muted-foreground truncate">{detailsForm.logo_url}</p>
                  </div>
                  <Button className="h-7 text-[10px] bg-transparent text-primary hover:bg-primary/10"
                    onClick={() => setDetailsForm(f => ({ ...f, logo_url: "" }))}>Remover</Button>
                </div>
              ) : (
                <Button className="w-full h-10 gap-2 text-xs bg-transparent border border-border hover:bg-muted" onClick={() => logoInputRef.current?.click()} disabled={logoUploading}>
                  {logoUploading ? (
                    <><div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" /> Enviando...</>
                  ) : (
                    <><Upload className="h-4 w-4" /> Enviar Logo (PNG, JPG)</>
                  )}
                </Button>
              )}
            </div>

            {/* Dados da empresa */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Building className="h-3 w-3" /> Dados da Empresa
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Nome da Loja</Label>
                <Input value={detailsForm.name} onChange={e => setDetailsForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Ex: Cell Manager Centro" className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">CNPJ</Label>
                <Input value={detailsForm.cnpj} onChange={e => setDetailsForm(f => ({ ...f, cnpj: e.target.value }))}
                  placeholder="00.000.000/0000-00" className="h-10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone</Label>
                  <Input value={detailsForm.phone} onChange={e => setDetailsForm(f => ({ ...f, phone: e.target.value }))}
                    placeholder="(87) 99999-9999" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1"><Phone className="h-3 w-3 text-green-500" /> WhatsApp</Label>
                  <Input value={detailsForm.whatsapp} onChange={e => setDetailsForm(f => ({ ...f, whatsapp: e.target.value }))}
                    placeholder="(87) 99999-9999" className="h-10" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">Instagram</Label>
                  <Input value={detailsForm.instagram} onChange={e => setDetailsForm(f => ({ ...f, instagram: e.target.value }))}
                    placeholder="@suaassistencia" className="h-10" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">Site</Label>
                  <Input value={detailsForm.website} onChange={e => setDetailsForm(f => ({ ...f, website: e.target.value }))}
                    placeholder="www.suaassistencia.com.br" className="h-10" />
                </div>
              </div>
            </div>

            {/* Rodapé PDF */}
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <FileText className="h-3 w-3" /> Mensagem no Rodapé do PDF
              </Label>
              <Textarea value={detailsForm.pdf_footer}
                onChange={e => setDetailsForm(f => ({ ...f, pdf_footer: e.target.value }))}
                placeholder="Ex: Obrigado pela preferência! Garantia de 90 dias nos serviços realizados."
                className="min-h-[80px]" />
              <p className="text-[10px] text-muted-foreground">Aparece no final do PDF da OS enviado ao cliente.</p>
            </div>

            {/* Preview */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Preview do Cabeçalho PDF</p>
              <div className="flex items-center gap-3">
                {detailsForm.logo_url ? (
                  <img src={detailsForm.logo_url} alt="Logo" className="h-10 w-10 rounded object-contain bg-white border" />
                ) : (
                  <div className="h-10 w-10 rounded bg-primary/20 flex items-center justify-center">
                    <Store className="h-5 w-5 text-primary opacity-50" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-bold">{detailsForm.name || "Nome da Loja"}</p>
                  {detailsForm.cnpj && <p className="text-[10px] text-muted-foreground">CNPJ: {detailsForm.cnpj}</p>}
                  {detailsForm.phone && <p className="text-[10px] text-muted-foreground">Tel: {detailsForm.phone}</p>}
                  {detailsForm.instagram && <p className="text-[10px] text-muted-foreground">📸 {detailsForm.instagram}</p>}
                </div>
              </div>
              {detailsForm.pdf_footer && (
                <p className="text-[10px] text-muted-foreground italic border-t border-border pt-2 mt-2">{detailsForm.pdf_footer}</p>
              )}
            </div>

            <Button className="w-full h-11" onClick={handleDetailsSave} disabled={loading}>
              {loading ? "Salvando..." : "Salvar Detalhes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog Gastos Fixos ─────────────────────────────────────────── */}
      <Dialog open={fixedDialogOpen} onOpenChange={setFixedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" /> 
              {editingFixedId ? "Editar Gasto Fixo" : "Novo Gasto Fixo"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveFixedExpense} className="space-y-4">
            <div className="rounded bg-primary/5 p-3 text-[10px] text-primary flex items-start gap-2 border border-primary/10">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Gastos fixos são modelos que você "lança" no financeiro da loja todo mês com um clique.
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Descrição do Gasto</Label>
              <Input value={fixedForm.description} onChange={e => setFixedForm({ ...fixedForm, description: e.target.value })}
                placeholder="Ex: Aluguel da Loja, Internet, MEI..." required className="h-10" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$)</Label>
                <Input type="number" step="0.01" value={fixedForm.amount} onChange={e => setFixedForm({ ...fixedForm, amount: e.target.value })}
                  placeholder="0.00" required className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dia do Vencimento</Label>
                <Input type="number" min="1" max="31" value={fixedForm.due_day} onChange={e => setFixedForm({ ...fixedForm, due_day: e.target.value })}
                  required className="h-10" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select value={fixedForm.category} onValueChange={v => setFixedForm({ ...fixedForm, category: v })}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Aluguel">🏠 Aluguel</SelectItem>
                  <SelectItem value="Energia/Água">⚡ Energia/Água</SelectItem>
                  <SelectItem value="Internet">🌐 Internet</SelectItem>
                  <SelectItem value="Salários">👥 Salários</SelectItem>
                  <SelectItem value="Impostos">📄 Impostos / MEI</SelectItem>
                  <SelectItem value="Assinaturas">💳 Assinaturas / Softwares</SelectItem>
                  <SelectItem value="Outros">📦 Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t mt-4">
              <div className="flex-1">
                <Label className="text-xs font-bold">Ativo para lançamento?</Label>
                <p className="text-[10px] text-muted-foreground">Se desativado, não será listado no lançamento mensal.</p>
              </div>
              <Switch checked={fixedForm.active} onCheckedChange={v => setFixedForm({ ...fixedForm, active: v })} />
            </div>

            <Button type="submit" className="w-full h-11 font-bold shadow-lg" disabled={loading}>
              {loading ? "Processando..." : editingFixedId ? "Salvar Alterações" : "Cadastrar Gasto Fixo"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Lojas;
