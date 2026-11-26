import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, Activity, User, Calendar, Database } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const actionLabels: Record<string, string> = {
  CREATE_SALE: "Nova Venda",
  UPDATE_OS_STATUS: "Alteração de Status OS",
  UPDATE_PRODUCT_PRICE: "Ajuste de Estoque",
  CREATE_RECORD: "Novo Registro",
  DELETE_RECORD: "Exclusão",
  UPDATE_RECORD: "Alteração Sistemática",
  LOGIN: "Acesso ao Sistema",
  TRANSFER_STOCK: "Transferência de Estoque",
};

const actionColors: Record<string, string> = {
  CREATE_SALE: "bg-green-500/10 text-green-500 border-green-500/20",
  UPDATE_OS_STATUS: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  UPDATE_PRODUCT_PRICE: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  CREATE_RECORD: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  DELETE_RECORD: "bg-destructive/10 text-destructive border-destructive/20",
  UPDATE_RECORD: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  LOGIN: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  TRANSFER_STOCK: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
};

const Auditoria = () => {
  const { user, userRole, activeStoreId } = useAuth();
  const [logs, setLogs] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    let query = supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    // Filtro por loja para não-admins
    if (userRole !== "admin") {
      if (activeStoreId && activeStoreId !== "all") {
        query = query.eq("store_id", activeStoreId);
      }
    } else if (activeStoreId && activeStoreId !== "all") {
      // Admin vendo uma loja específica
      query = query.eq("store_id", activeStoreId);
    }

    const { data: logsData, error: logsError } = await query;
    const { data: profilesData } = await supabase.from("profiles").select("user_id, display_name");

    if (logsError) {
      console.error("Erro ao buscar logs:", logsError);
      toast.error("Erro ao carregar auditoria: " + logsError.message);
    } else {
      setLogs(logsData || []);
      setProfiles(profilesData || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (activeStoreId) fetchLogs();
  }, [activeStoreId]);

  const profileMap = new Map(profiles.map(p => [p.user_id, p.display_name]));

  const filteredLogs = logs.filter(log => {
    const actionMatch = (log.action || "").toLowerCase().includes(search.toLowerCase());
    const entityMatch = (log.entity_type || "").toLowerCase().includes(search.toLowerCase());
    const userName = profileMap.get(log.user_id) || "Sistema";
    const userMatch = userName.toLowerCase().includes(search.toLowerCase());
    return actionMatch || entityMatch || userMatch;
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-xl md:text-3xl font-bold tracking-tight">Auditoria</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Rastreabilidade completa de ações críticas do sistema.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder="Buscar por ação, usuário ou entidade..." 
          className="pl-9 h-11"
        />
      </div>

      <Card className="border-border/40 shadow-xl shadow-black/5 overflow-hidden">
        <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Logs Recentes
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[calc(100vh-280px)]">
            {loading ? (
              <div className="p-8 text-center text-muted-foreground">Carregando logs...</div>
            ) : filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">Nenhum log encontrado.</div>
            ) : (
              <div className="divide-y divide-border/40">
                {filteredLogs.map((log) => (
                  <div 
                    key={log.id} 
                    onClick={() => setSelectedLog(log)}
                    className="p-4 hover:bg-muted/30 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex gap-4 items-start">
                      <div className={`mt-1 h-2 w-2 rounded-full shrink-0 ${log.action.includes('DELETE') ? 'bg-destructive' : 'bg-primary animate-pulse'}`} />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={`text-[10px] border ${actionColors[log.action] || 'bg-muted text-muted-foreground'}`}>
                            {actionLabels[log.action] || log.action}
                          </Badge>
                          <span className="text-xs font-medium text-foreground capitalize">
                            {log.entity_type ? `${log.entity_type.replace('_', ' ')}` : "Sistema"}
                          </span>
                        </div>
                        {(log.new_data?.justification || log.new_data?.reason) && (
                          <p className="text-[11px] bg-muted/40 p-1.5 rounded border border-border/50 text-foreground/80 italic font-medium max-w-md">
                            "{log.new_data?.justification || log.new_data?.reason}"
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {profileMap.get(log.user_id) || "Sistema"}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(log.created_at).toLocaleString("pt-BR")}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="text-right shrink-0">
                      {log.entity_id && (
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground bg-muted/50 px-2 py-1 rounded border border-border/40">
                          <Database className="h-3 w-3" />
                          {log.entity_id.substring(0, 8)}...
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary" />
              Detalhes do Registro
            </DialogTitle>
          </DialogHeader>
          
          {selectedLog && (
            <ScrollArea className="max-h-[60vh] mt-4">
              <div className="space-y-6 pr-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Ação</p>
                    <Badge className={`text-[10px] border ${actionColors[selectedLog.action] || 'bg-muted'}`}>
                      {actionLabels[selectedLog.action] || selectedLog.action}
                    </Badge>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Entidade</p>
                    <p className="text-sm font-semibold capitalize">{selectedLog.entity_type?.replace('_', ' ') || 'Sistema'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Usuário</p>
                    <p className="text-sm">{profileMap.get(selectedLog.user_id) || "Sistema"}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider">Horário</p>
                    <p className="text-sm">{new Date(selectedLog.created_at).toLocaleString("pt-BR")}</p>
                  </div>
                </div>

                <div className="space-y-3 font-mono">
                  <p className="text-[10px] uppercase text-muted-foreground font-bold tracking-wider font-sans">Dados da Operação</p>
                  
                  {(selectedLog.before_state || selectedLog.old_values || selectedLog.old_data) ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">Estado Anterior:</p>
                      <pre className="p-3 bg-muted/50 rounded-lg text-[10px] overflow-x-auto border border-border/40 whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.before_state || selectedLog.old_values || selectedLog.old_data, null, 2)}
                      </pre>
                    </div>
                  ) : null}

                  {(selectedLog.after_state || selectedLog.new_values || selectedLog.new_data) ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground text-primary/80">Novo Estado / Justificativa:</p>
                      <pre className="p-3 bg-primary/5 rounded-lg text-[10px] overflow-x-auto border border-primary/20 whitespace-pre-wrap">
                        {JSON.stringify(selectedLog.after_state || selectedLog.new_values || selectedLog.new_data, null, 2)}
                      </pre>
                    </div>
                  ) : null}

                  {!(selectedLog.before_state || selectedLog.old_values || selectedLog.old_data) && 
                   !(selectedLog.after_state || selectedLog.new_values || selectedLog.new_data) && (
                    <p className="text-xs text-muted-foreground italic font-sans">Nenhum detalhe técnico disponível para este registro.</p>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Auditoria;
