import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Webhook, Trash2, Plus, Send, ExternalLink, Info, MessageSquare, ShieldCheck, Globe, Camera, Brain } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

const eventLabels: Record<string, string> = {
  os_status_changed: "Mudança de Status na OS (WhatsApp / N8N)",
  sale_completed: "Nova Venda Finalizada",
};

const Configuracoes = () => {
  const { activeStoreId, userRole } = useAuth();
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
          data: {
            message: "Teste de integração CellManager Pro",
            webhook_id: webhook.id,
            store: storeMap.get(webhook.store_id)
          },
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
       toast.warning("Atenção: Tokens que começam com 'IGAA' geralmente são da API Basic Display, que não suporta mensagens. Utilize um Token de Acesso de Página (que começa com 'EA...').");
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      <div>
        <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Configurações & Automação</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Integrações N8N, Zapier e Make para envio de WhatsApp</p>
      </div>

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
              <Label className="text-xs">URL do Endpoint (ex: N8N Catch Hook)</Label>
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
            Configuração WhatsApp Profissional (Evolution API)
          </CardTitle>
          <CardDescription>
            Integre sua instância da Evolution API para gerenciar leads diretamente pelo CRM com suporte a áudio e imagem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveWhatsappConfig} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Globe className="h-3 w-3" /> URL da API
                </Label>
                <Input
                  value={whatsappConfig.api_url}
                  onChange={e => setWhatsappConfig({ ...whatsappConfig, api_url: e.target.value })}
                  placeholder="https://sua-api.com" className="h-10 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3" /> API Key (Global ou Instance)
                </Label>
                <Input
                  type="password"
                  value={whatsappConfig.api_key}
                  onChange={e => setWhatsappConfig({ ...whatsappConfig, api_key: e.target.value })}
                  placeholder="Seu Token" className="h-10 text-sm"
                />
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Nome da Instância</Label>
                <Input
                  value={whatsappConfig.instance_name}
                  onChange={e => setWhatsappConfig({ ...whatsappConfig, instance_name: e.target.value })}
                  placeholder="ex: LeadManager" className="h-10 text-sm"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={whatsappConfig.is_active}
                  onCheckedChange={v => setWhatsappConfig({ ...whatsappConfig, is_active: v })}
                />
                <Label className="text-sm font-medium">Integração Ativa</Label>
              </div>
            </div>

            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3 space-y-2 mt-4">
              <p className="text-[11px] font-bold text-emerald-700 uppercase flex items-center gap-1">
                <Info className="h-3 w-3" /> Configuração Obrigatória no Painel Evolution
              </p>
              <p className="text-xs text-emerald-800/80 leading-relaxed">
                Para que o CRM receba as mensagens, você deve configurar o <b>Webhook</b> na sua instância da Evolution API apontando para:
              </p>
              <div className="flex items-center gap-2 bg-white/50 p-2 rounded border border-emerald-200">
                <code className="text-[10px] flex-1 break-all text-emerald-900">
                  {`https://jeaazxoeodgwvijutfyb.supabase.co/functions/v1/whatsapp-webhook`}
                </code>
                <Button type="button" variant="outline" className="h-7 px-2 text-[10px] border-emerald-200 text-emerald-700 font-bold" onClick={() => {
                  navigator.clipboard.writeText(`https://jeaazxoeodgwvijutfyb.supabase.co/functions/v1/whatsapp-webhook`);
                  toast.success("Link copiado!");
                }}>Copiar</Button>
              </div>
              <p className="text-[10px] text-emerald-700/60 mt-1">
                Eventos necessários: <b>MESSAGES_UPSERT</b>
              </p>
            </div>

            <Button type="submit" className="w-full h-11 bg-emerald-600 hover:bg-emerald-700 shadow-lg text-white font-bold" disabled={loading}>
              {loading ? "Salvando..." : (whatsappConfig as any).id ? "Atualizar Integração" : "Salvar Configurações API"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="border-border/50 shadow-sm overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-pink-500 to-purple-600" />
        <CardHeader>
          <CardTitle className="font-display text-lg flex items-center gap-2">
            <Camera className="h-5 w-5 text-pink-500" />
            Captura de Leads Instagram (Graph API)
          </CardTitle>
          <CardDescription>
            Receba DMs do Instagram diretamente no seu CRM como leads novos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveInstagramConfig} className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Page ID (Facebook)</Label>
                <Input value={instagramConfig.page_id} onChange={e => setInstagramConfig({ ...instagramConfig, page_id: e.target.value })} placeholder="ID da Página vinculada" className="h-10 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Instagram Business ID</Label>
                <Input value={instagramConfig.instagram_business_account_id} onChange={e => setInstagramConfig({ ...instagramConfig, instagram_business_account_id: e.target.value })} placeholder="ID da Conta Business" className="h-10 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Page Access Token (Permanent)</Label>
                <Input type="password" value={instagramConfig.page_access_token} onChange={e => setInstagramConfig({ ...instagramConfig, page_access_token: e.target.value })} placeholder="Seu Token de Acesso da Graph API" className="h-10 text-sm" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border bg-primary/5 border-primary/20">
                <div className="space-y-0.5">
                  <Label className="text-sm font-bold flex items-center gap-2">
                    <Brain className="h-4 w-4 text-primary" /> Atendimento IA (Kilo Agent)
                  </Label>
                  <p className="text-[10px] text-muted-foreground">A IA responderá automaticamente às novas mensagens para qualificar o lead.</p>
                </div>
                <Switch 
                  checked={instagramConfig.ai_active} 
                  onCheckedChange={val => setInstagramConfig({ ...instagramConfig, ai_active: val })}
                />
              </div>
              <div className="rounded-lg bg-pink-500/5 border border-pink-500/20 p-3 space-y-2">
                <p className="text-[11px] font-bold text-pink-700 uppercase flex items-center gap-1"><Info className="h-3 w-3" /> Webhook para Meta for Developers</p>
                <p className="text-xs text-pink-800/80 leading-relaxed">No painel do seu app no Meta, configure o Webhook para o objeto <b>instagram</b> com a URL:</p>
                <div className="flex items-center gap-2 bg-white/50 p-2 rounded border border-pink-200">
                  <code className="text-[10px] flex-1 break-all text-pink-900">{`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-webhook`}</code>
                  <Button type="button" variant="outline" className="h-7 px-2 text-[10px] border-pink-200 text-pink-700 font-bold" onClick={() => {
                    navigator.clipboard.writeText(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/instagram-webhook`);
                    toast.success("Copiado!");
                  }}>Copiar</Button>
                </div>
                <p className="text-[10px] text-pink-700/60 mt-1">Verify Token: <b>instagram_crm_verify</b> | Eventos: <b>messages</b></p>
              </div>

              <Button type="submit" className="w-full h-11 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 shadow-lg text-white font-bold" disabled={loading}>
                {loading ? "Salvando..." : instagramConfig.id ? "Atualizar Integração Instagram" : "Salvar Configurações Instagram"}
              </Button>

            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h3 className="font-display font-semibold text-lg">Webhooks Ativos</h3>
        {webhooks.length === 0 ? (
          <div className="p-8 text-center border rounded-xl bg-card/50 text-muted-foreground">
            Ainda não há integrações cadastradas.
          </div>
        ) : webhooks.map(w => (
          <Card key={w.id} className={`border-border/50 shadow-sm transition-opacity ${!w.is_active ? "opacity-60" : ""}`}>
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">{eventLabels[w.event_type] || w.event_type}</span>
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 border rounded-md">{storeMap.get(w.store_id)}</span>
                </div>
                <p className="text-xs font-mono text-muted-foreground truncate mt-1 max-w-[400px]" title={w.url}>{w.url}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-[10px] uppercase font-bold text-muted-foreground">Ativo</Label>
                  <Switch checked={w.is_active} onCheckedChange={() => handleToggle(w.id, w.is_active)} />
                </div>
                <div className="flex items-center gap-2">
                  <Button className="h-8 px-2 text-[10px] gap-1.5 bg-transparent border border-border text-foreground hover:bg-muted" onClick={() => handleTestWebhook(w)}>
                    <Send className="h-3 w-3" /> Testar
                  </Button>
                  <Button className="h-8 w-8 p-0 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => handleDelete(w.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-blue-500/20 bg-blue-500/5 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Info className="h-4 w-4 text-blue-500" />
            Como usar com N8N (WhatsApp)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            1. No N8N, crie um nó <strong>Webhook (Webhook Cloud)</strong> com método <strong>POST</strong>.<br />
            2. Copie a <strong>Production URL</strong> gerada e cole no campo acima.<br />
            3. Use o botão <strong>"Testar"</strong> para enviar um JSON de exemplo ao N8N.<br />
            4. No N8N, adicione um nó de <strong>WhatsApp (Baileys ou API Oficial)</strong> para enviar a mensagem usando os dados recebidos.
          </p>
          <div className="flex gap-2">
            <Button className="text-xs h-auto p-0 gap-1 bg-transparent text-primary hover:underline shadow-none border-0" asChild>
              <a href="https://n8n.io" target="_blank" rel="noreferrer">Site do N8N <ExternalLink className="h-3 w-3" /></a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Configuracoes;
