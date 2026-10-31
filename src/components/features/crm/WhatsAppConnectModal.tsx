import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  QrCode,
  MessageSquare,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Globe,
  Key,
  Copy,
  Check,
  LogOut,
  Loader2,
  Smartphone,
  ExternalLink,
  ShieldCheck,
  Radio,
  Zap,
} from "lucide-react";

export type WhatsAppConnectionState = "open" | "connecting" | "close" | "unknown";

interface WhatsAppConnectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId?: string | null;
  onStatusChange?: (status: WhatsAppConnectionState) => void;
}

export function WhatsAppConnectModal({
  open,
  onOpenChange,
  storeId,
  onStatusChange,
}: WhatsAppConnectModalProps) {
  // Form Configuration
  const [apiUrl, setApiUrl] = useState("");
  const [instanceName, setInstanceName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [configId, setConfigId] = useState<string | null>(null);

  // Operation States
  const [loadingConfig, setLoadingConfig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [connectionState, setConnectionState] = useState<WhatsAppConnectionState>("unknown");
  const [qrCodeBase64, setQrCodeBase64] = useState<string | null>(null);
  const [qrCountdown, setQrCountdown] = useState<number>(45);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [autoConfiguringWebhook, setAutoConfiguringWebhook] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("qrcode");

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);

  const cleanUrl = (url: string) => url.trim().replace(/\/+$/, "");

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL || "https://hzrqtolfbwnmmeliazmh.supabase.co"}/functions/v1/whatsapp-webhook`;

  // 1. Carregar Configuração da Loja
  const loadConfig = useCallback(async () => {
    setLoadingConfig(true);
    try {
      let query = supabase.from("whatsapp_config").select("*");
      if (storeId) {
        query = query.eq("store_id", storeId);
      }
      const { data, error } = await query.maybeSingle();

      if (error) {
        console.warn("Aviso ao carregar whatsapp_config:", error.message);
      }

      if (data) {
        setConfigId(data.id);
        setApiUrl(data.api_url || "");
        setInstanceName(data.instance_name || "");
        setApiKey(data.api_key || "");
        setIsActive(data.is_active ?? true);

        // Se já tem URL e instância, checar status
        if (data.api_url && data.instance_name && data.api_key) {
          checkConnectionState(data.api_url, data.instance_name, data.api_key, false);
        }
      } else {
        // Se não tiver registro, buscar de localStorage como fallback
        const local = localStorage.getItem("whatsapp_assistant_config");
        if (local) {
          try {
            const parsed = JSON.parse(local);
            if (parsed.evolutionUrl) setApiUrl(parsed.evolutionUrl);
            if (parsed.evolutionInstance) setInstanceName(parsed.evolutionInstance);
            if (parsed.evolutionApiKey) setApiKey(parsed.evolutionApiKey);
          } catch {}
        }
      }
    } catch (err: any) {
      console.error("Erro geral ao carregar config:", err);
    } finally {
      setLoadingConfig(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (open) {
      loadConfig();
    } else {
      // Limpar timers ao fechar modal
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      setQrCodeBase64(null);
    }
  }, [open, loadConfig]);

  // 2. Checar Estado da Conexão (/instance/connectionState)
  const checkConnectionState = async (
    url = apiUrl,
    inst = instanceName,
    key = apiKey,
    showFeedback = true
  ): Promise<WhatsAppConnectionState> => {
    if (!url || !inst || !key) {
      if (showFeedback) {
        toast.warning("Preencha a URL, Nome da Instância e API Key primeiro.");
        setActiveTab("config");
      }
      setConnectionState("unknown");
      onStatusChange?.("unknown");
      return "unknown";
    }

    setChecking(true);
    try {
      const endpoint = `${cleanUrl(url)}/instance/connectionState/${inst.trim()}`;
      const res = await fetch(endpoint, {
        headers: { apikey: key.trim() },
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Servidor Evolution retornou status ${res.status}: ${errorText.slice(0, 100)}`);
      }

      const data = await res.json();
      const stateRaw = data?.instance?.state || data?.state || data?.status;

      let determined: WhatsAppConnectionState = "close";
      if (stateRaw === "open" || stateRaw === "connected") {
        determined = "open";
      } else if (stateRaw === "connecting") {
        determined = "connecting";
      } else {
        determined = "close";
      }

      setConnectionState(determined);
      onStatusChange?.(determined);

      if (determined === "open") {
        setQrCodeBase64(null);
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        if (showFeedback) toast.success("✅ WhatsApp conectado e pronto para uso!");
      } else if (showFeedback) {
        toast.info("WhatsApp desconectado. Gere o QR Code para conectar.");
      }

      return determined;
    } catch (err: any) {
      console.error("Falha ao checar conexão:", err);
      setConnectionState("close");
      onStatusChange?.("close");
      if (showFeedback) {
        toast.error(`Falha de comunicação: ${err.message}`);
      }
      return "close";
    } finally {
      setChecking(false);
    }
  };

  // 3. Salvar Configurações no Banco
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!apiUrl.trim() || !instanceName.trim() || !apiKey.trim()) {
      toast.error("Preencha a URL da API, o Nome da Instância e a API Key.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        api_url: cleanUrl(apiUrl),
        instance_name: instanceName.trim(),
        api_key: apiKey.trim(),
        is_active: isActive,
        store_id: storeId || null,
        updated_at: new Date().toISOString(),
      };

      if (configId) {
        const { error } = await supabase
          .from("whatsapp_config")
          .update(payload)
          .eq("id", configId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("whatsapp_config")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (data?.id) setConfigId(data.id);
      }

      // Salvar também em localStorage para fallback rápido
      localStorage.setItem(
        "whatsapp_assistant_config",
        JSON.stringify({
          evolutionUrl: cleanUrl(apiUrl),
          evolutionInstance: instanceName.trim(),
          evolutionApiKey: apiKey.trim(),
        })
      );

      toast.success("Configurações salvas com sucesso!");
      // Testar conexão automaticamente após salvar
      await checkConnectionState(apiUrl, instanceName, apiKey, true);
    } catch (err: any) {
      toast.error("Erro ao salvar no banco: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // 4. Gerar QR Code (/instance/connect)
  const handleGenerateQr = async () => {
    if (!apiUrl.trim() || !instanceName.trim() || !apiKey.trim()) {
      toast.error("Preencha e salve as configurações da API antes de gerar o QR Code.");
      setActiveTab("config");
      return;
    }

    setGeneratingQr(true);
    setQrCodeBase64(null);
    setQrCountdown(45);

    try {
      const endpoint = `${cleanUrl(apiUrl)}/instance/connect/${instanceName.trim()}`;
      const res = await fetch(endpoint, {
        headers: { apikey: apiKey.trim() },
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erro ${res.status}: ${txt.slice(0, 150)}`);
      }

      const data = await res.json();

      // Checar se já estava conectado
      if (
        data?.instance?.state === "open" ||
        data?.state === "open" ||
        data?.status === "connected"
      ) {
        setConnectionState("open");
        onStatusChange?.("open");
        toast.success("WhatsApp já está conectado!");
        return;
      }

      // Extrair Base64 do QR Code
      let base64 = data?.base64 || data?.qrcode?.base64 || data?.code;

      if (!base64 && typeof data === "string" && data.startsWith("data:image")) {
        base64 = data;
      }

      if (base64) {
        if (!base64.startsWith("data:image")) {
          base64 = `data:image/png;base64,${base64}`;
        }
        setQrCodeBase64(base64);
        setConnectionState("connecting");
        onStatusChange?.("connecting");
        toast.success("QR Code gerado! Abra o WhatsApp no celular e escaneie.");

        // Iniciar polling a cada 3.5 segundos para checar se foi lido
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        pollTimerRef.current = setInterval(async () => {
          const state = await checkConnectionState(apiUrl, instanceName, apiKey, false);
          if (state === "open") {
            if (pollTimerRef.current) clearInterval(pollTimerRef.current);
            if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
            setQrCodeBase64(null);
            toast.success("🎉 WhatsApp conectado com sucesso!");
          }
        }, 3500);

        // Contador de expiração
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = setInterval(() => {
          setQrCountdown((prev) => {
            if (prev <= 1) {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        throw new Error("O servidor da Evolution não retornou o código QR.");
      }
    } catch (err: any) {
      toast.error("Falha ao gerar QR Code: " + err.message);
    } finally {
      setGeneratingQr(false);
    }
  };

  // 5. Desconectar WhatsApp (/instance/logout)
  const handleLogout = async () => {
    if (!apiUrl.trim() || !instanceName.trim() || !apiKey.trim()) return;
    if (!window.confirm("Deseja realmente desconectar o WhatsApp desta instância?")) return;

    setLoggingOut(true);
    try {
      const endpoint = `${cleanUrl(apiUrl)}/instance/logout/${instanceName.trim()}`;
      const res = await fetch(endpoint, {
        method: "DELETE",
        headers: { apikey: apiKey.trim() },
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Erro ${res.status}: ${txt.slice(0, 100)}`);
      }

      setConnectionState("close");
      onStatusChange?.("close");
      setQrCodeBase64(null);
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

      toast.success("WhatsApp desconectado com sucesso!");
    } catch (err: any) {
      toast.error("Erro ao desconectar: " + err.message);
    } finally {
      setLoggingOut(false);
    }
  };

  const copyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    toast.success("URL do Webhook copiada!");
    setTimeout(() => setCopiedWebhook(false), 2500);
  };

  const handleAutoConfigureWebhook = async () => {
    if (!apiUrl.trim() || !instanceName.trim() || !apiKey.trim()) {
      toast.error("Preencha e salve a URL da API, Nome da Instância e API Key primeiro.");
      setActiveTab("config");
      return;
    }

    setAutoConfiguringWebhook(true);
    try {
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_q1FPRdUrknXLi7966SRljg_c1YWE0fS";
      const endpoint = `${cleanUrl(apiUrl)}/webhook/set/${instanceName.trim()}`;
      
      const payload = {
        webhook: {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: true,
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          events: [
            "MESSAGES_UPSERT",
            "CONNECTION_UPDATE",
            "MESSAGES_UPDATE"
          ]
        }
      };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey.trim(),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        // Tentar formato plano
        const altPayload = {
          enabled: true,
          url: webhookUrl,
          byEvents: false,
          base64: true,
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${anonKey}`,
          },
          events: [
            "MESSAGES_UPSERT",
            "CONNECTION_UPDATE",
            "MESSAGES_UPDATE"
          ]
        };

        const altRes = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: apiKey.trim(),
          },
          body: JSON.stringify(altPayload),
        });

        if (!altRes.ok) {
          const txt = await altRes.text();
          throw new Error(`Servidor Evolution retornou ${altRes.status}: ${txt.slice(0, 120)}`);
        }
      }

      toast.success("✅ Webhook configurado na Evolution com autenticação do Supabase!");
    } catch (err: any) {
      toast.error("Falha ao auto-configurar webhook: " + err.message);
    } finally {
      setAutoConfiguringWebhook(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                  Conexão WhatsApp
                  <Badge variant="outline" className="text-[10px] font-normal border-emerald-500/30 text-emerald-400">
                    Evolution API
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Conecte o número de atendimento da loja ao CRM via QR Code
                </DialogDescription>
              </div>
            </div>

            {/* Badge de Status Atual */}
            {connectionState === "open" && (
              <Badge className="bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 gap-1.5 py-1 px-2.5">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Conectado
              </Badge>
            )}
            {connectionState === "connecting" && (
              <Badge className="bg-yellow-500/15 text-yellow-400 border border-yellow-500/30 gap-1.5 py-1 px-2.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                Aguardando QR
              </Badge>
            )}
            {connectionState === "close" && (
              <Badge variant="secondary" className="bg-destructive/15 text-destructive border border-destructive/30 gap-1.5 py-1 px-2.5">
                <XCircle className="h-3 w-3" />
                Desconectado
              </Badge>
            )}
            {connectionState === "unknown" && (
              <Badge variant="outline" className="text-muted-foreground gap-1.5 py-1 px-2.5">
                <Radio className="h-3 w-3" />
                Não Testado
              </Badge>
            )}
          </div>
        </DialogHeader>

        {loadingConfig ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
            <p className="text-xs">Carregando configurações...</p>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2 w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="qrcode" className="gap-1.5 text-xs">
                <QrCode className="h-3.5 w-3.5" /> Conectar QR Code
              </TabsTrigger>
              <TabsTrigger value="config" className="gap-1.5 text-xs">
                <Globe className="h-3.5 w-3.5" /> Dados da Instância
              </TabsTrigger>
              <TabsTrigger value="webhook" className="gap-1.5 text-xs">
                <ShieldCheck className="h-3.5 w-3.5" /> Webhook CRM
              </TabsTrigger>
            </TabsList>

            {/* ABA 1: QR CODE & CONEXÃO */}
            <TabsContent value="qrcode" className="space-y-4 pt-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-4">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                  <div>
                    <h4 className="text-sm font-semibold flex items-center gap-1.5">
                      <Smartphone className="h-4 w-4 text-emerald-500" />
                      Status do WhatsApp da Loja
                    </h4>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Instância: <span className="font-mono text-foreground font-semibold">{instanceName || "Não definida"}</span>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => checkConnectionState(apiUrl, instanceName, apiKey, true)}
                      disabled={checking || !apiUrl}
                      className="h-8 text-xs gap-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
                      {checking ? "Verificando..." : "Verificar Status"}
                    </Button>

                    {connectionState === "open" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={handleLogout}
                        disabled={loggingOut}
                        className="h-8 text-xs gap-1.5"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        {loggingOut ? "Desconectando..." : "Desconectar"}
                      </Button>
                    )}
                  </div>
                </div>

                {/* Bloco de Estado: Conectado */}
                {connectionState === "open" && (
                  <div className="py-6 px-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center space-y-2">
                    <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <h5 className="font-semibold text-sm text-emerald-400">WhatsApp Conectado e Ativo!</h5>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto">
                      Sua loja já pode enviar e receber mensagens de clientes diretamente pelo CRM e ChatCenter.
                    </p>
                  </div>
                )}

                {/* Bloco de QR Code Exibido */}
                {connectionState !== "open" && qrCodeBase64 && (
                  <div className="flex flex-col items-center justify-center py-4 space-y-3">
                    <div className="p-3 bg-white rounded-xl shadow-md border-2 border-emerald-500/40">
                      <img
                        src={qrCodeBase64}
                        alt="QR Code WhatsApp"
                        className="w-56 h-56 object-contain"
                      />
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-xs font-medium text-foreground flex items-center justify-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
                        Abra o WhatsApp no celular &gt; Dispositivos Conectados &gt; Conectar um Aparelho
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {qrCountdown > 0 ? (
                          <span>O QR Code expira em <span className="font-bold text-emerald-400 font-mono">{qrCountdown}s</span></span>
                        ) : (
                          <span className="text-yellow-400">QR Code expirado. Clique abaixo para gerar outro.</span>
                        )}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleGenerateQr}
                      disabled={generatingQr}
                      className="text-xs gap-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${generatingQr ? "animate-spin" : ""}`} />
                      Regerar QR Code
                    </Button>
                  </div>
                )}

                {/* Bloco de Estado: Desconectado / Sem QR gerado */}
                {connectionState !== "open" && !qrCodeBase64 && (
                  <div className="py-8 px-4 text-center space-y-3">
                    <div className="mx-auto h-12 w-12 rounded-full bg-muted text-muted-foreground flex items-center justify-center">
                      <QrCode className="h-6 w-6" />
                    </div>
                    <div>
                      <h5 className="font-semibold text-sm">Pronto para conectar</h5>
                      <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-0.5">
                        Gere o QR Code e aponte a câmera do WhatsApp para iniciar o atendimento integrado.
                      </p>
                    </div>

                    <Button
                      onClick={handleGenerateQr}
                      disabled={generatingQr || !apiUrl || !instanceName}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 gap-2"
                    >
                      {generatingQr ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Gerando QR Code...
                        </>
                      ) : (
                        <>
                          <QrCode className="h-4 w-4" />
                          Gerar QR Code de Conexão
                        </>
                      )}
                    </Button>

                    {!apiUrl && (
                      <p className="text-[11px] text-yellow-500 flex items-center justify-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Configure os dados da sua nova Evolution API na aba &quot;Dados da Instância&quot;.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ABA 2: DADOS DA INSTÂNCIA */}
            <TabsContent value="config" className="space-y-4 pt-3">
              <form onSubmit={handleSave} className="space-y-4">
                <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold flex items-center gap-1.5">
                      <Globe className="h-3.5 w-3.5 text-emerald-500" />
                      URL da Evolution API
                    </Label>
                    <Input
                      value={apiUrl}
                      onChange={(e) => setApiUrl(e.target.value)}
                      placeholder="https://evolution.seudominio.com"
                      className="h-9 text-xs font-mono"
                      required
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Endereço base do seu servidor ou VPS da Evolution (ex: https://api.loja.com ou http://IP:8080).
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
                        Nome da Instância
                      </Label>
                      <Input
                        value={instanceName}
                        onChange={(e) => setInstanceName(e.target.value)}
                        placeholder="ex: cellpro ou loja1"
                        className="h-9 text-xs font-mono"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center gap-1.5">
                        <Key className="h-3.5 w-3.5 text-emerald-500" />
                        API Key (Chave Secreta)
                      </Label>
                      <Input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder="Chave AUTHENTICATION_API_KEY"
                        className="h-9 text-xs font-mono"
                        required
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/40">
                    <div className="space-y-0.5">
                      <Label className="text-xs font-semibold">Integração Ativa no CRM</Label>
                      <p className="text-[11px] text-muted-foreground">
                        Permite que os vendedores enviem mensagens pelo painel.
                      </p>
                    </div>
                    <Switch checked={isActive} onCheckedChange={setIsActive} />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => checkConnectionState(apiUrl, instanceName, apiKey, true)}
                    disabled={checking || !apiUrl}
                    className="text-xs h-9 gap-1.5"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} />
                    Testar Conexão
                  </Button>

                  <Button
                    type="submit"
                    size="sm"
                    disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-9 px-4 gap-1.5"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Salvando...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        Salvar Configurações
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* ABA 3: WEBHOOK CRM */}
            <TabsContent value="webhook" className="space-y-4 pt-3">
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-emerald-500" />
                    Webhook para Recebimento Automático
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure esta URL na sua Evolution API para que as mensagens recebidas caiam automaticamente no CRM.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">URL do Webhook do CellManagerPro</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={webhookUrl}
                      className="h-9 text-xs font-mono bg-background select-all"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={copyWebhook}
                      className="h-9 px-3 text-xs gap-1 shrink-0"
                    >
                      {copiedWebhook ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                      {copiedWebhook ? "Copiado!" : "Copiar"}
                    </Button>
                  </div>
                </div>

                <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/40">
                  <p className="text-[11px] text-muted-foreground">
                    Clique abaixo para injetar a URL e as chaves de autorização diretamente na sua Evolution:
                  </p>
                  <Button
                    type="button"
                    onClick={handleAutoConfigureWebhook}
                    disabled={autoConfiguringWebhook || !apiUrl || !instanceName}
                    className="w-full sm:w-auto h-9 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5"
                  >
                    {autoConfiguringWebhook ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Configurando...
                      </>
                    ) : (
                      <>
                        <Zap className="h-3.5 w-3.5" />
                        Auto-Configurar Webhook na Evolution
                      </>
                    )}
                  </Button>
                </div>

                <div className="rounded-lg bg-background/50 border border-border/40 p-3 space-y-2 text-xs text-muted-foreground">
                  <p className="font-semibold text-foreground">Configuração Manual (caso prefira):</p>
                  <ol className="list-decimal list-inside space-y-1 text-[11px]">
                    <li>No painel da Evolution, abra a instância <strong>{instanceName || "sua instância"}</strong>.</li>
                    <li>Vá em <strong>Events &gt; Webhook</strong> e cole a URL acima.</li>
                    <li><strong>Desmarque</strong> &quot;Webhook by Events&quot; e <strong>Desmarque</strong> &quot;Webhook Base64&quot;.</li>
                    <li>Ative o evento <strong>MESSAGES_UPSERT</strong> e salve.</li>
                  </ol>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
