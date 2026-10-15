import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Wrench, Clock, CheckCircle2, AlertCircle, Package, 
  Smartphone, Calendar, Store, FileText
} from "lucide-react";

interface PublicOrder {
  order_number: number;
  status: string;
  device_brand: string;
  device_model: string;
  requested_service: string;
  estimated_completion: string | null;
  created_at: string;
  store_name: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: any; iconColor: string; desc: string }> = {
  open:             { label: "Recebida pela loja", color: "bg-blue-500/10 border-blue-500/20 text-blue-500", iconColor: "text-blue-500 bg-blue-500/20", icon: Clock,        desc: "Aparelho deu entrada. Aguardando avaliação." },
  analyzing:        { label: "Em Análise",         color: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500", iconColor: "text-yellow-500 bg-yellow-500/20", icon: AlertCircle,  desc: "Nossa equipe técnica está diagnosticando o problema." },
  waiting_part:     { label: "Aguardando Peça",    color: "bg-orange-500/10 border-orange-500/20 text-orange-500", iconColor: "text-orange-500 bg-orange-500/20", icon: Package,      desc: "Fornecedor acionado. Aguardando chegada da peça." },
  waiting_approval: { label: "Aguardando Resposta",color: "bg-yellow-500/10 border-yellow-500/20 text-yellow-500", iconColor: "text-yellow-500 bg-yellow-500/20", icon: AlertCircle,  desc: "O orçamento aguarda sua aprovação para iniciar o reparo." },
  repairing:        { label: "Em Reparo",          color: "bg-purple-500/10 border-purple-500/20 text-purple-500", iconColor: "text-purple-500 bg-purple-500/20", icon: Wrench,       desc: "Técnico está consertando seu aparelho neste exato momento." },
  ready:            { label: "Pronto p/ Retirada", color: "bg-green-500/10 border-green-500/20 text-green-500", iconColor: "text-green-500 bg-green-500/20", icon: CheckCircle2, desc: "Tudo certo! Venha retirar seu aparelho na loja." },
  delivered:        { label: "Entregue ao cliente",color: "bg-muted border-border text-muted-foreground", iconColor: "text-foreground bg-muted", icon: CheckCircle2, desc: "Aparelho entregue. Obrigado pela confiança!" },
  cancelled:        { label: "Cancelada",          color: "bg-destructive/10 border-destructive/20 text-destructive", iconColor: "text-destructive bg-destructive/20", icon: AlertCircle,  desc: "Ordem de serviço não aprovada ou cancelada." },
};

// Ordem lógica do funil
const timelineSteps = ["open", "analyzing", "waiting_approval", "repairing", "ready", "delivered"];

export default function OSPublica() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetch = async () => {
      const { data, error: rpcError } = await supabase.rpc("get_public_service_order" as any, {
        p_order_id: id,
      });

      if (rpcError || !data || data.length === 0) {
        setError(true);
        setLoading(false);
        return;
      }

      setOrder(data[0] as PublicOrder);
      setLoading(false);
    };
    if (id) fetch();
  }, [id]);

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent shadow-lg" />
    </div>
  );

  if (error || !order) return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-6 text-center">
      <div className="rounded-full bg-destructive/10 p-4 mb-2">
        <AlertCircle className="h-12 w-12 text-destructive" />
      </div>
      <h1 className="font-display text-2xl font-bold tracking-tight">OS não localizada</h1>
      <p className="text-muted-foreground w-full max-w-sm">
        O link pode estar quebrado ou a ordem foi removida. Entre em contato com a assistência técnica para verificar.
      </p>
    </div>
  );

  const isCancelled = order.status === "cancelled";
  
  // Tenta encontrar em que passo da linha do tempo normal a OS está
  let currentStepIndex = timelineSteps.indexOf(order.status);
  
  // Se for "waiting_part", a gente o posiciona no meio da análise pro reparo
  if (order.status === "waiting_part") {
      currentStepIndex = 1; // Fica rodando entre análise e aguardando peça 
  }

  // Header Hero - Fundo gradiente forte
  return (
    <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/20">
      {/* ── 1. HEADER HERO PREMIUM ────────────────────────────────────────── */}
      <div className="relative w-full overflow-hidden bg-zinc-950 px-6 pt-12 pb-24 shadow-2xl">
        {/* Background Effects */}
        <div className="absolute top-0 right-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-primary/20 blur-3xl opacity-50" />
        <div className="absolute bottom-0 left-0 -ml-16 mb-8 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl opacity-30" />
        
        <div className="relative mx-auto max-w-xl flex flex-col items-center text-center space-y-4">
          <Badge className="bg-white/10 text-white border-white/20 px-3 tracking-widest uppercase text-[10px] backdrop-blur-md">
            Rastreamento Ao Vivo
          </Badge>
          
          <div className="h-16 w-16 bg-white/5 border border-white/10 p-3 rounded-2xl backdrop-blur-lg flex items-center justify-center shadow-inner">
            <Store className="h-8 w-8 text-white/80" />
          </div>
          
          <h1 className="text-2xl font-display font-black text-white tracking-tight">
            {order.store_name}
          </h1>
          
          <div className="flex items-center gap-3 mt-4 text-xs font-medium text-white/60">
            <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-full border border-white/5">
               <FileText className="h-3.5 w-3.5 opacity-70" /> OS: #{order.order_number}
            </span>
            <span className="flex items-center gap-1.5 bg-black/30 px-3 py-1.5 rounded-full border border-white/5">
                <Calendar className="h-3.5 w-3.5 opacity-70" /> {new Date(order.created_at).toLocaleDateString("pt-BR")}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 sm:px-6 relative -mt-14 space-y-6 pb-16">
        
        {/* ── 2. ESTADO ATUAL (CARD FLUTUANTE) ────────────────────────────── */}
        {(() => {
          const sc = statusConfig[order.status] || statusConfig.open;
          const CurrentIcon = sc.icon;
          return (
            <Card className="border-border/50 shadow-2xl bg-card rounded-2xl overflow-hidden backdrop-blur-xl">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  <div className={`h-20 w-20 rounded-full flex items-center justify-center ${sc.iconColor} ${order.status !== 'delivered' && order.status !== 'cancelled' ? 'animate-pulse' : ''}`}>
                    <CurrentIcon className="h-10 w-10" />
                  </div>
                  <div>
                    <h2 className="text-xl font-black font-display tracking-tight text-foreground">{sc.label}</h2>
                    <p className="text-sm text-muted-foreground mt-1 px-4">{sc.desc}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* ── 3. TIMELINE VERTICAL ────────────────────────────────────────── */}
        {!isCancelled && (
          <Card className="border-border shadow-md bg-card rounded-2xl overflow-hidden mt-6">
            <CardContent className="p-6">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-6">Linha do Tempo</h3>
              
              <div className="relative border-l-2 border-muted ml-3 space-y-8 pb-2">
                {timelineSteps.map((step, index) => {
                  const sc = statusConfig[step];
                  
                  let state = "pending";
                  if (order.status === "delivered") {
                    state = "done";
                  } else if (order.status === "ready" && step === "delivered") {
                    state = "pending";
                  } else if (index < currentStepIndex) {
                    state = "done";
                  } else if (index === currentStepIndex) {
                    state = "active";
                  }

                  let dotColor = "bg-muted border-muted-foreground";
                  
                  if (state === "done") {
                    dotColor = "bg-green-500 border-green-500";
                  } else if (state === "active") {
                    dotColor = `bg-background border-4 ${sc.iconColor.split(' ')[0].replace('text-', 'border-')}`;
                  }

                  return (
                    <div key={step} className="relative pl-6">
                      <div className={`absolute -left-[11px] top-1/2 -translate-y-1/2 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${dotColor}`}>
                         {state === "done" && <CheckCircle2 className="h-3 w-3 text-white" />}
                      </div>
                      
                      <div className={`flex flex-col ${state === "pending" ? 'opacity-40 grayscale' : ''}`}>
                         <p className={`font-bold text-sm ${state === "active" ? 'text-foreground' : 'text-muted-foreground'}`}>{sc.label}</p>
                         {state === "active" && step === "repairing" && (
                            <p className="text-[10px] text-primary mt-0.5 animate-pulse">🛠️ O técnico está com o aparelho na bancada.</p>
                         )}
                         {state === "active" && order.status === "waiting_part" && step === "analyzing" && (
                            <p className="text-[10px] text-orange-500 mt-0.5 animate-pulse">📦 Aguardando peça chegar para reparar.</p>
                         )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── 4. DADOS DO APARELHO E SERVIÇO ───────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <Card className="border-border shadow-sm bg-muted/20 rounded-2xl overflow-hidden">
            <CardContent className="p-5 flex flex-col justify-center h-full">
               <div className="flex items-center gap-2 mb-3">
                 <Smartphone className="h-4 w-4 text-muted-foreground" />
                 <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Aparelho</h3>
               </div>
               <p className="font-display font-bold text-xl">{order.device_brand} {order.device_model}</p>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm bg-muted/20 rounded-2xl overflow-hidden">
            <CardContent className="p-5 flex flex-col h-full">
               <div className="flex items-center gap-2 mb-3">
                 <Wrench className="h-4 w-4 text-muted-foreground" />
                 <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Serviço Autorizado</h3>
               </div>
               <p className="font-medium text-sm flex-1">{order.requested_service || "Análise / Orçamento"}</p>
               
               {order.estimated_completion && (
                 <div className="bg-primary/5 border border-primary/20 p-2.5 rounded-lg mt-4 flex items-center gap-2">
                   <Calendar className="h-4 w-4 text-primary shrink-0" />
                   <div>
                     <p className="text-[9px] text-primary uppercase font-bold tracking-widest">Previsão Fique Pronto</p>
                     <p className="text-xs font-semibold">{new Date(order.estimated_completion).toLocaleString("pt-BR", { dateStyle: 'short', timeStyle: 'short' })}</p>
                   </div>
                 </div>
               )}
            </CardContent>
          </Card>
        </div>

        {/* ── FOOTER DA ASSISTÊNCIA ───────────────────────────────────────── */}
        <div className="mt-8 pt-6 border-t border-border/50 text-center space-y-2">
           <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold flex items-center justify-center gap-1">
             Garantido por {order.store_name} <CheckCircle2 className="h-3 w-3 text-primary" />
           </p>
           <p className="text-[10px] text-muted-foreground/60 max-w-sm mx-auto leading-relaxed">
             Dúvidas? Entre em contato com a assistência onde você deixou o aparelho. Mantenha seu canhoto (papel) em segurança para realizar a retirada.
           </p>
           <p className="text-[9px] text-muted-foreground/30 font-mono mt-4 pt-2">
             Powered by Cell Manager PRO v2
           </p>
        </div>

      </div>
    </div>
  );
}
