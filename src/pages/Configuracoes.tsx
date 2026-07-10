import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Webhook, Trash2, Plus, Send, ExternalLink, Info, MessageSquare, ShieldCheck, Globe, Camera, Brain, Activity, AlertCircle, CheckCircle2, Clock } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { format } from "date-fns";

const eventLabels: Record<string, string> = {
  os_status_changed: "Mudança de Status na OS (WhatsApp / N8N)",
  sale_completed: "Nova Venda Finalizada",
};

export default function Configuracoes() {
  const { activeStoreId, userRole } = useAuth();
  
  // States for Integrations
  const [webhooks, setWebhooks] = useState<Tables<"webhooks">[]>([]);
  const [stores, setStores] = useState<Tables<"stores">[]>([]);
  const [whatsappConfig, setWhatsappConfig] = useState<Partial<Tables<"whatsapp_config">>>({
    api_url: "", api_key: "", instance_name: "", is_active: true
  });
  const [instagramConfig, setInstagramConfig] = useState<any>({
    page_id: "", instagram_business_account_id: "", page_access_token: "", is_active: true, ai_active: false
  });
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ store_id: "", event_type: "os_status_changed", url: "" });

  // States for System Health
  const [dbLatency, setDbLatency] = useState<number | null>(null);
  const [moduleStatus, setModuleStatus] = useState<any>({
    vendas: "loading", estoque: "loading", os: "loading", caixa: "loading"
  });
  const [errorLogs, setErrorLogs] = useState<any[]>([]);
  const [testingHealth, setTestingHealth] = useState(false);

  const fetchData = async () => {
    if (!activeStoreId) {
      setWebhooks([]);
      setStores([]);
      return;
    }
    const [wbRes, storesRes, waRes, igRes] = await Promise.all([
      supabase.from("webhooks").select("*").eq("store_id", activeStoreId).order("created_at", { ascending: false }),
      supabase.from("stores").select("*"),
      supabase.from("whatsapp_config").select("*").eq("store_id", activeStoreId).maybeSingle(),
      supabase.from("instagram_config").select("*").eq("store_id", activeStoreId).maybeSingle(),
    ]);
    setWebhooks(wbRes.data ?? []);
    setStores(storesRes.data ?? []);
    if (waRes.data) setWhatsappConfig(waRes.data);
    if (igRes.data) setInstagramConfig(igRes.data);

    if (storesRes.data && storesRes.data.length > 0 && !form.store_id) {
      setForm(f => ({ ...f, store_id: storesRes.data[0].id }));
    }

    fetchHealthData();
  };

  const fetchHealthData = async () => {
    if (!activeStoreId) return;
    setTestingHealth(true);
    try {
      const start = performance.now();
      await supabase.from("stores").select("id").limit(1);
      const end = performance.now();
      setDbLatency(Math.round(end - start));

      // Mock module status, in real scenario we could check specific endpoints or recent DB writes
      const checkModule = async (table: string) => {
        try {
          const { error } = await supabase.from(table as any).select("id").limit(1);
          return error ? "error" : "operational";
        } catch {
          return "error";
        }
      };

      const [vendas, estoque, os, caixa, errorsResponse] = await Promise.all([
        checkModule("sales"),
        checkModule("products"),
        checkModule("service_orders"),
        checkModule("cash_entries"),
        supabase.from("error_logs" as any).select("*").eq("store_id", activeStoreId).order("created_at", { ascending: false }).limit(20)
      ]);

      setModuleStatus({ vendas, estoque, os, caixa });
      if (errorsResponse.data) setErrorLogs(errorsResponse.data);

    } catch (err) {
      console.error(err);
    } finally {
      setTestingHealth(false);
    }
  };

  useEffect(() => { fetchData(); }, [activeStoreId]);

  const handleAddWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.url || !form.store_id) return;
    setLoading(true);
    const { error } = await supabase.from("webhooks").insert({
      store_id: activeStoreId || form.store_id, event_type: form.event_type, url: form.url, is_active: true
    });
    if (error) toast.error("Erro ao salvar Webhook: " + error.message);
    else {
      toast.success("Automação configurada!");
      setForm(f => ({ ...f, url: "" }));
      fetchData();
    }
    setLoading(false);
  };

  const handleToggle = async (id: string, current: boolean) => {
    const { error } = await supabase.from("webhooks" as any).update({ is_active: !current }).eq("id", id);
    if (error) toast.error("Erro ao atualizar!");
    else fetchData();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("webhooks" as any).delete().eq("id", id);
    if (error) toast.error("Erro ao excluir!");
    else { toast.success("Excluído!"); fetchData(); }
  };

  const handleTestWebhook = async (webhook: Tables<"webhooks">) => {
    toast.info("Enviando teste...");
    try {
      await fetch(webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        mode: "no-cors",
        body: JSON.stringify({
          event: "test_event",
          timestamp: new Date().toISOString(),
          data: { message: "Teste", webhook_id: webhook.id, store: storeMap.get(webhook.store_id) },
        }),
      });
      toast.success("Teste disparado!");
    } catch (err) {
      toast.error("Falha ao disparar teste.");
    }
  };

  const storeMap = new Map(stores.map(s => [s.id, s.name]));

  const handleSaveWhatsappConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappConfig.api_url || !whatsappConfig.api_key || !whatsappConfig.instance_name) {
      toast.error("Preencha todos os campos da API.");
      return;
    }
    setLoading(true);
    const payload = {
      api_url: whatsappConfig.api_url,
      api_key: whatsappConfig.api_key,
      instance_name: whatsappConfig.instance_name,
      is_active: whatsappConfig.is_active,
      store_id: activeStoreId || form.store_id || (stores.length > 0 ? stores[0].id : null)
    };
    const { error } = whatsappConfig.id
      ? await supabase.from("whatsapp_config").update(payload).eq("id", whatsappConfig.id)
      : await supabase.from("whatsapp_config").insert(payload);
    if (error) toast.error("Erro ao salvar configuração: " + error.message);
    else { toast.success("Configuração do WhatsApp salva!"); fetchData(); }
    setLoading(false);
  };

  const handleSaveInstagramConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (instagramConfig.page_access_token?.startsWith("IGAA")) {
      toast.warning("Atenção: Tokens que começam com 'IGAA' geralmente são da API Basic Display...");
    }
    setLoading(true);
    const payload = {
      page_id: instagramConfig.page_id,
      page_access_token: instagramConfig.page_access_token,
      instagram_business_account_id: instagramConfig.instagram_business_account_id,
      is_active: instagramConfig.is_active,
      ai_active: instagramConfig.ai_active,
      store_id: activeStoreId || (stores.length > 0 ? stores[0].id : null)
    };
    const { error } = instagramConfig.id
      ? await supabase.from("instagram_config").update(payload as any).eq("id", instagramConfig.id)
      : await supabase.from("instagram_config").insert(payload as any);
    if (error) toast.error("Erro Instagram: " + error.message);
    else { toast.success("Configuração do Instagram salva!"); fetchData(); }
    setLoading(false);
  };

  const reconcileOrphanSales = async () => {
    toast.loading("Procurando e conciliando vendas...", { id: "reconcile" });
    try {
      const { data: transactions } = await supabase.from('transactions').select('*').in('type', ['sale', 'income']);
      const { data: cashEntries } = await supabase.from('cash_entries' as any).select('*').in('type', ['entrada', 'misto', 'dinheiro', 'pix', 'cartao_credito']);
      const { data: registers } = await supabase.from('cash_registers' as any).select('*').eq('status', 'open');

      if (!transactions || !cashEntries || !registers) throw new Error("Erro ao carregar dados.");

      const missing = [];
      for (const tx of transactions) {
        if (tx.type !== 'sale' && tx.category !== 'acessorio') continue;
        const txDesc = tx.description || "";
        const cleanDesc = txDesc.replace(/\[.*?\]/g, '').trim();
        const match = cashEntries.find(ce => {
          const ceDesc = (ce as any).description || "";
          return ceDesc.includes(cleanDesc) && Math.abs((ce as any).amount - tx.amount) < 1;
        });
        if (!match) missing.push(tx);
      }

      if (missing.length === 0) {
        toast.success("Nenhuma venda órfã encontrada! Tudo certo.", { id: "reconcile" });
        return;
      }

      let inserted = 0;
      for (const m of missing) {
        let register = registers.find(r => (r as any).store_id === m.store_id && (r as any).opened_by === m.created_by);
        if (!register) register = registers.find(r => (r as any).store_id === m.store_id);

        if (register) {
          const payload: any = {
            cash_register_id: (register as any).id, store_id: m.store_id, type: 'entrada',
            amount: m.amount, description: m.description, payment_method: 'dinheiro',
            confirmed: false, created_by: m.created_by, created_at: m.created_at
          };
          if (m.description.includes('MISTO')) {
            const match = m.description.match(/\[MISTO:(\{.*\})\]/);
            if (match) {
              try {
                const parsed = JSON.parse(match[1]);
                let success = true;
                const cleanDesc = m.description.replace(/\[MISTO:.*\]/, '').trim();
                
                if (parsed.dinheiro > 0) {
                  const { error } = await supabase.from('cash_entries' as any).insert({ ...payload, payment_method: 'dinheiro', amount: parsed.dinheiro, description: cleanDesc });
                  if (error) success = false;
                }
                if (parsed.pix > 0) {
                  const { error } = await supabase.from('cash_entries' as any).insert({ ...payload, payment_method: 'pix', amount: parsed.pix, description: cleanDesc });
                  if (error) success = false;
                }
                if (parsed.cartao_credito > 0) {
                  const { error } = await supabase.from('cash_entries' as any).insert({ ...payload, payment_method: 'cartao_credito', amount: parsed.cartao_credito, description: cleanDesc });
                  if (error) success = false;
                }
                if (success) inserted++;
                continue;
              } catch (e) {
                console.error("Erro no parse do misto", e);
              }
            }
          } else if (m.description.includes('[PIX]')) {
            payload.payment_method = 'pix';
          } else if (m.description.includes('[Cartão]')) {
            payload.payment_method = 'cartao_credito';
          }

          const { error } = await supabase.from('cash_entries' as any).insert(payload);
          if (!error) inserted++;
        }
      }
      toast.success(`${inserted} vendas órfãs foram conciliadas no caixa!`, { id: "reconcile" });
    } catch (err: any) {
      toast.error("Erro na conciliação: " + err.message, { id: "reconcile" });
    }
  };

  const clearLogs = async () => {
    if (!activeStoreId) return;
    try {
      const { error } = await supabase.from("error_logs" as any).delete().eq("store_id", activeStoreId);
      if (error) throw error;
      toast.success("Logs de erro limpos com sucesso!");
      setErrorLogs([]);
    } catch (err) {
      toast.error("Erro ao limpar logs");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-20">
      <div>
        <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Configurações do Sistema</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Gerencie integrações, automações e verifique a saúde do sistema</p>
      </div>

      <Tabs defaultValue="integracoes" className="w-full">
        <TabsList className="mb-6 grid w-full grid-cols-2 max-w-[400px]">
          <TabsTrigger value="integracoes">Integrações & Automação</TabsTrigger>
          <TabsTrigger value="saude">Debug & Saúde</TabsTrigger>
        </TabsList>

        <TabsContent value="integracoes" className="space-y-6">
          <Card className="border-border/50 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Webhook className="h-5 w-5 text-primary" />
                Adicionar Novo Webhook
              </CardTitle>
              <CardDescription>
                Configure URLs para disparar dados (JSON) automaticamente quando ocorrerem eventos no sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddWebhook} className="grid sm:grid-cols-12 gap-4 items-end">
                <div className="space-y-1.5 sm:col-span-3">
                  <Label className="text-xs">Evento (Gatilho)</Label>
                  <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="os_status_changed">Mudança de Status OS</SelectItem>
                      <SelectItem value="sale_completed">Nova Venda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <Label className="text-xs">Loja</Label>
                  <Select value={form.store_id || activeStoreId || ""} onValueChange={(v) => setForm({ ...form, store_id: v })} disabled={!!activeStoreId}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      {stores.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-4">
                  <Label className="text-xs">URL do Endpoint</Label>
                  <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://seu-n8n.com/webhook/..." required className="h-10" />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" className="w-full h-10" disabled={loading || !form.store_id || !form.url}>
                    <Plus className="h-4 w-4 mr-1.5" /> Adicionar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-emerald-500 to-green-600" />
            <CardHeader>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-emerald-500" />
                Configuração WhatsApp Profissional
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveWhatsappConfig} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      <Globe className="h-3 w-3" /> URL da API
                    </Label>
                    <Input value={whatsappConfig.api_url} onChange={e => setWhatsappConfig({ ...whatsappConfig, api_url: e.target.value })} placeholder="https://sua-api.com" className="h-10 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> API Key
                    </Label>
                    <Input type="password" value={whatsappConfig.api_key} onChange={e => setWhatsappConfig({ ...whatsappConfig, api_key: e.target.value })} placeholder="Seu Token" className="h-10 text-sm" />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Nome da Instância</Label>
                    <Input value={whatsappConfig.instance_name} onChange={e => setWhatsappConfig({ ...whatsappConfig, instance_name: e.target.value })} placeholder="ex: LeadManager" className="h-10 text-sm" />
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <Switch checked={whatsappConfig.is_active} onCheckedChange={v => setWhatsappConfig({ ...whatsappConfig, is_active: v })} />
                    <Label className="text-sm font-medium">Integração Ativa</Label>
                  </div>
                </div>
                <Button type="submit" className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 text-white font-bold" disabled={loading}>
                  Salvar WhatsApp
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-border/50 shadow-sm overflow-hidden">
            <div className="h-1 bg-gradient-to-r from-pink-500 to-purple-600" />
            <CardHeader>
              <CardTitle className="font-display text-lg flex items-center gap-2">
                <Camera className="h-5 w-5 text-pink-500" /> Captura de Leads Instagram
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveInstagramConfig} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Page ID (Facebook)</Label>
                    <Input value={instagramConfig.page_id} onChange={e => setInstagramConfig({ ...instagramConfig, page_id: e.target.value })} className="h-10 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Instagram Business ID</Label>
                    <Input value={instagramConfig.instagram_business_account_id} onChange={e => setInstagramConfig({ ...instagramConfig, instagram_business_account_id: e.target.value })} className="h-10 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Page Access Token</Label>
                    <Input type="password" value={instagramConfig.page_access_token} onChange={e => setInstagramConfig({ ...instagramConfig, page_access_token: e.target.value })} className="h-10 text-sm" />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-primary/5 border-primary/20">
                    <div className="space-y-0.5">
                      <Label className="text-sm font-bold flex items-center gap-2">
                        <Brain className="h-4 w-4 text-primary" /> Atendimento IA
                      </Label>
                    </div>
                    <Switch checked={instagramConfig.ai_active} onCheckedChange={val => setInstagramConfig({ ...instagramConfig, ai_active: val })} />
                  </div>
                  <Button type="submit" className="w-full h-11 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-bold" disabled={loading}>
                    Salvar Instagram
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
          
          <div className="space-y-3">
            <h3 className="font-display font-semibold text-lg">Webhooks Ativos</h3>
            {webhooks.map(w => (
              <Card key={w.id} className="border-border/50 shadow-sm">
                <CardContent className="p-4 flex justify-between items-center">
                  <div>
                    <span className="font-semibold text-sm">{eventLabels[w.event_type]}</span>
                    <p className="text-xs text-muted-foreground">{w.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={w.is_active} onCheckedChange={() => handleToggle(w.id, w.is_active)} />
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleDelete(w.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* SAÚDE DO SISTEMA (NOVO PAINEL DE DEBUG) */}
        <TabsContent value="saude" className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" /> Saúde e Status do Sistema
            </h2>
            <Button variant="outline" size="sm" onClick={fetchHealthData} disabled={testingHealth}>
              Atualizar Diagnóstico
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border/50 shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="bg-primary/10 p-3 rounded-full">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Latência do Banco</p>
                  <p className="text-xl font-bold">{dbLatency ? `${dbLatency} ms` : "..."}</p>
                </div>
              </CardContent>
            </Card>
            {Object.entries(moduleStatus).map(([moduleName, status]) => (
              <Card key={moduleName} className="border-border/50 shadow-sm">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className={`p-3 rounded-full ${status === 'operational' ? 'bg-green-500/10' : status === 'error' ? 'bg-red-500/10' : 'bg-muted'}`}>
                    {status === 'operational' ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground capitalize">{moduleName}</p>
                    <p className={`text-md font-bold ${status === 'operational' ? 'text-green-600' : 'text-red-600'}`}>
                      {status === 'operational' ? 'Operacional' : status === 'error' ? 'Com Falhas' : 'Verificando...'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="border-border/50 shadow-sm">
            <CardHeader className="flex flex-row justify-between items-center">
              <div>
                <CardTitle className="text-lg">Logs de Erro do Sistema</CardTitle>
                <CardDescription>Eventos e falhas registrados pela aplicação</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {userRole === 'admin' && (
                  <Button variant="outline" size="sm" onClick={reconcileOrphanSales}>
                    Conciliar Vendas Órfãs
                  </Button>
                )}
                <Button variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10" onClick={clearLogs}>
                  Limpar Logs
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {errorLogs.length === 0 ? (
                <div className="text-center p-8 text-muted-foreground border rounded-lg bg-muted/20">
                  Nenhum erro registrado recentemente.
                </div>
              ) : (
                <div className="space-y-3">
                  {errorLogs.map((log) => (
                    <div key={log.id} className="p-3 border rounded-lg bg-card flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            log.severity === 'error' ? 'bg-red-100 text-red-700' :
                            log.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'
                          }`}>
                            {log.severity}
                          </span>
                          <span className="text-sm font-semibold capitalize">{log.module}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")}
                          </span>
                        </div>
                        <p className="text-sm mt-1">{log.message}</p>
                        {log.details && Object.keys(log.details).length > 0 && (
                          <pre className="text-[10px] mt-2 p-2 bg-muted rounded overflow-x-auto">
                            {JSON.stringify(log.details, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
