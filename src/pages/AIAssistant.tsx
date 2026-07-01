import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Brain, TrendingUp, Package, FileText, Loader2, Sparkles, Download, MessageSquare, Settings } from "lucide-react";
import ReactMarkdown from "react-markdown";
import WhatsAppAssistantConfig from "@/components/ai/WhatsAppAssistantConfig";

const AGENTS = [
  {
    id: "financial",
    label: "Análise Financeira",
    description: "Analisa receitas, despesas, tendências e sugere otimizações",
    icon: TrendingUp,
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    id: "stock",
    label: "Otimização de Estoque",
    description: "Identifica produtos parados, sugere compras e preços",
    icon: Package,
    color: "text-accent",
    bgColor: "bg-accent/10",
  },
  {
    id: "legal",
    label: "Termos Legais (OS)",
    description: "Gera e adapta termos de responsabilidade para OS",
    icon: FileText,
    color: "text-destructive",
    bgColor: "bg-destructive/10",
  },
];

const AIAssistant = () => {
  const { user, userRole, userPermissions } = useAuth();
  const [activeTab, setActiveTab] = useState<"agents" | "whatsapp">("agents");
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [customRequest, setCustomRequest] = useState("");
  const [exportLoading, setExportLoading] = useState<string | null>(null);

  const fetchContext = async (type: string) => {
    if (type === "financial") {
      const [salesRes, txRes, storesRes, productsRes] = await Promise.all([
        supabase.from("sales").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("stores").select("*"),
        supabase.from("products").select("id, cost_price, sale_price, status, store_id"),
      ]);
      return {
        sales: salesRes.data ?? [],
        transactions: txRes.data ?? [],
        stores: storesRes.data ?? [],
        stockSummary: {
          total: (productsRes.data ?? []).filter(p => p.status === "in_stock").length,
          totalInvested: (productsRes.data ?? []).filter(p => p.status === "in_stock").reduce((s, p) => s + Number(p.cost_price), 0),
        },
      };
    }
    if (type === "stock") {
      const [productsRes, salesRes, storesRes] = await Promise.all([
        supabase.from("products").select("*"),
        supabase.from("sales").select("product_id, sale_price, created_at").order("created_at", { ascending: false }).limit(200),
        supabase.from("stores").select("*"),
      ]);
      return {
        products: productsRes.data ?? [],
        recentSales: salesRes.data ?? [],
        stores: storesRes.data ?? [],
      };
    }
    if (type === "legal") {
      return {
        customRequest: customRequest || null,
        currentTerms: "O cliente declara que o aparelho foi entregue nas condições descritas acima. A loja não se responsabiliza por dados contidos no aparelho. Recomenda-se backup prévio. Em caso de não retirada do aparelho após 90 dias da conclusão do serviço, a loja poderá dispor do mesmo para cobrir custos. A garantia do serviço cobre apenas o defeito reparado e a peça substituída, pelo período de 90 dias. O orçamento inicial pode sofrer alterações após análise técnica, mediante aprovação do cliente.",
      };
    }
    return {};
  };

  const runAgent = async (type: string) => {
    setActiveAgent(type);
    setResult("");
    setLoading(true);

    try {
      const context = await fetchContext(type);

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ type, context }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Erro desconhecido" }));
        toast.error(err.error || "Erro ao consultar IA");
        setLoading(false);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullText += content;
              setResult(fullText);
            }
          } catch {}
        }
      }
    } catch (e: any) {
      toast.error(e.message || "Erro");
    }
    setLoading(false);
  };

  const handleExport = async (format: string) => {
    setExportLoading(format);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-data`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ format }),
        }
      );

      if (!resp.ok) {
        // Tenta ler como JSON primeiro, se falhar (ex: erro de texto puro do debug), lê como texto
        let errorMsg = "Erro ao exportar";
        try {
          const contentType = resp.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const err = await resp.json();
            errorMsg = err.error || errorMsg;
          } else {
            errorMsg = await resp.text();
          }
        } catch (e) {
          console.error("Erro ao processar resposta de erro:", e);
        }
        
        toast.error(errorMsg);
        setExportLoading(null);
        return;
      }

      const blob = await resp.blob();
      const ext = format === "json" ? "json" : format === "csv" ? "csv" : "sql";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cellmanager_export_${new Date().toISOString().split("T")[0]}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída!");
    } catch (e: any) {
      toast.error(e.message || "Erro ao exportar");
    }
    setExportLoading(null);
  };

  const canUseIA = userRole === "admin" || (userRole === "gerente" && userPermissions?.ia);
  const isAdmin = userRole === "admin";

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Brain className="h-6 w-6 text-primary" /> Assistente IA
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Agentes inteligentes para análise e otimização</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-lg bg-muted/50 w-fit border border-border/50">
        <button
          onClick={() => setActiveTab("agents")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === "agents" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" /> Agentes IA
        </button>
        <button
          onClick={() => setActiveTab("whatsapp")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
            activeTab === "whatsapp" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" /> WhatsApp Financeiro
        </button>
      </div>

      {activeTab === "whatsapp" && <WhatsAppAssistantConfig />}

      {activeTab === "agents" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {AGENTS.map((agent) => (
            <Card
              key={agent.id}
              className={`border-border/50 shadow-lg shadow-black/10 cursor-pointer transition-all hover:border-primary/30 ${
                activeAgent === agent.id ? "ring-2 ring-primary/40" : ""
              }`}
              onClick={() => !loading && runAgent(agent.id)}
            >
              <CardContent className="p-4">
                <div className={`rounded-lg ${agent.bgColor} p-2 w-fit mb-3`}>
                  <agent.icon className={`h-5 w-5 ${agent.color}`} />
                </div>
                <p className="font-medium text-sm">{agent.label}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{agent.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Custom request for legal agent */}
      {activeTab === "agents" && activeAgent === "legal" && (
        <div className="space-y-2">
          <Textarea
            value={customRequest}
            onChange={(e) => setCustomRequest(e.target.value)}
            placeholder="Descreva o cenário específico para adaptar os termos (opcional)..."
            className="min-h-[60px]"
          />
          <Button size="sm" onClick={() => runAgent("legal")} disabled={loading} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Regenerar
          </Button>
        </div>
      )}

      {/* Result */}
      {activeTab === "agents" && (result || loading) && (
        <Card className="border-border/50 shadow-lg shadow-black/10">
          <CardHeader className="pb-2">
            <CardTitle className="font-display text-sm flex items-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {AGENTS.find((a) => a.id === activeAgent)?.label || "Resultado"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown>{result || "Analisando..."}</ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Database export - admin only */}
      {activeTab === "agents" && isAdmin && (
        <Card className="border-border/50 shadow-lg shadow-black/10">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              <CardTitle className="font-display text-sm">Exportar Banco de Dados</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground mb-3">
              Exporte todos os dados do sistema. Disponível apenas para administradores.
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { format: "full_backup", label: "Backup Completo (.sql)", className: "bg-emerald-500 hover:bg-emerald-600 text-white border-0" },
                { format: "sql", label: "PostgreSQL (.sql)", desc: "Formato nativo" },
                { format: "json", label: "JSON (.json)", desc: "Universal" },
                { format: "csv", label: "CSV (.csv)", desc: "Planilhas" },
              ].map((opt) => (
                <Button
                  key={opt.format}
                  variant={opt.className ? "default" : "outline"}
                  size="sm"
                  className={`gap-1.5 ${opt.className || ""}`}
                  onClick={() => handleExport(opt.format)}
                  disabled={!!exportLoading}
                >
                  {exportLoading === opt.format ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {opt.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AIAssistant;
