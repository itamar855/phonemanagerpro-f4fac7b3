import React, { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RefreshCw, CheckCircle2, AlertCircle, Send, MessageSquare, User, Clock, CheckCheck, Image as ImageIcon, Mic } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ConversaSyncProps {
  selectedLeadId?: string;
  onSyncComplete?: (messages: any[]) => void;
  onLeadSync?: (lead: any) => void;
  onNewMessage?: (message: any) => void;
  showChatUI?: boolean;
}

const ConversaSync = ({ selectedLeadId, onSyncComplete, onLeadSync, onNewMessage, showChatUI = false }: ConversaSyncProps) => {
  const [syncing, setSyncing] = useState(false);
  const [lastSyncStatus, setLastSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [messages, setMessages] = useState<any[]>([]);
  const [leadName, setLeadName] = useState<string>("");
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const syncHistory = useCallback(async () => {
    if (!selectedLeadId) return;
    
    setSyncing(true);
    setLastSyncStatus('idle');
    
    try {
      // 1. Sync Lead Name
      const { data: lead, error: leadError } = await supabase
        .from('leads')
        .select('name, instagram_username, phone')
        .eq('id', selectedLeadId)
        .single();
      
      if (lead) {
        setLeadName(lead.name || lead.instagram_username || lead.phone || "Lead");
        if (onLeadSync) onLeadSync(lead);
      }

      // 2. Fetch full history
      const { data: history, error: historyError } = await supabase
        .from('lead_messages')
        .select('*')
        .eq('lead_id', selectedLeadId)
        .order('created_at', { ascending: true });

      if (historyError) throw historyError;
      
      setMessages(history || []);
      if (onSyncComplete) onSyncComplete(history || []);
      setLastSyncStatus('success');
    } catch (err) {
      console.error("Erro ao sincronizar histórico:", err);
      setLastSyncStatus('error');
    } finally {
      setSyncing(false);
      setTimeout(() => setLastSyncStatus('idle'), 3000);
    }
  }, [selectedLeadId, onSyncComplete]);

  const sendMessage = async () => {
    if (!selectedLeadId || !newMessage.trim() || sending) return;
    
    setSending(true);
    try {
      const { data, error } = await supabase.from('lead_messages').insert({
        lead_id: selectedLeadId,
        content: newMessage,
        sender_type: 'vendedor',
        channel: 'crm'
      }).select().single();

      if (error) throw error;
      
      setNewMessage("");
      // Local update will happen via Realtime, but we can also manually add it
    } catch (err: any) {
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!selectedLeadId) return;

    // WebSocket / Realtime subscription
    const channel = supabase.channel(`lead-messages-${selectedLeadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'lead_messages',
        filter: `lead_id=eq.${selectedLeadId}`
      }, (payload) => {
        setMessages(prev => [...prev, payload.new]);
        if (onNewMessage) onNewMessage(payload.new);
      })
      .subscribe();

    // Sincronização inicial ao selecionar lead
    syncHistory();

    // Polling a cada 30 segundos como redundância
    const interval = setInterval(syncHistory, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [selectedLeadId, syncHistory, onNewMessage]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (!selectedLeadId) return null;

  if (showChatUI) {
    return (
      <Card className="flex flex-col h-full border-0 shadow-none bg-transparent">
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              <span>{leadName}</span>
            </div>
            {syncing && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 p-0 overflow-hidden">
          <ScrollArea ref={scrollRef} className="h-[400px] p-4">
            <div className="space-y-4">
              {messages.length === 0 && !syncing && (
                <div className="text-center py-8 text-muted-foreground text-xs italic">
                  Sem histórico de mensagens.
                </div>
              )}
              {messages.map((msg) => {
                const isFromMe = msg.sender_type === 'vendedor' || msg.sender === 'vendedor';
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        isFromMe
                          ? 'bg-primary text-primary-foreground rounded-tr-none'
                          : 'bg-muted text-foreground rounded-tl-none border'
                      }`}
                    >
                    {msg.message_type === 'image' ? (
                      <div className="space-y-1">
                        <img 
                          src={msg.media_url} 
                          className="rounded-lg max-h-60 object-cover cursor-pointer hover:opacity-90 w-full" 
                          onClick={() => window.open(msg.media_url, '_blank')} 
                          alt="Imagem do chat"
                        />
                        {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                      </div>
                    ) : msg.message_type === 'audio' ? (
                      <div className="flex items-center gap-2 bg-black/5 p-2 rounded-lg min-w-[200px]">
                        <Mic className="h-4 w-4" />
                        <audio controls src={msg.media_url} className="h-8 max-w-full" />
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-1 opacity-70 text-[10px]">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {msg.sender_type === 'vendedor' && <CheckCheck className="h-3 w-3" />}
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter className="p-4 border-t">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex w-full gap-2"
          >
            <Input
              placeholder="Digite sua mensagem..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={sending || !newMessage.trim()}>
              {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </CardFooter>
      </Card>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
      {syncing && (
        <Badge variant="secondary" className="flex items-center gap-2 px-3 py-1.5 shadow-xl bg-background/80 backdrop-blur-sm border-primary/20 animate-in fade-in slide-in-from-bottom-4">
          <RefreshCw className="h-3 w-3 animate-spin text-primary" />
          <span className="text-[11px] font-medium">Sincronizando conversas...</span>
        </Badge>
      )}
      
      {lastSyncStatus === 'success' && (
        <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5 shadow-xl bg-green-500/10 border-green-500/30 text-green-500 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle2 className="h-3 w-3" />
          <span className="text-[11px] font-medium">Histórico atualizado</span>
        </Badge>
      )}

      {lastSyncStatus === 'error' && (
        <Badge variant="outline" className="flex items-center gap-2 px-3 py-1.5 shadow-xl bg-destructive/10 border-destructive/30 text-destructive animate-in fade-in slide-in-from-bottom-4">
          <AlertCircle className="h-3 w-3" />
          <span className="text-[11px] font-medium">Erro na sincronização</span>
        </Badge>
      )}
    </div>
  );
};

export default ConversaSync;
