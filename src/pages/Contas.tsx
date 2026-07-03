import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Landmark, Clock, Building, User, Briefcase, ArrowUpRight, TrendingUp, PieChart, History, Plus, PlusCircle, CreditCard, PiggyBank, PlusCircle as PlusIcon, Banknote, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
type AccountBalance = {
  account_id: string;
  store_id: string;
  bank_name: string;
  account_type: string;
  holder_name: string | null;
  owner_type: string | null;
  overall_balance: number;
  available_balance: number;
  future_balance: number;
  is_cashbox: boolean;
};
export default function Contas() {
  const { user, activeStoreId, userRole } = useAuth();
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [stores, setStores] = useState<Map<string, string>>(new Map());
  const [rawStores, setRawStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("pj");
  const [periodFilter, setPeriodFilter] = useState<"day" | "week" | "month" | "year" | "all">("all");
  const [bankDialogOpen, setBankDialogOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    bank_name: "",
    account_type: "corrente",
    agency: "",
    account_number: "",
    pix_key: "",
    holder_name: "",
    holder_cpf_cnpj: "",
    owner_type: "PJ",
    store_id: "",
    credit_fee_percent: "0",
    credit_settlement_days: "30",
    debit_fee_percent: "0",
    debit_settlement_days: "1",
    pix_fee_percent: "0",
    pix_settlement_days: "0"
  });

  const fetchData = async () => {
    setLoading(true);
    if (!activeStoreId) {
      setLoading(false);
      return;
    }
    const [accountsRes, storesRes, transactionsRes] = await Promise.all([
      supabase.from("store_bank_accounts").select("*"),
      supabase.from("stores").select("id, name"),
      supabase.from("transactions").select("*").order("created_at", { ascending: false }),
    ]);

    const allAccounts = accountsRes.data || [];
    const allTxs = transactionsRes.data || [];
    const storesData = storesRes.data || [];

    // Filter accounts:
    // PJ accounts: loaded if they are linked to the active store OR if they are global (store_id is null)
    // PF accounts: loaded globally (all PF accounts)
    const pjAccounts = allAccounts.filter((a: any) => a.owner_type !== "PF" && (!a.store_id || a.store_id === activeStoreId));
    
    // Deduplicate PF accounts by bank_name (PF accounts are global/personal, only 1 per bank)
    const seenPfNames = new Set<string>();
    const pfAccounts = userRole === "admin"
      ? allAccounts.filter((a: any) => a.owner_type === "PF").filter((a: any) => {
          const key = (a.bank_name || "").toLowerCase().trim();
          if (seenPfNames.has(key)) return false;
          seenPfNames.add(key);
          return true;
        })
      : [];

    const accounts = [...pjAccounts, ...pfAccounts];

    setRawStores(storesData);
    setTransactions(allTxs);
    setStores(new Map<string, string>(storesData.map((s) => [s.id, s.name])));

    const now = new Date();
    let filterStart: Date | null = null;
    if (periodFilter === "day") { filterStart = new Date(); filterStart.setHours(0,0,0,0); }
    else if (periodFilter === "week") { filterStart = new Date(); filterStart.setDate(now.getDate() - now.getDay()); filterStart.setHours(0,0,0,0); }
    else if (periodFilter === "month") { filterStart = new Date(now.getFullYear(), now.getMonth(), 1); }
    else if (periodFilter === "year") { filterStart = new Date(now.getFullYear(), 0, 1); }

    const filteredTxs = filterStart ? allTxs.filter(tx => new Date(tx.created_at) >= filterStart!) : allTxs;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const computed: AccountBalance[] = accounts.map((acc) => {
      let overall = 0, available = 0, future = 0;
      filteredTxs.forEach((tx) => {
        const isDest = tx.destination_account_id === acc.id;
        const isSrc  = tx.source_account_id === acc.id;
        if (!isDest && !isSrc) return;
        const value = Number(tx.net_amount ?? tx.amount);
        const effect = isDest ? value : -value;
        overall += effect;
        const settled = tx.expected_settlement_date ? new Date(tx.expected_settlement_date) : new Date(0);
        if (settled <= today) available += effect;
        else future += effect;
      });
      return {
        account_id: acc.id,
        store_id: acc.store_id,
        bank_name: acc.bank_name,
        account_type: acc.account_type,
        holder_name: acc.holder_name,
        owner_type: acc.owner_type ?? "PJ",
        overall_balance: overall,
        available_balance: available,
        future_balance: future,
        is_cashbox: acc.is_cashbox || false
      };
    });
    setBalances(computed);
    setLoading(false);
  };

  const handleBankSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (bankForm.owner_type === "PJ" && !bankForm.store_id) {
      toast.error("Para contas empresariais, selecione uma loja.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("store_bank_accounts").insert({
      // PF accounts are global (no store link); PJ accounts need a store
      store_id: bankForm.owner_type === "PF" ? null : (activeStoreId || bankForm.store_id),
      bank_name: bankForm.bank_name,
      account_type: bankForm.account_type,
      agency: bankForm.agency || null,
      account_number: bankForm.account_number || null,
      pix_key: bankForm.pix_key || null,
      holder_name: bankForm.holder_name || null,
      holder_cpf_cnpj: bankForm.holder_cpf_cnpj || null,
      owner_type: bankForm.owner_type,
      credit_fee_percent: parseFloat(bankForm.credit_fee_percent) || 0,
      credit_settlement_days: parseInt(bankForm.credit_settlement_days) || 30,
      debit_fee_percent: parseFloat(bankForm.debit_fee_percent) || 0,
      debit_settlement_days: parseInt(bankForm.debit_settlement_days) || 1,
      pix_fee_percent: parseFloat(bankForm.pix_fee_percent) || 0,
      pix_settlement_days: parseInt(bankForm.pix_settlement_days) || 0,
    } as any);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Conta cadastrada com sucesso!");
      setBankDialogOpen(false);
      setBankForm({
        bank_name: "", account_type: "corrente", agency: "", account_number: "", pix_key: "",
        holder_name: "", holder_cpf_cnpj: "", owner_type: "PJ", store_id: "",
        credit_fee_percent: "0", credit_settlement_days: "30", debit_fee_percent: "0",
        debit_settlement_days: "1", pix_fee_percent: "0", pix_settlement_days: "0"
      });
      fetchData();
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [activeStoreId, periodFilter]);
  const pj = balances.filter((a) => !a.owner_type || a.owner_type === "PJ");
  const pf = balances.filter((a) => a.owner_type === "PF");

  // Saldo em Espécie na Loja (Caixas Locais / is_cashbox)
  const cashboxAccounts = pj.filter(a => a.is_cashbox === true);
  const totalPhysicalCash = cashboxAccounts.reduce((sum, a) => sum + a.available_balance, 0);

  // Valores a entrar no próximo dia útil (Settlement de PIX/Cartão com expected_settlement_date futura)
  const totalFutureSettlements = pj.filter(a => !a.is_cashbox).reduce((sum, a) => sum + a.future_balance, 0);

  // Estatísticas PF do Mês Atual
  const now = new Date();
  const pfTransactions = transactions.filter(t => 
    (pf.some(a => a.account_id === t.source_account_id) || pf.some(a => a.account_id === t.destination_account_id)) &&
    new Date(t.created_at).getMonth() === now.getMonth() &&
    new Date(t.created_at).getFullYear() === now.getFullYear()
  );
  const pfIncome = pfTransactions.reduce((acc, t) => {
    const isDest = pf.some(a => a.account_id === t.destination_account_id);
    return isDest ? acc + Number(t.amount) : acc;
  }, 0);
  const pfExpense = pfTransactions.reduce((acc, t) => {
    const isSrc = pf.some(a => a.account_id === t.source_account_id);
    return isSrc ? acc + Number(t.amount) : acc;
  }, 0);
  // Agrupamento por Categoria para PF
  const pfCategories = pfTransactions
    .filter(t => pf.some(a => a.account_id === t.source_account_id)) // Apenas saídas
    .reduce((acc: any, t) => {
      const cat = t.category || "Outros";
      acc[cat] = (acc[cat] || 0) + Number(t.amount);
      return acc;
    }, {});
  const sortedPfCategories = Object.entries(pfCategories)
    .sort(([, a]: any, [, b]: any) => b - a)
    .slice(0, 5);
  const AccountCard = ({ acc }: { acc: AccountBalance }) => (
    <Card className="border-primary/10 bg-card overflow-hidden shadow-sm hover:border-primary transition-all">
      <div className={`h-1.5 w-full bg-gradient-to-r ${acc.owner_type === "PF" ? "from-violet-600 to-fuchsia-500" : (acc.is_cashbox ? "from-amber-500 to-yellow-400" : "from-emerald-500 to-primary")}`} />
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-lg flex items-center gap-2 font-bold tracking-tight">
              {acc.is_cashbox ? (
                <Banknote className="h-4 w-4 text-amber-500" />
              ) : (
                <Landmark className={`h-4 w-4 ${acc.owner_type === "PF" ? "text-violet-500" : "text-emerald-500"}`} />
              )}
              {acc.bank_name}
            </CardTitle>
            <CardDescription className="text-xs mt-1 flex items-center gap-1 font-medium italic">
              {acc.owner_type === "PF" ? (
                <><User className="h-3 w-3" /> Pessoal</>
              ) : acc.is_cashbox ? (
                <><Wallet className="h-3 w-3 text-amber-500" /> Caixa Local (Espécie) - {stores.get(acc.store_id) || "Empresa"}</>
              ) : (
                <><Building className="h-3 w-3" /> {stores.get(acc.store_id) || "Empresa"}</>
              )}
            </CardDescription>
          </div>
          <Badge className="text-[10px] capitalize bg-muted/50 border-border shrink-0">
            {acc.is_cashbox ? "Caixa Físico" : acc.account_type}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`rounded-xl p-4 border border-border/50 ${acc.owner_type === "PF" ? "bg-violet-500/5" : (acc.is_cashbox ? "bg-amber-500/5" : "bg-emerald-500/5")}`}>
          <p className="text-[10px] font-bold text-muted-foreground uppercase mb-1">Saldo Disponível</p>
          <p className={`text-3xl font-black font-display tracking-tight ${acc.available_balance >= 0 ? (acc.owner_type === "PF" ? "text-violet-600" : (acc.is_cashbox ? "text-amber-600" : "text-emerald-600")) : "text-destructive"}`}>
            {fmt(acc.available_balance)}
          </p>
        </div>
        {!acc.is_cashbox && (
          <div className="grid grid-cols-2 gap-3">
            <div className="p-2 border rounded-lg bg-muted/20">
              <p className="text-[9px] text-muted-foreground font-bold uppercase">A Receber</p>
              <p className="text-sm font-bold">{fmt(acc.future_balance)}</p>
            </div>
            <div className="p-2 border rounded-lg bg-muted/20">
              <p className="text-[9px] text-muted-foreground font-bold uppercase">Total Geral</p>
              <p className="text-sm font-bold">{fmt(acc.overall_balance)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
  const MiniExtrato = ({ accountId }: { accountId: string }) => {
    const txs = transactions
      .filter(t => t.source_account_id === accountId || t.destination_account_id === accountId)
      .slice(0, 5);
    if (txs.length === 0) return null;
    return (
      <Card className="mt-4 border-dashed bg-muted/5">
        <CardHeader className="py-2 px-3 border-b border-dashed">
          <CardTitle className="text-[9px] font-bold text-muted-foreground flex items-center gap-2 uppercase tracking-widest">
            <History className="h-3 w-3" /> Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {txs.map(t => (
            <div key={t.id} className="flex justify-between items-center p-2.5 border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
              <div className="min-w-0">
                <p className="text-[10px] font-bold truncate">{t.description || t.category || "Transferência"}</p>
                <p className="text-[8px] text-muted-foreground">{new Date(t.created_at).toLocaleDateString('pt-BR')}</p>
              </div>
              <span className={`text-[11px] font-black ${t.destination_account_id === accountId ? "text-emerald-500" : "text-destructive"}`}>
                {t.destination_account_id === accountId ? "+" : "-"}{fmt(Number(t.amount))}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };
  const EmptyState = ({ isPF = false }) => (
    <Card className="border-dashed bg-transparent border-primary/20 py-12 w-full">
      <CardContent className="flex flex-col items-center justify-center text-center">
        <div className="bg-muted/30 p-4 rounded-full mb-4">
          {isPF ? <User className="h-10 w-10 text-violet-500/50" /> : <Briefcase className="h-10 w-10 text-emerald-500/50" />}
        </div>
        <h3 className="font-bold text-lg">{isPF ? "Nenhuma conta pessoal" : "Nenhuma conta empresarial"}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto mb-6">
          {isPF ? "Cadastre suas contas particulares para rastrear gastos pessoais e pro-labore." : "Cadastre as contas bancárias das suas lojas para controlar o fluxo de caixa."}
        </p>
        <Button 
          onClick={() => {
            setBankForm(prev => ({ ...prev, owner_type: isPF ? "PF" : "PJ" }));
            setBankDialogOpen(true);
          }}
          className={`gap-2 h-11 px-8 font-bold shadow-lg ${isPF ? "bg-violet-600 hover:bg-violet-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
        >
          <PlusCircle className="h-4 w-4" /> Cadastrar Agora
        </Button>
      </CardContent>
    </Card>
  );
  if (loading) return <div className="flex items-center justify-center p-24"><div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" /></div>;
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-4xl font-black text-foreground tracking-tight">Fluxo Bancário</h1>
          <p className="text-muted-foreground text-sm font-medium">Controle granular PJ & PF</p>
        </div>
        <Button 
          onClick={() => {
            setBankForm(prev => ({ ...prev, owner_type: activeTab.toUpperCase() }));
            setBankDialogOpen(true);
          }}
          className="gap-2 h-11 font-bold shadow-lg bg-primary hover:bg-primary/90"
        >
          <PlusIcon className="h-5 w-5" /> Nova Conta
        </Button>
      </div>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {(["day", "week", "month", "year", "all"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriodFilter(p)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                periodFilter === p
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {{ day: "Dia", week: "Semana", month: "Mês", year: "Ano", all: "Tudo" }[p]}
            </button>
          ))}
        </div>
      </div>
      <Tabs defaultValue="pj" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="bg-muted/50 p-1">
          <TabsTrigger value="pj" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">
            <Briefcase className="h-4 w-4 mr-2" /> Comercial (PJ)
          </TabsTrigger>
          {userRole === "admin" && (
            <TabsTrigger value="pf" className="data-[state=active]:bg-background data-[state=active]:shadow-sm px-6">
              <User className="h-4 w-4 mr-2" /> Pessoal (PF)
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="pj" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-amber-500/20 bg-amber-500/5 overflow-hidden shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-amber-600 uppercase flex items-center gap-2 font-display tracking-widest">
                  <Banknote className="h-4 w-4" /> Saldo em Espécie na Loja
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">Dinheiro físico em caixa (gaveta)</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black font-display text-amber-600 tracking-tight">
                  {fmt(totalPhysicalCash)}
                </p>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-primary/5 overflow-hidden shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold text-primary uppercase flex items-center gap-2 font-display tracking-widest">
                  <Clock className="h-4 w-4" /> A Receber (Próximo Dia Útil)
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">Vendas PIX/Cartão a serem compensadas nas contas PJ</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-black font-display text-primary tracking-tight">
                  {fmt(totalFutureSettlements)}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {pj.length === 0 ? <EmptyState isPF={false} /> : pj.map((acc) => (
              <div key={acc.account_id}>
                <AccountCard acc={acc} />
                <MiniExtrato accountId={acc.account_id} />
              </div>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="pf" className="mt-6 space-y-6">
          {pf.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* 1. Resumo Mensal PF */}
              <div className="md:col-span-4 space-y-4">
                <Card className="bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white border-0 shadow-lg">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase opacity-80 flex items-center gap-2 font-display">
                      <TrendingUp className="h-3 w-3" /> Resumo do Mês (PF)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <p className="text-sm font-medium opacity-90">Entradas</p>
                      <p className="text-2xl font-black">{fmt(pfIncome)}</p>
                    </div>
                    <div className="pt-2 border-t border-white/10">
                      <p className="text-sm font-medium opacity-90">Saídas</p>
                      <p className="text-2xl font-black">{fmt(pfExpense)}</p>
                    </div>
                    <div className={`pt-3 mt-2 rounded-lg bg-white/10 p-3 flex justify-between items-center`}>
                      <span className="text-xs font-bold font-display uppercase">Economia Real</span>
                      <span className="text-xl font-black">{fmt(pfIncome - pfExpense)}</span>
                    </div>
                  </CardContent>
                </Card>
                {/* 2. Breakdown de Categorias (Sempre seguro agora) */}
                <Card className="border-border/50">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2 font-display tracking-widest">
                      <PieChart className="h-3 w-3" /> Para onde foi o dinheiro?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {sortedPfCategories.length > 0 ? sortedPfCategories.map(([cat, val]: any) => {
                      const perc = (val / (pfExpense || 1)) * 100;
                      return (
                        <div key={cat} className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="uppercase">{cat}</span>
                            <span className="text-muted-foreground">{fmt(val)} ({perc.toFixed(0)}%)</span>
                          </div>
                          {/* Barra de Progresso Customizada (Sem erros de componente) */}
                          <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-violet-500 rounded-full transition-all duration-500" 
                              style={{ width: `${perc}%` }}
                            />
                          </div>
                        </div>
                      );
                    }) : <p className="text-[10px] text-muted-foreground text-center py-4">Nenhum gasto categorizado neste mês.</p>}
                  </CardContent>
                </Card>
              </div>
              {/* 3. Cards de Conta PF */}
              <div className="md:col-span-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {pf.map((acc) => (
                    <div key={acc.account_id}>
                      <AccountCard acc={acc} />
                      <MiniExtrato accountId={acc.account_id} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {pf.length === 0 && <EmptyState isPF={true} />}
        </TabsContent>
      </Tabs>

      {/* ── Dialog Cadastrar Conta Bancária ────────────────────────────────── */}
      <Dialog open={bankDialogOpen} onOpenChange={setBankDialogOpen}>
        <DialogContent className="max-w-xl max-h-[95dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-bold flex items-center gap-2">
              <PiggyBank className="h-5 w-5 text-primary" /> Cadastrar Conta Bancária
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBankSubmit} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Tipo de Dono</Label>
                <Select value={bankForm.owner_type} onValueChange={(v) => setBankForm({ ...bankForm, owner_type: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PJ">🏢 Empresarial (PJ)</SelectItem>
                    <SelectItem value="PF">👤 Pessoal (PF)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Loja / Vínculo</Label>
                <Select value={bankForm.store_id || activeStoreId || ""} onValueChange={(v) => setBankForm({ ...bankForm, store_id: v })} disabled={!!activeStoreId}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                  <SelectContent>
                    {rawStores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Nome do Banco</Label>
                <Input value={bankForm.bank_name} onChange={(e) => setBankForm({ ...bankForm, bank_name: e.target.value })} 
                  placeholder="Ex: Nubank, Itaú..." required className="h-11 font-medium" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Tipo de Conta</Label>
                <Select value={bankForm.account_type} onValueChange={(v) => setBankForm({ ...bankForm, account_type: v })}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="pagamento">Pagamento</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Agência</Label>
                <Input value={bankForm.agency} onChange={(e) => setBankForm({ ...bankForm, agency: e.target.value })} 
                  placeholder="0001" className="h-11 font-medium" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider">Número da Conta</Label>
                <Input value={bankForm.account_number} onChange={(e) => setBankForm({ ...bankForm, account_number: e.target.value })} 
                  placeholder="12345-6" className="h-11 font-medium" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase tracking-wider">Chave PIX (Opcional)</Label>
              <Input value={bankForm.pix_key} onChange={(e) => setBankForm({ ...bankForm, pix_key: e.target.value })} 
                placeholder="E-mail, CPF, Telefone ou Aleatória" className="h-11 font-medium" />
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-4 mt-2">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Crédito - Taxa (%)</Label>
                <Input type="number" step="0.01" value={bankForm.credit_fee_percent} 
                  onChange={(e) => setBankForm({ ...bankForm, credit_fee_percent: e.target.value })} className="h-10" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Débito - Taxa (%)</Label>
                <Input type="number" step="0.01" value={bankForm.debit_fee_percent} 
                  onChange={(e) => setBankForm({ ...bankForm, debit_fee_percent: e.target.value })} className="h-10" />
              </div>
            </div>

            <Button type="submit" className="w-full h-12 font-black text-lg shadow-xl mt-4" disabled={loading}>
              {loading ? "Processando..." : "Finalizar Cadastro"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
