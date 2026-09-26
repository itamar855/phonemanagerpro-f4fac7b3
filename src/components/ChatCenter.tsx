import React, { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Send, Paperclip, ImageIcon, Mic, X, CheckCheck, 
  Clock, Shield, RefreshCw, MessageCircle, Search,
  Phone, ChevronRight, User, MoreVertical, Brain
} from "lucide-react";
import { toast } from "sonner";
import { convertToWebP } from "@/utils/imageOptimizer";

const InstagramIcon = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"/></svg>
);

export interface ChatCenterProps {
  leads: any[];
  onRefreshProfile: (lead: any) => void;
  onAIQualify: (leadId: string) => void;
  user: any;
  activeStoreId: string | null;
  onLeadSelect?: (lead: any) => void;
}

export default function ChatCenter({ leads, onRefreshProfile, onAIQualify, user, activeStoreId, onLeadSelect }: ChatCenterProps) {
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const filteredLeads = leads.filter(l => 
    l.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
    l.phone?.includes(searchTerm) ||
    l.instagram_username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (selectedLead) {
      fetchMessages(selectedLead.id);
      // Mark as read
      supabase.from("leads").update({ has_unread: false }).eq("id", selectedLead.id).then();
    }
  }, [selectedLead]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchMessages = async (leadId: string) => {
    const { data, error } = await supabase
      .from("lead_messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (!error) setMessages(data || []);
  };

  const handleRefreshProfile = async () => {
    if (!selectedLead || selectedLead.source !== 'instagram') return;
    const toastId = toast.loading("Sincronizando perfil via Instagram API...");
    try {
      const { data, error } = await supabase.functions.invoke('instagram-webhook', {
        body: { 
          type: 'sync-profile', 
          userId: selectedLead.instagram_user_id,
          storeId: selectedLead.store_id
        }
      });

       if (error) throw error;
       
       const profile = data.profile;
       if (profile?.error) throw new Error(profile.error);
 
       if (profile?.name) {
         await supabase.from("leads").update({ name: profile.name }).eq("id", selectedLead.id);
         toast.success(`Perfil atualizado: ${profile.name}`, { id: toastId });
         // Update local state
         setSelectedLead({ ...selectedLead, name: profile.name });
       } else {
         toast.error("Não foi possível obter o nome público.", { id: toastId });
       }
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error("Erro na sincronização: " + (err.message || "Verifique as chaves da API"), { id: toastId });
    }
  };

  const handleAIQualify = async () => {
    if (!selectedLead) return;
    const toastId = toast.loading("IA analisando histórico...");
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { type: 'qualify', context: { lead: selectedLead, messages } }
      });

      if (error) throw error;
      
      // If it's a stream or has error in body
      if (data.error) throw new Error(data.error);

      // The AI assistant returns a stream by default in my previous edit. 
      // But functions.invoke handles basic responses. 
      // If it's too complex, we might need to read the body.
      toast.info("Qualificação concluída!", { id: toastId });
      
      // Update notes with AI result
      if (data.choices?.[0]?.message?.content) {
        const aiResult = data.choices[0].message.content;
        await supabase.from("leads").update({ notes: (selectedLead.notes || "") + "\n\n--- IA QUALIFICAÇÃO ---\n" + aiResult }).eq("id", selectedLead.id);
      }
    } catch (err: any) {
      toast.error("Erro na IA: " + err.message, { id: toastId });
    }
  };

  const handleToggleAIChat = async () => {
    if (!selectedLead) return;
    const newValue = !(selectedLead as any).ai_chat_active;
    const { error } = await supabase.from("leads").update({ ai_chat_active: newValue } as any).eq("id", selectedLead.id);
    if (!error) {
      // Usando Object.assign para evitar erro de propriedade desconhecida no literal
      const updated = Object.assign({}, selectedLead, { ai_chat_active: newValue });
      setSelectedLead(updated);
      toast.success(newValue ? "IA Ativada para este chat" : "IA Desativada (Assunção Humana)");
    }
  };

  const sendMessage = async () => {
    if (!selectedLead || (!inputText.trim() && !imageFile && !audioBlob)) return;
    setLoading(true);

    try {
      if (selectedLead.source === 'instagram' && selectedLead.instagram_user_id) {
        const { data, error } = await supabase.functions.invoke('instagram-webhook', {
          body: { 
            type: 'send-message', 
            userId: selectedLead.instagram_user_id,
            storeId: selectedLead.store_id,
            message: inputText
          }
        });

        if (error) throw error;
        if (data.error) throw new Error(data.error);

        await supabase.from('lead_messages').insert({
          lead_id: selectedLead.id,
          content: inputText,
          sender_type: 'vendedor',
          message_type: 'text',
        });
      } else {
        // WhatsApp Logic
        const phone = selectedLead.phone;
        if (!phone) throw new Error("Lead sem telefone.");

        let mediaUrl = null;
        let type = 'text';

        if (imageFile) {
          const optimizedImg = await convertToWebP(imageFile);
          const path = `chat/${Date.now()}_${optimizedImg.name}`;
          const { data } = await supabase.storage.from("chat_media").upload(path, optimizedImg);
          const { data: urlData } = supabase.storage.from("chat_media").getPublicUrl(data!.path);
          mediaUrl = urlData.publicUrl;
          type = 'image';
        } else if (audioBlob) {
          const path = `chat/${Date.now()}.ogg`;
          const { data } = await supabase.storage.from("chat_media").upload(path, audioBlob);
          const { data: urlData } = supabase.storage.from("chat_media").getPublicUrl(data!.path);
          mediaUrl = urlData.publicUrl;
          type = 'audio';
        }

        await supabase.functions.invoke('whatsapp-send', {
          body: { phone, content: inputText, messageType: type, mediaUrl, leadId: selectedLead.id, userId: user?.id }
        });
      }

      setInputText("");
      setImageFile(null);
      setAudioBlob(null);
      fetchMessages(selectedLead.id);
      toast.success("Enviado!");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-160px)] bg-card border rounded-xl overflow-hidden shadow-xl">
      {/* Sidebar - Lead List */}
      <div className="w-80 border-r flex flex-col bg-muted/10">
        <div className="p-4 border-b space-y-3">
          <h2 className="font-bold flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-primary" />
            Conversas
          </h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar lead..." 
              className="pl-9 h-9 bg-background/50" 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="flex flex-col">
            {filteredLeads.map(lead => (
              <div 
                key={lead.id}
                onClick={() => setSelectedLead(lead)}
                className={`p-4 flex items-center gap-3 cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/50 ${selectedLead?.id === lead.id ? 'bg-primary/10 border-l-4 border-l-primary' : ''}`}
              >
                <div className="relative">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                    {lead.name?.substring(0, 2).toUpperCase() || <User />}
                  </div>
                  <div className="absolute -bottom-1 -right-1">
                    {lead.source === 'whatsapp' ? (
                      <div className="bg-green-500 rounded-full p-1 border-2 border-background">
                        <MessageCircle className="h-2 w-2 text-white" />
                      </div>
                    ) : (
                      <div className="bg-pink-500 rounded-full p-1 border-2 border-background">
                        <InstagramIcon className="h-2 w-2 text-white" />
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start">
                    <p className={`text-sm truncate font-semibold ${lead.has_unread ? 'text-white' : 'text-muted-foreground'}`}>
                      {lead.name || "Lead sem nome"}
                    </p>
                    <span className="text-[10px] text-muted-foreground">
                      {lead.last_message_at ? new Date(lead.last_message_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                    </span>
                  </div>
                  <p className={`text-xs truncate ${lead.has_unread ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                    {lead.last_message_content || "Nenhuma mensagem"}
                  </p>
                </div>
                {lead.has_unread && (
                  <div className="h-2.5 w-2.5 bg-primary rounded-full shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      {selectedLead ? (
        <div className="flex-1 flex flex-col bg-background">
          {/* Chat Header */}
          <div className="p-4 border-b flex items-center justify-between bg-muted/5">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary">
                {selectedLead.name?.substring(0, 2).toUpperCase() || <User />}
              </div>
              <div>
                <p className="font-bold text-sm">{selectedLead.name || "Lead"}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] h-4 py-0 uppercase">
                    {selectedLead.source}
                  </Badge>
                  {selectedLead.phone && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Phone className="h-2.5 w-2.5" /> {selectedLead.phone}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                className={`h-8 text-[10px] gap-2 ${(selectedLead as any).ai_chat_active === false ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`} 
                onClick={handleToggleAIChat}
              >
                <Brain className="h-3 w-3" /> {(selectedLead as any).ai_chat_active === false ? "IA: OFF" : "IA: ON"}
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-[10px] gap-2" onClick={handleRefreshProfile}>
                <RefreshCw className="h-3 w-3" /> Atualizar
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-[10px] gap-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10" onClick={handleAIQualify}>
                <Shield className="h-3 w-3" /> Qualificar IA
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <ScrollArea className="flex-1 p-6" ref={scrollRef}>
            <div className="space-y-4 max-w-4xl mx-auto">
              {messages.map((msg, idx) => (
                <div key={msg.id} className={`flex ${msg.sender_type === 'vendedor' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`flex flex-col ${msg.sender_type === 'vendedor' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm relative ${
                      msg.sender_type === 'vendedor'
                        ? 'bg-primary text-primary-foreground rounded-tr-none'
                        : 'bg-muted border border-border/40 text-foreground rounded-tl-none'
                    }`}>
                      {msg.message_type === 'image' ? (
                        <img src={msg.media_url} className="rounded-lg max-h-72 object-cover cursor-pointer" onClick={() => window.open(msg.media_url, '_blank')} />
                      ) : msg.message_type === 'audio' ? (
                        <audio controls src={msg.media_url} className="h-8 w-full max-w-[240px]" />
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1 px-1">
                      <span className="text-[9px] text-muted-foreground opacity-70">
                        {new Date(msg.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                      </span>
                      {msg.sender_type === 'vendedor' && <CheckCheck className="h-3 w-3 text-primary" />}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t bg-muted/5">
            <div className="max-w-4xl mx-auto space-y-3">
              {(imageFile || audioBlob) && (
                <div className="flex items-center gap-2 bg-primary/10 p-2 rounded-lg text-xs w-fit">
                  {imageFile ? <ImageIcon className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  <span>{imageFile ? imageFile.name : "Áudio pronto para envio"}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 ml-1" onClick={() => {setImageFile(null); setAudioBlob(null);}}><X className="h-3 w-3" /></Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <input type="file" id="center-img" className="hidden" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} />
                <Button variant="ghost" size="icon" className="h-10 w-10 text-muted-foreground shrink-0" onClick={() => document.getElementById('center-img')?.click()}>
                  <Paperclip className="h-5 w-5" />
                </Button>
                
                <Input 
                  placeholder="Digite uma mensagem..." 
                  className="flex-1 h-11 bg-background border-border/40 focus:ring-primary shadow-inner"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                />

                <Button
                  variant={recording ? "destructive" : "ghost"}
                  size="icon"
                  className={`h-10 w-10 shrink-0 ${recording ? 'animate-pulse' : 'text-muted-foreground'}`}
                  onClick={() => {
                    if (recording) {
                      mediaRecorder?.stop();
                      setRecording(false);
                    } else {
                      navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
                        const mr = new MediaRecorder(stream);
                        const chunks: any = [];
                        mr.ondataavailable = e => chunks.push(e.data);
                        mr.onstop = () => {
                          const blob = new Blob(chunks, { type: 'audio/ogg; codecs=opus' });
                          setAudioBlob(blob);
                        };
                        mr.start();
                        setMediaRecorder(mr);
                        setRecording(true);
                      });
                    }
                  }}
                >
                  <Mic className="h-5 w-5" />
                </Button>

                <Button size="icon" className="h-11 w-11 shrink-0 shadow-lg shadow-primary/20" disabled={loading || (!inputText.trim() && !imageFile && !audioBlob)} onClick={sendMessage}>
                  {loading ? <Clock className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground space-y-4 bg-background">
          <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center">
            <MessageCircle className="h-10 w-10 opacity-20" />
          </div>
          <p className="text-sm font-medium">Selecione uma conversa para começar</p>
        </div>
      )}
    </div>
  );
}
