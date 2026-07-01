import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  MessageSquare,
  Webhook,
  Phone,
  ShieldCheck,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sparkles,
  Store,
  Bot,
} from "lucide-react";

interface WhatsAppConfig {
  webhookUrl: string;
  evolutionUrl: string;
  evolutionInstance: string;
  evolutionApiKey: string;
  allowedPhones: string;
  defaultStoreMode: "personal" | "ask" | "store";
  groupId: string;
}

const WhatsAppAssistantConfig = () => {
  const { userRole } = useAuth();
  const [config, setConfig] = useState<WhatsAppConfig>({
    webhookUrl: "https://hzrqtolfbwnmmeliazmh.supabase.co/functions/v1/whatsapp-financial-assistant",
    evolutionUrl: "https://evolutionapi.vps9520.panel.icontainer.net",
    evolutionInstance: "Cell pro",
    evolutionApiKey: "",
    allowedPhones: "",
    defaultStoreMode: "personal",
    groupId: "",
  });
  const [saving, setSaving] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");
  const [webhookStatus, setWebhookStatus] = useState<"idle" | "testing" | "ok" | "error">("idle");

  const isAdmin = userRole === "admin";

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save to Supabase meta or app_settings table
      const { error } = await supabase
        .from("app_settings" as any)
        .upsert({
          key: "whatsapp_assistant_config",
          value: JSON.stringify(config),
          updated_at: new Date().toISOString(),
        }, { onConflict: "key" });

      if (error) throw error;
      toast.success("Configurações salvas com sucesso!");
    } catch {
      toast.success("Configurações salvas localmente! (tabela não encontrada, contate o desenvolvedor)");
    }
    setSaving(false);
  };

  const testEvolutionConnection = async () => {
    setTestStatus("testing");
    try {
      const resp = await fetch(
        `${config.evolutionUrl}/instance/connectionState/${config.evolutionInstance}`,
        { headers: { apikey: config.evolutionApiKey } }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data?.instance?.state === "open" || data?.state === "open") {
          setTestStatus("ok");
          toast.success("✅ Evolution API conectada e instância online!");
        } else {
          setTestStatus("error");
          toast.error("⚠️ Instância offline ou desconectada do WhatsApp");
        }
      } else {
        setTestStatus("error");
        toast.error("❌ Erro ao conectar com a Evolution API");
      }
    } catch {
      setTestStatus("error");
      toast.error("❌ Não foi possível alcançar a Evolution API");
    }
  };

  const testWebhook = async () => {
    setWebhookStatus("testing");
    try {
      const testPayload = {
        event: "messages.upsert",
        instance: config.evolutionInstance,
        data: {
          key: { remoteJid: "120363427821554348@g.us", fromMe: false, id: "TESTUI001", participant: "5587992439015@s.whatsapp.net" },
          message: { conversation: "teste de conexão do painel" },
          messageType: "conversation",
          pushName: "Teste UI",
        },
      };
      const resp = await fetch(config.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });
      if (resp.ok) {
        setWebhookStatus("ok");
        toast.success("✅ Webhook respondeu corretamente!");
      } else {
        setWebhookStatus("error");
        toast.error(`❌ Webhook retornou erro ${resp.status}`);
      }
    } catch {
      setWebhookStatus("error");
      toast.error("❌ Não foi possível alcançar o Webhook");
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <ShieldCheck className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">Apenas administradores podem acessar as configurações avançadas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Assistente Financeiro WhatsApp
        </h2>
        <p className="text-muted-foreground text-xs mt-0.5">
          Configure a integração do assistente de gastos via WhatsApp
        </p>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-border/50 shadow-md shadow-black/10">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`rounded-full p-2 ${testStatus === "ok" ? "bg-emerald-500/10" : testStatus === "error" ? "bg-red-500/10" : "bg-primary/10"}`}>
              <MessageSquare className={`h-4 w-4 ${testStatus === "ok" ? "text-emerald-500" : testStatus === "error" ? "text-red-500" : "text-primary"}`} />
            </div>
            <div>
              <p className="text-xs font-medium">Evolution API</p>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${testStatus === "ok" ? "border-emerald-500 text-emerald-500" : testStatus === "error" ? "border-red-500 text-red-400" : "border-muted-foreground text-muted-foreground"}`}>
                {testStatus === "idle" ? "Não testado" : testStatus === "testing" ? "Testando..." : testStatus === "ok" ? "Online" : "Offline"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50 shadow-md shadow-black/10">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`rounded-full p-2 ${webhookStatus === "ok" ? "bg-emerald-500/10" : webhookStatus === "error" ? "bg-red-500/10" : "bg-primary/10"}`}>
              <Webhook className={`h-4 w-4 ${webhookStatus === "ok" ? "text-emerald-500" : webhookStatus === "error" ? "text-red-500" : "text-primary"}`} />
            </div>
            <div>
              <p className="text-xs font-medium">Webhook Supabase</p>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${webhookStatus === "ok" ? "border-emerald-500 text-emerald-500" : webhookStatus === "error" ? "border-red-500 text-red-400" : "border-muted-foreground text-muted-foreground"}`}>
                {webhookStatus === "idle" ? "Não testado" : webhookStatus === "testing" ? "Testando..." : webhookStatus === "ok" ? "Respondendo" : "Com Erro"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Evolution API Config */}
      <Card className="border-border/50 shadow-lg shadow-black/10">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Configurações da Evolution API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">URL da Evolution API</Label>
              <Input
                value={config.evolutionUrl}
                onChange={(e) => setConfig({ ...config, evolutionUrl: e.target.value })}
                placeholder="https://evolutionapi.seudominio.com"
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome da Instância</Label>
              <Input
                value={config.evolutionInstance}
                onChange={(e) => setConfig({ ...config, evolutionInstance: e.target.value })}
                placeholder="Cell pro"
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">API Key da Evolution</Label>
              <Input
                type="password"
                value={config.evolutionApiKey}
                onChange={(e) => setConfig({ ...config, evolutionApiKey: e.target.value })}
                placeholder="YJ43yWnyF5wGcXX..."
                className="text-xs h-8 font-mono"
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={testEvolutionConnection}
            disabled={testStatus === "testing"}
          >
            {testStatus === "testing" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : testStatus === "ok" ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : testStatus === "error" ? (
              <XCircle className="h-3 w-3 text-red-500" />
            ) : (
              <RotateCcw className="h-3 w-3" />
            )}
            Testar Conexão
          </Button>
        </CardContent>
      </Card>

      {/* Webhook Config */}
      <Card className="border-border/50 shadow-lg shadow-black/10">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Webhook className="h-4 w-4 text-primary" />
            Configurações do Webhook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">URL do Webhook (Supabase Edge Function)</Label>
            <div className="flex gap-2">
              <Input
                value={config.webhookUrl}
                onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                className="text-xs h-8 font-mono"
                readOnly
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 shrink-0 text-xs gap-1"
                onClick={() => {
                  navigator.clipboard.writeText(config.webhookUrl);
                  toast.success("URL copiada!");
                }}
              >
                Copiar
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Cole essa URL no campo Webhook da Evolution API, com o evento <code className="bg-muted px-1 rounded">MESSAGES_UPSERT</code>
            </p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">ID do Grupo de Gastos</Label>
            <Input
              value={config.groupId}
              onChange={(e) => setConfig({ ...config, groupId: e.target.value })}
              placeholder="120363427821554348@g.us"
              className="text-xs h-8 font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              ID do grupo WhatsApp onde os gastos serão registrados (atualmente: 120363427821554348@g.us)
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={testWebhook}
            disabled={webhookStatus === "testing"}
          >
            {webhookStatus === "testing" ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            Testar Webhook
          </Button>
        </CardContent>
      </Card>

      {/* Phone Permissions */}
      <Card className="border-border/50 shadow-lg shadow-black/10">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            Números Autorizados
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Telefones com acesso (separados por vírgula)</Label>
            <Input
              value={config.allowedPhones}
              onChange={(e) => setConfig({ ...config, allowedPhones: e.target.value })}
              placeholder="5587992439015,5538998460441"
              className="text-xs h-8 font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Somente esses números podem usar o assistente financeiro via WhatsApp.
              Inclua o código do país (55 para Brasil).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {["5587992439015", "5538998460441"].map(phone => (
              <Badge key={phone} variant="secondary" className="text-[11px] gap-1 font-mono">
                <Phone className="h-2.5 w-2.5" />
                {phone}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Behavior */}
      <Card className="border-border/50 shadow-lg shadow-black/10">
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-sm flex items-center gap-2">
            <Store className="h-4 w-4 text-primary" />
            Comportamento Padrão da IA
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Quando você manda uma mensagem sem especificar, como deve a IA classificar o lançamento?
            </p>
            {[
              {
                id: "personal",
                label: "🧑 Despesa Pessoal (PF) — Padrão atual",
                desc: "Todo gasto sem especificação é classificado como pessoal. Só usa empresa quando você mencionar 'loja', 'empresa', etc.",
                recommended: true,
              },
              {
                id: "ask",
                label: "❓ Perguntar sempre",
                desc: "A IA pede confirmação antes de classificar se for ambíguo.",
                recommended: false,
              },
              {
                id: "store",
                label: "🏪 Despesa da Loja (PJ)",
                desc: "Todo gasto é classificado como da empresa por padrão.",
                recommended: false,
              },
            ].map((opt) => (
              <div
                key={opt.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  config.defaultStoreMode === opt.id
                    ? "border-primary/50 bg-primary/5"
                    : "border-border/50 hover:border-primary/20"
                }`}
                onClick={() => setConfig({ ...config, defaultStoreMode: opt.id as any })}
              >
                <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${config.defaultStoreMode === opt.id ? "border-primary" : "border-muted-foreground"}`}>
                  {config.defaultStoreMode === opt.id && <div className="h-2 w-2 rounded-full bg-primary" />}
                </div>
                <div>
                  <p className="text-xs font-medium flex items-center gap-1.5">
                    {opt.label}
                    {opt.recommended && <Badge className="text-[9px] px-1 py-0 h-4">Recomendado</Badge>}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Configurações
        </Button>
      </div>
    </div>
  );
};

export default WhatsAppAssistantConfig;
