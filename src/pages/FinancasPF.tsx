import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import {
  Wallet, TrendingDown, TrendingUp, ArrowDownRight, Briefcase,
  Plus, Trash2, Edit2, Tag, Scale, CalendarDays, Filter,
  Camera, Upload, Receipt, CheckCircle, RefreshCw, AlertCircle
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line,
} from "recharts";
import type { Tables } from "@/integrations/supabase/types";

const COLORS = [
  "hsl(0, 72%, 55%)", "hsl(25, 95%, 53%)", "hsl(45, 93%, 47%)",
  "hsl(142, 71%, 45%)", "hsl(199, 89%, 48%)", "hsl(262, 83%, 58%)",
  "hsl(330, 81%, 60%)", "hsl(190, 75%, 42%)", "hsl(350, 65%, 45%)",
];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const PF_CATEGORIES = [
  "Alimentação", "Moradia (Aluguel/Luz)", "Transporte/Combustível", "Lazer/Viagens",
  "Saúde", "Educação", "Vestuário", "Investimentos", "Assinaturas/Streaming",
  "Pets", "Presentes", "Outros",
];

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const FinancasPF = () => {
  const { user, userRole, activeStoreId } = useAuth();
  const [transactions, setTransactions] = useState<Tables<"transactions">[]>([]);
  const [fixedExpenses, setFixedExpenses] = useState<Tables<"fixed_expenses">[]>([]);
  const [accounts, setAccounts] = useState<Tables<"store_bank_accounts">[]>([]);
  const [activeTab, setActiveTab] = useState("ledger");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [fixedDialogOpen, setFixedDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [reconcileDialogOpen, setReconcileDialogOpen] = useState(false);
  const [reconcilingTx, setReconcilingTx] = useState<Tables<"transactions"> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null);

  // Filtros
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth());
  const [filterYear, setFilterYear] = useState<number>(now.getFullYear());

  const [form, setForm] = useState({
    type: "expense_pf" as string,
    amount: "",
    description: "",
    category: "",
    source_account_id: "",
  });

  const [fixedForm, setFixedForm] = useState({
    description: "",
    amount: "",
    category: "",
    due_day: "1",
    active: true,
  });

  /* ─── Fetch ─── */
  const fetchData = async () => {
    if (!activeStoreId) {
      setTransactions([]);
      setAccounts([]);
      setFixedExpenses([]);
      return;
    }
    const [txRes, accRes, fixedRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .in("type", ["expense_pf", "pro_labore"])
        .or(`store_id.eq.${activeStoreId},store_id.is.null`)
        .order("created_at", { ascending: false }),
      supabase
        .from("store_bank_accounts")
        .select("*")
        .or(`store_id.eq.${activeStoreId},owner_type.eq.PF`),
      supabase
        .from("fixed_expenses")
        .select("*")
        .eq("is_pf", true)
        .or(`store_id.eq.${activeStoreId},store_id.is.null`)
        .order("due_day"),
    ]);
    setTransactions(txRes.data ?? []);
    setAccounts(accRes.data ?? []);
    setFixedExpenses(fixedRes.data ?? []);
  };

  const uploadReceipt = async (file: File): Promise<string | null> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const fileName = `${user?.id}-${Date.now()}-${safeName}`;
    const { data, error } = await supabase.storage.from("comprovantes").upload(`pf/${fileName}`, file, { upsert: true });
    if (error) { toast.error("Erro no upload: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("comprovantes").getPublicUrl(data.path);
    return urlData.publicUrl;
  };

  useEffect(() => { fetchData(); }, [activeStoreId]);

  /* ─── Filtered by month/year ─── */
  const filtered = transactions.filter((tx) => {
    const d = new Date(tx.created_at);
    return d.getMonth() === filterMonth && d.getFullYear() === filterYear;
  });

  /* ─── KPIs ─── */
  const totalProLabore = filtered
    .filter((t) => t.type === "pro_labore")
    .reduce((s, t) => s + Number(t.amount), 0);

  const totalGastosPF = filtered
    .filter((t) => t.type === "expense_pf")
    .reduce((s, t) => s + Number(t.amount), 0);

  const saldo = totalProLabore - totalGastosPF;

  /* ─── Chart: gastos por categoria ─── */
  const catMap: Record<string, number> = {};
  filtered
    .filter((t) => t.type === "expense_pf")
    .forEach((t) => {
      const cat = t.category || "Sem categoria";
      catMap[cat] = (catMap[cat] || 0) + Number(t.amount);
    });
  const categoryData = Object.entries(catMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  /* ─── Chart: evolução mensal (últimos 6 meses) ─── */
  const monthlyData: { month: string; gastos: number; prolabore: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(filterYear, filterMonth - i, 1);
    const m = d.getMonth();
    const y = d.getFullYear();
    const label = `${MONTHS[m].substring(0, 3)}/${String(y).slice(2)}`;
    const gastos = transactions
      .filter((t) => t.type === "expense_pf" && new Date(t.created_at).getMonth() === m && new Date(t.created_at).getFullYear() === y)
      .reduce((s, t) => s + Number(t.amount), 0);
    const prolabore = transactions
      .filter((t) => t.type === "pro_labore" && new Date(t.created_at).getMonth() === m && new Date(t.created_at).getFullYear() === y)
      .reduce((s, t) => s + Number(t.amount), 0);
    monthlyData.push({ month: label, gastos, prolabore });
  }

  /* ─── CRUD ─── */
  const resetForm = () => {
    setDialogOpen(false);
    setEditingId(null);
    setReceiptFile(null);
    setExistingReceiptUrl(null);
    setForm({ type: "expense_pf", amount: "", description: "", category: "", source_account_id: "" });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const payload = {
      type: form.type,
      amount: parseFloat(form.amount) || 0,
      description: form.description || null,
      category: form.category || null,
      source_account_id: form.source_account_id || null,
      destination_account_id: null,
      store_id: activeStoreId,
      net_amount: parseFloat(form.amount) || 0,
      receipt_url: existingReceiptUrl
    };

    if (receiptFile) {
      const url = await uploadReceipt(receiptFile);
      if (url) payload.receipt_url = url;
    }

    if (editingId) {
      const { error } = await supabase.from("transactions").update(payload).eq("id", editingId);
      if (error) toast.error(error.message);
      else {
        toast.success("Lançamento atualizado!");
        resetForm();
        fetchData();
      }
    } else {
      const { error } = await supabase.from("transactions").insert({
        ...payload,
        created_by: user.id,
        expected_settlement_date: new Date().toISOString(),
        reconciled: false,
      } as any);
      if (error) toast.error(error.message);
      else {
        toast.success("Lançamento registrado!");
        resetForm();
        fetchData();
      }
    }
    setLoading(false);
  };

  const handleEdit = (tx: Tables<"transactions">) => {
    setEditingId(tx.id);
    setForm({
      type: tx.type,
      amount: tx.amount.toString(),
      description: tx.description || "",
      category: tx.category || "",
      source_account_id: tx.source_account_id || "",
    });
    setExistingReceiptUrl(tx.receipt_url || null);
    setReceiptFile(null);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setLoading(true);
    const { error } = await supabase.from("transactions").delete().eq("id", deleteId);
    if (error) toast.error(error.message);
    else { toast.success("Lançamento excluído!"); setDeleteId(null); fetchData(); }
    setLoading(false);
  };

  const handleReconcile = async (tx: Tables<"transactions">) => {
    if (tx.reconciled) {
      const { error } = await supabase.from("transactions").update({ reconciled: false }).eq("id", tx.id);
      if (error) toast.error("Erro ao remover conciliação");
      else { 
        toast.success("Conciliação removida"); 
        setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, reconciled: false } : t));
        fetchData(); 
      }
      return;
    }
    setReconcilingTx(tx);
    setReceiptFile(null);
    setExistingReceiptUrl(tx.receipt_url || null);
    setReconcileDialogOpen(true);
  };

  const handleConfirmReconcile = async () => {
    if (!reconcilingTx) return;
    setLoading(true);
    
    try {
      let finalUrL = existingReceiptUrl;
      if (receiptFile) {
        const url = await uploadReceipt(receiptFile);
        if (url) finalUrL = url;
      }
      
      const { error } = await supabase.from("transactions").update({ reconciled: true, receipt_url: finalUrL } as any).eq("id", reconcilingTx.id);
      
      if (error) {
        toast.error(error.message);
      } else {
        toast.success("Transação conciliada!");
        setTransactions(prev => prev.map(t => t.id === reconcilingTx.id ? { ...t, reconciled: true, receipt_url: finalUrL } : t));
        setReconcileDialogOpen(false);
        setReconcilingTx(null);
        setReceiptFile(null);
        fetchData();
      }
    } catch (err: any) {
      toast.error("Erro ao conciliar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ─── Fixed Expenses CRUD ─── */
  const handleSaveFixedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);

    const payload = {
      description: fixedForm.description,
      amount: parseFloat(fixedForm.amount) || 0,
      category: fixedForm.category || null,
      due_day: parseInt(fixedForm.due_day) || 1,
      is_pf: true,
      store_id: activeStoreId,
      active: fixedForm.active,
      created_by: user.id,
    };

    if (editingId) {
      const { error } = await supabase.from("fixed_expenses").update(payload).eq("id", editingId);
      if (error) toast.error(error.message);
      else {
        toast.success("Gasto fixo atualizado!");
        setFixedDialogOpen(false);
        setEditingId(null);
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

  const handleDeleteFixedExpense = async (id: string) => {
    const { error } = await supabase.from("fixed_expenses").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Removido!"); fetchData(); }
  };

  const handleLaunchFixedExpenses = async () => {
    if (!user || fixedExpenses.length === 0) return;
    
    const confirm = window.confirm(`Deseja lançar os ${fixedExpenses.filter(e => e.active).length} gastos fixos ativos como transações para este mês (${MONTHS[filterMonth]})?`);
    if (!confirm) return;

    setLoading(true);
    const nowLaunch = new Date();
    // Define a data como o dia do vencimento no mês/ano atual do filtro
    
    const transactionsToInsert = fixedExpenses
      .filter(e => e.active)
      .map(e => ({
        type: "expense_pf",
        amount: e.amount,
        description: `[Fixo] ${e.description}`,
        category: e.category,
        created_by: user.id,
        created_at: new Date(filterYear, filterMonth, Math.min(e.due_day || 1, 28)).toISOString(),
        expected_settlement_date: new Date(filterYear, filterMonth, Math.min(e.due_day || 1, 28)).toISOString(),
        reconciled: false,
        store_id: activeStoreId,
        net_amount: e.amount
      }));

    const { error } = await supabase.from("transactions").insert(transactionsToInsert as any);

    if (error) toast.error("Erro ao lançar: " + error.message);
    else {
      toast.success("Gastos fixos lançados com sucesso!");
      fetchData();
      setActiveTab("ledger");
    }
    setLoading(false);
  };

  const accountMap = new Map((accounts || []).map((a) => [a.id, a.bank_name]));

  /* ─── Year options ─── */
  const years = Array.from(new Set(transactions.map((t) => new Date(t.created_at).getFullYear())));
  if (!years.includes(now.getFullYear())) years.push(now.getFullYear());
  years.sort((a, b) => b - a);

  return (
    <div className="space-y-5">
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={e => { if (e.target.files?.[0]) setReceiptFile(e.target.files[0]); e.target.value = ""; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { if (e.target.files?.[0]) setReceiptFile(e.target.files[0]); e.target.value = ""; }} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Wallet className="h-7 w-7 text-primary" />
            Minhas Finanças Pessoais
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Controle completo dos seus gastos e recebimentos como Pessoa Física
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 h-10 border-primary/20 text-primary hover:bg-primary/5" 
            onClick={() => { setEditingId(null); setFixedForm({ description: "", amount: "", category: "", due_day: "1", active: true }); setFixedDialogOpen(true); }}>
            <RefreshCw className="h-4 w-4" /> Configurar Fixos
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); else setDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 h-10 shadow-lg">
                <Plus className="h-4 w-4" /> Novo Lançamento PF
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">
                  {editingId ? "Editar Lançamento PF" : "Novo Lançamento PF"}
                </DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tipo</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="expense_pf">🧑 Gasto Pessoal (PF)</SelectItem>
                      <SelectItem value="pro_labore">💼 Retirada Pró-labore</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Valor (R$)</Label>
                  <Input
                    type="number" step="0.01" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    placeholder="0.00" required className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Categoria
                  </Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {(form.type === "pro_labore" ? ["Pro-labore"] : PF_CATEGORIES).map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Descrição</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Para que foi esse gasto?" className="min-h-[70px]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Conta Bancária</Label>
                  <Select value={form.source_account_id} onValueChange={(v) => setForm({ ...form, source_account_id: v })}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Opcional" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.bank_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-semibold flex items-center gap-1">
                    <Receipt className="h-3 w-3" /> Comprovante (Opcional)
                  </Label>
                  {receiptFile ? (
                    <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
                      <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                      <p className="text-xs text-primary truncate flex-1">{receiptFile.name}</p>
                      <Button type="button" variant="ghost" className="h-6 text-[10px] hover:bg-muted px-2" onClick={() => setReceiptFile(null)}>Remover</Button>
                    </div>
                  ) : existingReceiptUrl ? (
                    <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/5 p-2.5">
                      <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                      <p className="text-xs text-green-500 truncate flex-1">Comprovante já enviado</p>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" className="h-6 text-[10px] hover:bg-muted px-2" onClick={() => window.open(existingReceiptUrl, "_blank")}>Ver</Button>
                        <Button type="button" variant="ghost" className="h-6 text-[10px] text-destructive hover:bg-destructive/10 px-2" onClick={() => setExistingReceiptUrl(null)}>Trocar</Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" className="h-10 gap-2 text-xs bg-transparent border border-border text-foreground hover:bg-muted"
                        onClick={() => cameraInputRef.current?.click()}>
                        <Camera className="h-4 w-4" /> Tirar Foto
                      </Button>
                      <Button type="button" className="h-10 gap-2 text-xs bg-transparent border border-border text-foreground hover:bg-muted"
                        onClick={() => fileInputRef.current?.click()}>
                        <Upload className="h-4 w-4" /> Galeria
                      </Button>
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full h-11 font-bold shadow-lg" disabled={loading}>
                  {loading ? "Processando..." : editingId ? "Salvar Alterações" : "Registrar Lançamento"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filtro Mês / Ano */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Período:</span>
        </div>
        <Select value={String(filterMonth)} onValueChange={(v) => setFilterMonth(Number(v))}>
          <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
          <SelectTrigger className="h-9 w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-border/50 shadow-lg shadow-black/10 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Pró-labore Recebido</p>
              <Briefcase className="h-4 w-4 text-violet-500" />
            </div>
            <p className="font-display text-xl font-bold text-violet-500">{formatCurrency(totalProLabore)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">no mês selecionado</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-lg shadow-black/10 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-red-500 to-rose-600" />
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Gastos Pessoais</p>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
            <p className="font-display text-xl font-bold text-destructive">{formatCurrency(totalGastosPF)}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{filtered.filter(t => t.type === "expense_pf").length} lançamentos</p>
          </CardContent>
        </Card>

        <Card className={`border-border/50 shadow-lg shadow-black/10 overflow-hidden`}>
          <div className={`h-1 ${saldo >= 0 ? "bg-gradient-to-r from-emerald-500 to-green-600" : "bg-gradient-to-r from-red-600 to-red-700"}`} />
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Saldo do Mês</p>
              <Scale className="h-4 w-4" />
            </div>
            <p className={`font-display text-xl font-bold ${saldo >= 0 ? "text-emerald-500" : "text-destructive"}`}>
              {formatCurrency(saldo)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {saldo >= 0 ? "Sobra do pró-labore" : "Gastou mais do que recebeu"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gastos por Categoria */}
        <Card className="border-border/50 shadow-lg shadow-black/10">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm">Gastos por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={200}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} dataKey="value" paddingAngle={2}>
                      {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1 min-w-0">
                  {categoryData.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{formatCurrency(c.value)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-muted-foreground text-xs">
                Nenhum gasto pessoal neste mês
              </div>
            )}
          </CardContent>
        </Card>

        {/* Evolução Mensal */}
        <Card className="border-border/50 shadow-lg shadow-black/10">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm">Evolução Mensal (últimos 6 meses)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="prolabore" fill="hsl(262, 83%, 58%)" radius={[4, 4, 0, 0]} name="Pró-labore" />
                <Bar dataKey="gastos" fill="hsl(0, 72%, 55%)" radius={[4, 4, 0, 0]} name="Gastos PF" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="ledger" className="gap-2"><ArrowDownRight className="h-3.5 w-3.5" /> Lançamentos</TabsTrigger>
          <TabsTrigger value="fixed" className="gap-2"><RefreshCw className="h-3.5 w-3.5" /> Gastos Fixos</TabsTrigger>
        </TabsList>

        <TabsContent value="ledger" className="space-y-4">
          {/* Lista de Lançamentos */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display text-sm font-bold">
                Lançamentos — {MONTHS[filterMonth]} {filterYear}
              </h2>
              <Badge variant="outline" className="text-[10px] h-5">{filtered.length} itens</Badge>
            </div>

            {filtered.length === 0 ? (
              <Card className="border-border/50">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                  <Wallet className="h-10 w-10 text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum lançamento neste período</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Clique em "Novo Lançamento PF" para registrar</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-2">
                {filtered.map((tx) => (
                  <Card key={tx.id} className="border-border/50 shadow-sm overflow-hidden group hover:border-primary/30 transition-colors">
                    <CardContent className="p-3.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`rounded-lg p-2.5 shrink-0 shadow-inner ${
                          tx.type === "pro_labore"
                            ? "bg-violet-500/10 text-violet-500"
                            : "bg-destructive/10 text-destructive"
                        }`}>
                          {tx.type === "pro_labore"
                            ? <Briefcase className="h-4 w-4" />
                            : <ArrowDownRight className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm truncate">
                              {tx.description || tx.category || (tx.type === "pro_labore" ? "Pró-labore" : "Gasto Pessoal")}
                            </p>
                            {tx.category && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-normal text-muted-foreground">
                                {tx.category}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            <Badge className={`text-[10px] px-1.5 py-0 h-4 font-medium rounded-sm border-0 ${
                              tx.type === "pro_labore"
                                ? "bg-violet-500/15 text-violet-500"
                                : "bg-destructive/15 text-destructive"
                            }`}>
                              {tx.type === "pro_labore" ? "Pró-labore" : "Gasto PF"}
                            </Badge>
                            {tx.source_account_id && (
                              <span className="text-[10px] text-muted-foreground bg-muted/50 px-1 rounded">
                                {accountMap.get(tx.source_account_id)}
                              </span>
                            )}
                            {tx.receipt_url && (
                              <a href={tx.receipt_url} target="_blank" rel="noreferrer"
                                 className="text-[10px] text-primary underline flex items-center gap-0.5"
                                 onClick={e => e.stopPropagation()}>
                                <Receipt className="h-2.5 w-2.5" /> Comprovante
                              </a>
                            )}
                            <span className="text-[10px] text-muted-foreground ml-auto">
                              {new Date(tx.created_at).toLocaleDateString("pt-BR")}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="text-right">
                          <p className={`font-display font-bold text-sm ${
                            tx.type === "pro_labore" ? "text-violet-500" : "text-destructive"
                          }`}>
                            {tx.type === "pro_labore" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                          </p>
                          <button 
                            onClick={() => handleReconcile(tx)}
                            className={`mt-1 h-5 px-1.5 rounded text-[9px] font-bold border transition-all ${
                              tx.reconciled 
                                ? "bg-green-500/10 text-green-600 border-green-500/20" 
                                : "bg-transparent text-muted-foreground border-border hover:border-primary hover:text-primary"
                            }`}
                          >
                            {tx.reconciled ? "CONCILIADO" : "PENDENTE"}
                          </button>
                        </div>
                        {userRole === "admin" && (
                          <div className="flex flex-col gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => handleEdit(tx)}>
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteId(tx.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="fixed" className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" />
              <h2 className="font-display text-sm font-bold">Modelos de Gastos Fixos</h2>
            </div>
            <Button variant="default" size="sm" className="h-8 gap-1.5 bg-emerald-600 hover:bg-emerald-700" onClick={handleLaunchFixedExpenses} disabled={loading || fixedExpenses.length === 0}>
              <ArrowDownRight className="h-3.5 w-3.5" /> Lançar este Mês ({MONTHS[filterMonth]})
            </Button>
          </div>

          <Card className="border-border/50 bg-primary/5 border-primary/20">
            <CardContent className="p-3 text-xs flex items-start gap-2 text-primary">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Como funciona?</p>
                <p>Cadastre aqui os gastos que você tem todo mês (Aluguel, Internet, Netflix). Depois, basta clicar em <b>"Lançar este Mês"</b> para que eles virem lançamentos reais no seu extrato automaticamente.</p>
              </div>
            </CardContent>
          </Card>

          {fixedExpenses.length === 0 ? (
            <Card className="border-border/50 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <RefreshCw className="h-8 w-8 text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">Você ainda não configurou gastos fixos.</p>
                <Button variant="link" className="text-xs h-auto p-0" 
                  onClick={() => { setEditingId(null); setFixedForm({ description: "", amount: "", category: "", due_day: "1", active: true }); setFixedDialogOpen(true); }}>
                  Cadastrar agora
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {fixedExpenses.map((exp) => (
                <Card key={exp.id} className={`border-border/50 shadow-sm ${!exp.active ? "opacity-50" : ""}`}>
                  <CardContent className="p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-sm truncate">{exp.description}</p>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 font-normal">{exp.category}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">Vencimento: Dia {exp.due_day}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-sm text-destructive">{formatCurrency(Number(exp.amount))}</p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditingId(exp.id); setFixedForm({ description: exp.description, amount: exp.amount.toString(), category: exp.category || "", due_day: (exp.due_day || 1).toString(), active: exp.active || false }); setFixedDialogOpen(true); }}>
                          <Edit2 className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteFixedExpense(exp.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lançamento</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lançamento pessoal? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={handleDelete} disabled={loading}>
              {loading ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Fixed Expense Dialog */}
      <Dialog open={fixedDialogOpen} onOpenChange={setFixedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">{editingId ? "Editar Gasto Fixo" : "Novo Gasto Fixo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveFixedExpense} className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Input value={fixedForm.description} onChange={e => setFixedForm({ ...fixedForm, description: e.target.value })} placeholder="Ex: Aluguel, Netflix..." required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor (R$)</Label>
                <Input type="number" step="0.01" value={fixedForm.amount} onChange={e => setFixedForm({ ...fixedForm, amount: e.target.value })} placeholder="0.00" required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Dia do Vencimento</Label>
                <Input type="number" min="1" max="31" value={fixedForm.due_day} onChange={e => setFixedForm({ ...fixedForm, due_day: e.target.value })} required />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria</Label>
              <Select value={fixedForm.category} onValueChange={v => setFixedForm({ ...fixedForm, category: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {PF_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-2 border-t mt-4">
              <div className="flex-1">
                <Label className="text-xs font-bold">Ativo para lançamento?</Label>
                <p className="text-[10px] text-muted-foreground">Se desativado, não será incluído no lançamento mensal.</p>
              </div>
              <Switch checked={fixedForm.active} onCheckedChange={v => setFixedForm({ ...fixedForm, active: v })} />
            </div>
            <Button type="submit" className="w-full h-11 font-bold shadow-lg" disabled={loading}>
              {loading ? "Salvando..." : editingId ? "Salvar Alterações" : "Salvar Configuração"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog with Receipt (Restored) */}
      <Dialog open={reconcileDialogOpen} onOpenChange={setReconcileDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display flex items-center gap-2">Confirmar Transação</DialogTitle></DialogHeader>
          <div className="space-y-4">
            {reconcilingTx && (
              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Descrição</span><span className="font-medium text-right max-w-[60%]">{reconcilingTx.description || reconcilingTx.category || "-"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><span className="font-bold">{formatCurrency(Number(reconcilingTx.amount))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span>{new Date(reconcilingTx.created_at).toLocaleDateString("pt-BR")}</span></div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold flex items-center gap-1">
                <Receipt className="h-3 w-3" /> Anexar Comprovante
              </Label>
              {receiptFile ? (
                <div className="flex items-center gap-2 rounded bg-primary/10 p-2 text-[10px] text-primary border border-primary/20 font-medium font-display">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate flex-1">{receiptFile.name}</span>
                  <button onClick={() => setReceiptFile(null)} className="hover:underline">Remover</button>
                </div>
              ) : existingReceiptUrl ? (
                <div className="flex items-center gap-2 rounded bg-green-500/10 p-2 text-[10px] text-green-600 border border-green-500/20 font-medium font-display">
                  <CheckCircle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate flex-1">Comprovante já enviado</span>
                  <button onClick={() => setExistingReceiptUrl(null)} className="text-destructive hover:underline">Trocar</button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-10 text-xs gap-1.5" onClick={() => cameraInputRef.current?.click()}>
                    <Camera className="h-4 w-4" /> Tirar Foto
                  </Button>
                  <Button type="button" variant="outline" className="h-10 text-xs gap-1.5" onClick={() => fileInputRef.current?.click()}>
                    <Upload className="h-4 w-4" /> Galeria
                  </Button>
                </div>
              )}
            </div>

            <Button className="w-full h-11 font-bold shadow-lg" onClick={handleConfirmReconcile} disabled={loading}>
              {loading ? "Processando..." : "Confirmar e Conciliar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FinancasPF;
