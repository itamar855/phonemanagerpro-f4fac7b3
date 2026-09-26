import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { convertToWebP } from "@/utils/imageOptimizer";
import {
  Trash2, MoreVertical, MessageSquare, ChevronRight, Download,
  MessageCircle, Phone, Plus, Users, Mail, Search, Shield, Store,
  Image as ImageIcon, Mic, Send, Paperclip, UserPlus, Filter,
  Play, Pause, X, CheckCheck, Clock, RefreshCw
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { LeadList } from "@/components/LeadList";
import ConversaSync from "@/components/ConversaSync";
import ChatCenter from "@/components/ChatCenter";

import { logAction } from "@/utils/auditLogger";

const Instagram = ({ className }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></svg>
);

type LeadStatus = 'novo' | 'atendimento' | 'negociacao' | 'concluido' | 'perdido';

const statusConfig: Record<LeadStatus, { label: string; color: string }> = {
  novo: { label: "Novo", color: "bg-blue-500/15 text-blue-500 border-blue-500/20" },
  atendimento: { label: "Em Atendimento", color: "bg-yellow-500/15 text-yellow-500 border-yellow-500/20" },
  negociacao: { label: "Negociação", color: "bg-purple-500/15 text-purple-500 border-purple-500/20" },
  concluido: { label: "Concluído", color: "bg-green-500/15 text-green-500 border-green-500/20" },
  perdido: { label: "Perdido", color: "bg-destructive/15 text-destructive border-destructive/20" },
};

const allStatuses: LeadStatus[] = ['novo', 'atendimento', 'negociacao', 'concluido', 'perdido'];

const Leads = () => {
  const { user, userRole, userPermissions, activeStoreId, setActiveStoreId, loading: authLoading } = useAuth();



  const isAdmin = userRole === "admin" || userRole === "gerente";
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [responseModalOpen, setResponseModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'chat'>('kanban');
  const [responseText, setResponseText] = useState("");
  const [form, setForm] = useState({
    name: "", phone: "", email: "", source: "whatsapp", status: "novo" as LeadStatus, notes: "", store_id: "", assigned_to: ""
  });
  const [stores, setStores] = useState<any[]>([]);
  const [vendedores, setVendedores] = useState<any[]>([]);
  const [chatModalOpen, setChatModalOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [lastIGSync, setLastIGSync] = useState<{ date: Date; status: string; error_message?: string } | null>(null);
  const [syncErrors, setSyncErrors] = useState<any[]>([]);

  const fetchLastSync = useCallback(async () => {
    const { data } = await supabase
      .from("instagram_webhooks_logs")
      .select("created_at, error_message")
      .order("created_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setLastIGSync({
        date: new Date(data[0].created_at),
        status: data[0].error_message ? "Erro" : "Sucesso",
        error_message: data[0].error_message
      });
    }

    // Buscar resumo de erros recentes (últimas 24h)
    const { data: errors } = await supabase
      .from("instagram_webhooks_logs")
      .select("error_message")
      .not("error_message", "is", null)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (errors) {
      const summary = errors.reduce((acc: any, curr: any) => {
        let type = "Outro";
        const msg = curr.error_message.toLowerCase();
        if (msg.includes("token") || msg.includes("auth") || msg.includes("credential")) type = "Credenciais";
        else if (msg.includes("rate") || msg.includes("limit") || msg.includes("too many")) type = "Rate Limit";
        else if (msg.includes("field") || msg.includes("map") || msg.includes("missing")) type = "Mapeamento";

        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});
      setSyncErrors(Object.entries(summary).map(([type, count]) => ({ type, count })));
    }
  }, []);

  const handleSyncLeads = async () => {
    setSyncing(true);
    const toastId = toast.loading("Sincronizando todos os leads...");

    try {
      // 1. Sincronizar do Instagram via Webhooks Logs
      const { data: webhookLogs } = await supabase
        .from("instagram_webhooks_logs")
        .select("*")
        .eq('processed', false)
        .order('created_at', { ascending: true });

      if (webhookLogs && webhookLogs.length > 0) {
        toast.loading(`Processando ${webhookLogs.length} eventos do Instagram...`, { id: toastId });

        // Processar logs pendentes chamando o webhook para cada um
        for (const log of webhookLogs) {
          try {
            await supabase.functions.invoke('instagram-webhook', {
              body: log.payload as Record<string, any>
            });

            // Marcar como processado
            await supabase.from('instagram_webhooks_logs').update({ processed: true }).eq('id', log.id);
          } catch (processError) {
            console.error("Erro ao processar log:", log.id, processError);
          }
        }
      }

      // 2. Buscar todos os leads atuais para evitar duplicidade
      const { data: currentLeads } = await supabase.from("leads").select("phone, instagram_user_id");
      const existingPhones = new Set(currentLeads?.map(l => l.phone).filter(Boolean) || []);
      const existingIGIds = new Set(currentLeads?.map(l => l.instagram_user_id).filter(Boolean) || []);

      // 3. Buscar dados de OS e Vendas
      const [osRes, salesRes] = await Promise.all([
        supabase.from("service_orders").select("customer_name, customer_phone, store_id, created_by").not("customer_phone", "is", null).limit(2000),
        supabase.from("sales").select("customer_name, customer_phone, store_id, created_by").not("customer_phone", "is", null).limit(2000)
      ]);

      const allLegacy = [...(osRes.data || []), ...(salesRes.data || [])];
      const toAdd = new Map();

      allLegacy.forEach(legacy => {
        if (!legacy.customer_phone) return;
        const phone = legacy.customer_phone.trim();

        if (!existingPhones.has(phone) && !toAdd.has(phone)) {
          toAdd.set(phone, {
            name: legacy.customer_name || "Lead Importado",
            phone: phone,
            source: "os_vendas",
            status: "novo",
            store_id: legacy.store_id || (activeStoreId !== "all" ? activeStoreId : null),
            created_by: legacy.created_by || user?.id,
            notes: "Sincronizado automaticamente de OS/Vendas"
          });
        }
      });

      const entries = Array.from(toAdd.values());
      if (entries.length > 0) {
        const { error } = await supabase.from("leads").insert(entries);
        if (error) throw error;
      }

      toast.dismiss(toastId);
      toast.success(`${entries.length} novos leads importados e Instagram verificado!`);
      fetchData();
      fetchLastSync();
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error("Erro na sincronização: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const [filterStore, setFilterStore] = useState("all");
  const [filterSource, setFilterSource] = useState("all");
  const [filterVendedor, setFilterVendedor] = useState("all");
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Media states
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [qualifying, setQualifying] = useState(false);

   const handleRefreshProfile = async (lead: any) => {
     if (lead.source !== 'instagram' || !lead.instagram_user_id) return;
     const toastId = toast.loading("Sincronizando perfil via Instagram API...");
     try {
       const { data, error } = await supabase.functions.invoke('instagram-webhook', {
         body: { 
           type: 'sync-profile', 
           userId: lead.instagram_user_id,
           storeId: lead.store_id
         }
       });
 
       if (error) throw error;
       
       const profile = data.profile;
       if (profile?.error) throw new Error(profile.error);
 
       if (profile?.name) {
         await supabase.from("leads").update({ name: profile.name }).eq("id", lead.id);
         toast.success(`Perfil atualizado: ${profile.name}`, { id: toastId });
         fetchData();
       } else {
         toast.error("Não foi possível obter o nome público.", { id: toastId });
       }
     } catch (err: any) {
       console.error("Sync error:", err);
       toast.error("Erro na sincronização: " + (err.message || "Verifique as chaves da API"), { id: toastId });
     }
   };

  const handleAIQualify = async (leadId: string) => {
    setQualifying(true);
    const toastId = toast.loading("IA analisando histórico do lead...");
    try {
      const { data: messages } = await supabase.from("lead_messages").select("*").eq("lead_id", leadId).order("created_at", { ascending: true });
      const lead = leads.find(l => l.id === leadId);

      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { type: 'qualify', context: { lead, messages } }
      });

      if (error) throw error;

      // Handle streaming or final response
      // For simplicity, we'll assume it returns the full text for now if not handled by standard invoke
      // But usually invoke returns the body.
      // If it's a stream, we might need a more complex handler.
      
      // Let's just show the result in a toast for now or update notes
      toast.info("Qualificação concluída! Veja nos detalhes do lead.", { id: toastId });
      // In a real scenario, we'd open a modal with the result.
    } catch (err: any) {
      toast.error("Erro na qualificação: " + err.message, { id: toastId });
    } finally {
      setQualifying(false);
    }
  };

  const fetchData = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    let query = supabase.from("leads").select(`
      *,
      assigned_user:profiles!leads_assigned_to_fkey(display_name),
      store:stores(name)
    `).order("last_message_at", { ascending: false, nullsFirst: false });

    const currentStoreId = activeStoreId || localStorage.getItem("cellmanager-active-store-id");

    if (currentStoreId && currentStoreId !== "all") {
      query = query.eq("store_id", currentStoreId);
    }

    let { data: leadsData, error: leadsError } = await query;
    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      toast.error("Erro ao carregar leads: " + leadsError.message);
    }
    const { data: storesData } = await supabase.from("stores").select("*");
    const { data: profilesData } = await supabase.from("profiles").select("user_id, display_name");

    if (leadsData) {
      leadsData = leadsData.sort((a, b) => {
        const dateA = a.last_message_at || a.created_at;
        const dateB = b.last_message_at || b.created_at;
        return new Date(dateB).getTime() - new Date(dateA).getTime();
      });
      console.log(`Leads: Loaded ${leadsData.length} leads successfully`);
    }

    setLeads(leadsData ?? []);
    setStores(storesData ?? []);
    setVendedores(profilesData ?? []);
    setLoading(false);
  }, [activeStoreId, userRole, user?.id]);

  const fetchMessages = useCallback(async (leadId: string) => {
    setMessagesLoading(true);
    const { data, error } = await supabase
      .from("lead_messages")
      .select("*")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
      toast.error("Erro ao carregar mensagens");
    } else {
      setChatMessages(data ?? []);
    }
    setMessagesLoading(false);

    // Mark as read when opening chat
    await supabase.from("leads").update({ has_unread: false }).eq("id", leadId);
  }, []);

  useEffect(() => {
    if (!authLoading) {
      fetchData(true);
      fetchLastSync();
    }
  }, [activeStoreId, fetchLastSync, authLoading]);

  useEffect(() => {
    let channel: any;

    const setupRealtime = () => {
      if (channel) supabase.removeChannel(channel);

      channel = supabase.channel('crm-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, (payload) => {
          fetchData();
          if (payload.eventType === 'INSERT') toast.info("Novo lead recebido!");
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'lead_messages' }, (payload) => {
          if (selectedLead?.id === payload.new.lead_id) fetchMessages(selectedLead.id);
          if (payload.new.sender_type !== 'vendedor') toast.info("Nova mensagem recebida!");
        })
        .subscribe((status) => {
          if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            console.log("Realtime connection lost, retrying in 3s...");
            setTimeout(setupRealtime, 3000);
          }
        });
    };

    setupRealtime();

    // Fallback health check every 30s
    const interval = setInterval(() => {
      if (!channel || channel.state !== 'joined') {
        console.log("Channel not joined, reconnecting...");
        setupRealtime();
      }
    }, 30000);

    return () => {
      if (channel) supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [selectedLead?.id, fetchData, fetchMessages]);

  useEffect(() => {
    const scrollContainer = document.querySelector('[data-radix-scroll-area-viewport]');
    if (scrollContainer) {
      const isAtBottom = scrollContainer.scrollHeight - scrollContainer.scrollTop <= scrollContainer.clientHeight + 100;
      const isOpening = chatModalOpen && (!chatMessages || chatMessages.length <= 1);

      if (isAtBottom || isOpening) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [chatMessages, chatModalOpen]);

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    const { error } = await supabase.from("leads").insert({
      ...form,
      created_by: user.id,
      store_id: activeStoreId || form.store_id || null
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Lead cadastrado!");
      setDialogOpen(false);
      setForm({ name: "", phone: "", email: "", source: "whatsapp", status: "novo", notes: "", store_id: "", assigned_to: "" });
      fetchData();
    }
    setLoading(false);
  };

  const updateStatus = async (leadId: string, newStatus: LeadStatus) => {
    const { error } = await supabase.from("leads").update({ status: newStatus }).eq("id", leadId);
    if (error) toast.error(error.message);
    else {
      toast.success(`Status atualizado para ${statusConfig[newStatus].label}`);
      fetchData();
    }
  };

  const handleDragStart = (e: React.DragEvent, leadId: string) => {
    e.dataTransfer.setData("leadId", leadId);
  };

  const handleDrop = (e: React.DragEvent, newStatus: LeadStatus) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("leadId");
    if (leadId) updateStatus(leadId, newStatus);
  };

  const handleDragOver = (e: React.DragEvent) => e.preventDefault();

  const handleEditLead = (lead: any) => {
    setSelectedLead(lead);
    setForm({
      name: lead.name,
      phone: lead.phone || "",
      email: lead.email || "",
      source: lead.source,
      status: lead.status,
      notes: lead.notes || "",
      store_id: lead.store_id || "",
      assigned_to: lead.assigned_to || ""
    });
    setEditModalOpen(true);
  };

  const saveEditLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;
    setLoading(true);
    const { error } = await supabase.from("leads").update({
      name: form.name,
      phone: form.phone,
      email: form.email,
      source: form.source,
      notes: form.notes,
      store_id: activeStoreId || form.store_id || null,
      assigned_to: form.assigned_to || null
    }).eq("id", selectedLead.id);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Lead atualizado!");
      setEditModalOpen(false);
      fetchData();
    }
    setLoading(false);
  };

  const filteredLeads = leads.filter(lead => {
    const name = lead.name || "";
    const phone = lead.phone || "";
    const igId = lead.instagram_user_id || "";

    const matchesSearch = name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      phone.includes(searchTerm) ||
      igId.includes(searchTerm);

    const matchesStore = filterStore === "all" || lead.store_id === filterStore;
    const matchesSource = filterSource === "all" || lead.source === filterSource;
    const matchesVendedor = filterVendedor === "all" || lead.assigned_to === filterVendedor;

    return matchesSearch && matchesStore && matchesSource && matchesVendedor;
  });

  const kpis = {
    total: leads.length,
    newToday: leads.filter(l => new Date(l.created_at) > new Date(Date.now() - 24 * 60 * 60 * 1000)).length,
    atendimento: leads.filter(l => l.status === 'atendimento').length,
    concluded: leads.filter(l => l.status === 'concluido').length,
    conversion: leads.length > 0 ? Math.round((leads.filter(l => l.status === 'concluido').length / leads.length) * 100) : 0
  };

  const handleResponse = (lead: any) => {
    setSelectedLead(lead);
    setResponseModalOpen(true);
    setResponseText("");
  };

  const handleDeleteLead = async (leadId: string, leadName: string) => {
    if (window.confirm(`Tem certeza que deseja excluir o lead ${leadName}? Esta ação não pode ser desfeita.`)) {
      const { error } = await supabase.from("leads").delete().eq("id", leadId);
      if (error) {
        toast.error("Erro ao excluir: " + error.message);
      } else {
        toast.success("Lead excluído com sucesso!");
        logAction?.("DELETE_RECORD", "Leads", leadId);
        setLeads(prev => prev.filter(l => l.id !== leadId));
      }
    }
  };

  const sendResponse = async () => {
    if (!selectedLead || !responseText.trim()) return;

    setLoading(true);
    try {
      // Check if it's an Instagram Lead
      if (selectedLead.source === 'instagram' && selectedLead.instagram_user_id) {
        const { data: igConfig } = await supabase.from("instagram_config")
          .select("*")
          .eq("is_active", true)
          .eq("store_id", selectedLead.store_id)
          .maybeSingle();

        if (igConfig) {
          const response = await fetch(`https://graph.facebook.com/v19.0/${igConfig.instagram_business_account_id}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${igConfig.page_access_token}` },
            body: JSON.stringify({
              recipient: { id: selectedLead.instagram_user_id },
              message: { text: responseText }
            })
          });

          const result = await response.json();
          if (!response.ok) throw new Error(`Erro Instagram: ${result.error?.message || 'Erro desconhecido'}`);

          await supabase.from('lead_messages').insert({
            lead_id: selectedLead.id,
            content: responseText,
            sender_type: 'vendedor',
            message_type: 'text',
          });

          toast.success("Mensagem enviada via Instagram!");
        } else {
          throw new Error("Instagram não configurado.");
        }
      } else {
        // WhatsApp Logic (Existing)
        let currentPhone = selectedLead.phone;
        if (!currentPhone && form.phone) {
          const { data: updatedLead } = await supabase.from("leads").update({ phone: form.phone }).eq("id", selectedLead.id).select().single();
          if (updatedLead) {
            currentPhone = updatedLead.phone;
            setSelectedLead(updatedLead);
          }
        }

        if (!currentPhone) throw new Error("Telefone do lead é necessário.");

        const { data: waConfig } = await supabase.from("whatsapp_config")
          .select("id")
          .eq("is_active", true)
          .eq("store_id", selectedLead.store_id)
          .maybeSingle();

        if (waConfig) {
          let mediaUrlToUpload = null;
          let finalMessageType = 'text';

          if (imageFile) {
            const optimizedImg = await convertToWebP(imageFile);
            const path = `chat/${Date.now()}_${optimizedImg.name}`;
            const { data: uploadData, error: uploadError } = await supabase.storage.from("chat_media").upload(path, optimizedImg);
            if (uploadError) throw uploadError;
            const { data: urlData } = supabase.storage.from("chat_media").getPublicUrl(uploadData.path);
            mediaUrlToUpload = urlData.publicUrl;
            finalMessageType = 'image';
          } else if (audioBlob) {
            const path = `chat/${Date.now()}.ogg`;
            const { data: uploadData, error: uploadError } = await supabase.storage.from("chat_media").upload(path, audioBlob);
            if (uploadError) throw uploadError;
            const { data: urlData } = supabase.storage.from("chat_media").getPublicUrl(uploadData.path);
            mediaUrlToUpload = urlData.publicUrl;
            finalMessageType = 'audio';
          }

          const { data: callRes, error: callError } = await supabase.functions.invoke('whatsapp-send', {
            body: { phone: currentPhone, content: responseText, messageType: finalMessageType, mediaUrl: mediaUrlToUpload, leadId: selectedLead.id, userId: user?.id }
          });

          if (callError) throw callError;
          toast.success("Mensagem enviada via WhatsApp API!");
        } else {
          const { error: queueError } = await (supabase as any).from("lead_responses").insert({ lead_id: selectedLead.id, content: responseText, status: 'pending' });
          if (queueError) throw queueError;
          toast.success("Enviado para a fila da extensão.");
        }
      }

      if (selectedLead.status === 'novo') await updateStatus(selectedLead.id, 'atendimento');
      setResponseModalOpen(false);
      setChatModalOpen(false);
      setResponseText("");
    } catch (err: any) {
      toast.error("Erro ao enviar: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 h-full flex flex-col">
      <div className="flex flex-col gap-4 border-b pb-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight text-white">CRM de Leads</h1>
              {loading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />}
            </div>
            {lastIGSync && (
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground bg-muted/20 w-fit px-2 py-0.5 rounded-full border border-border/20">
                <div className={`h-1.5 w-1.5 rounded-full ${lastIGSync.status === 'Sucesso' ? 'bg-green-500' : 'bg-red-500'}`} />
                Sync Instagram: {lastIGSync.date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <div className="flex bg-muted/30 p-1 rounded-lg border border-border/40">
              <Button 
                variant={viewMode === 'kanban' ? 'secondary' : 'ghost'} 
                size="sm" 
                className="h-8 text-[10px] px-3 gap-2"
                onClick={() => setViewMode('kanban')}
              >
                <Users className="h-3.5 w-3.5" /> Funil Kanban
              </Button>
              <Button 
                variant={viewMode === 'chat' ? 'secondary' : 'ghost'} 
                size="sm" 
                className="h-8 text-[10px] px-3 gap-2"
                onClick={() => setViewMode('chat')}
              >
                <MessageSquare className="h-3.5 w-3.5" /> Central Chat
                {leads.some(l => l.has_unread) && <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />}
              </Button>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 h-9 border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                onClick={handleSyncLeads}
                disabled={syncing}
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? "Sincronizando..." : "Sincronizar Leads"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2 h-9 border-border text-muted-foreground hidden md:flex"
                onClick={() => window.open(`https://github.com/itamar855/cellpromanager/archive/refs/heads/main.zip`, '_blank')}
              >
                <Download className="h-4 w-4" /> Extensão
              </Button>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2 h-9 shadow-lg shadow-primary/20"><Plus className="h-4 w-4" /> Novo Lead</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar Lead</DialogTitle></DialogHeader>
                <form onSubmit={handleCreateLead} className="space-y-3">
                  <div className="space-y-1.5"><Label className="text-xs">Nome</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="h-10" /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label className="text-xs">Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="(87) 99999-9999" className="h-10" /></div>
                    <div className="space-y-1.5"><Label className="text-xs">E-mail</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" className="h-10" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Origem</Label>
                      <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
                        <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="whatsapp">WhatsApp</SelectItem>
                          <SelectItem value="instagram">Instagram</SelectItem>
                          <SelectItem value="trafego_pago">Tráfego Pago</SelectItem>
                          <SelectItem value="indicacao">Indicação</SelectItem>
                          <SelectItem value="os_vendas">Importado (OS/Vendas)</SelectItem>
                          <SelectItem value="outro">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Responsável</Label>
                      <Select value={form.assigned_to} onValueChange={v => setForm({ ...form, assigned_to: v })}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Atribuir a..." /></SelectTrigger>
                        <SelectContent>
                          {vendedores.map(v => <SelectItem key={v.user_id} value={v.user_id}>{v.display_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Loja</Label>
                    <Select value={form.store_id || activeStoreId || ""} onValueChange={v => setForm({ ...form, store_id: v })} disabled={!!activeStoreId}>
                      <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="min-h-[80px]" /></div>
                  <Button type="submit" className="w-full h-11" disabled={loading}>{loading ? "Salvando..." : "Cadastrar Lead"}</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="bg-muted/30 border-border/40"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Leads</p><p className="text-xl font-bold text-white">{kpis.total}</p></CardContent></Card>
          <Card className="bg-muted/30 border-border/40"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Novos (24h)</p><p className="text-xl font-bold text-blue-400">{kpis.newToday}</p></CardContent></Card>
          <Card className="bg-muted/30 border-border/40"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Conversão</p><p className="text-xl font-bold text-green-400">{kpis.conversion}%</p></CardContent></Card>
          <Card className="bg-muted/30 border-border/40"><CardContent className="p-3"><p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Concluídos</p><p className="text-xl font-bold text-purple-400">{kpis.concluded}</p></CardContent></Card>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Pesquisar por nome ou telefone..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 h-10 bg-muted/20 border-border/40 focus:bg-muted/40 transition-all"
            />
          </div>
          <div className="flex gap-2">
            <Select value={filterVendedor} onValueChange={setFilterVendedor}>
              <SelectTrigger className="w-[140px] h-10 bg-muted/20 border-border/40"><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos Vendedores</SelectItem>
                {vendedores.map(v => <SelectItem key={v.user_id} value={v.user_id}>{v.display_name}</SelectItem>)}
              </SelectContent>
            </Select>
            {userRole === "admin" && (
              <Select
                value={activeStoreId || "all"}
                onValueChange={(v) => {
                  setActiveStoreId(v);
                  setFilterStore(v);
                }}
              >
                <SelectTrigger className="w-[140px] h-10 bg-muted/20 border-border/40">
                  <SelectValue placeholder="Loja" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas Lojas</SelectItem>
                  {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={filterSource} onValueChange={setFilterSource}>
              <SelectTrigger className="w-[140px] h-10 bg-muted/20 border-border/40"><SelectValue placeholder="Origem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas Origens</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="trafego_pago">Tráfego Pago</SelectItem>
                <SelectItem value="indicacao">Indicação</SelectItem>
                <SelectItem value="os_vendas">Importado (OS/Vendas)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {leads.length === 0 && !loading && (
        <Card className="bg-primary/5 border-dashed border-primary/30">
          <CardContent className="p-6 text-center space-y-3">
            <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
              <Plus className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-bold text-lg">Seu funil está vazio</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Use a nossa <strong>Extensão do Chrome</strong> no WhatsApp Web ou Instagram para capturar leads com um clique, ou clique em "Novo Lead" para adicionar manualmente.
            </p>
            <div className="flex justify-center gap-4 pt-2">
              <div className="text-xs flex items-center gap-1.5"><Badge variant="outline" className="h-5">1</Badge> Capture no WhatsApp</div>
              <div className="text-xs flex items-center gap-1.5"><Badge variant="outline" className="h-5">2</Badge> Gerencie no Kanban</div>
              <div className="text-xs flex items-center gap-1.5"><Badge variant="outline" className="h-5">3</Badge> Responda e Venda!</div>
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === 'kanban' ? (
        <LeadList
          leads={filteredLeads}
          loading={loading}
          searchTerm={searchTerm}
          allStatuses={allStatuses}
          statusConfig={statusConfig}
          onStatusChange={updateStatus}
          onLeadClick={(lead) => {
            setSelectedLead(lead);
            setChatModalOpen(true);
            fetchMessages(lead.id);
          }}
          onEditLead={handleEditLead}
          onDeleteLead={handleDeleteLead}
          onResponseClick={handleResponse}
          isAdmin={isAdmin}
        />
      ) : (
        <ChatCenter 
          leads={leads}
          user={user}
          activeStoreId={activeStoreId}
          onRefreshProfile={handleRefreshProfile}
          onAIQualify={handleAIQualify}
        />
      )}

      <ConversaSync
        selectedLeadId={selectedLead?.id}
        onLeadSync={(leadInfo) => {
          if (selectedLead && (selectedLead.name !== leadInfo.name)) {
            setSelectedLead(prev => prev ? { ...prev, ...leadInfo } : null);
          }
        }}
        onSyncComplete={(msgs) => {
          setChatMessages(msgs);
        }}
        onNewMessage={(msg) => {
          // fetchMessages already handles the full list, but we can append locally
          // since syncHistory already updated setChatMessages if it was a full sync
          // or we can just call fetchMessages to be safe
          if (selectedLead?.id) fetchMessages(selectedLead.id);
        }}
      />

      {/* Response Integrated Modal */}
      <Dialog open={responseModalOpen} onOpenChange={setResponseModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Responder Lead</DialogTitle></DialogHeader>
          {selectedLead && (
            <div className="space-y-4">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
                <p className="text-sm font-semibold">{selectedLead.name || "Lead sem nome"}</p>
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center gap-2">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    {selectedLead.phone ? (
                      <span className="text-xs">{selectedLead.phone}</span>
                    ) : (
                      <Input
                        placeholder="Digite o WhatsApp (com DDD)"
                        className="h-8 text-xs"
                        value={form.phone}
                        onChange={e => setForm({ ...form, phone: e.target.value })}
                      />
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 uppercase font-bold text-[9px]"><ChevronRight className="h-3 w-3" /> {selectedLead.source}</span>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Sua Resposta</Label>
                <Textarea
                  value={responseText}
                  onChange={e => setResponseText(e.target.value)}
                  placeholder="Escreva sua mensagem aqui..."
                  className="min-h-[120px] text-sm focus:ring-primary shadow-inner"
                />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 h-11 gap-2 font-bold" onClick={sendResponse}>
                  <MessageCircle className="h-4 w-4" /> Enviar Mensagem
                </Button>
                <Button variant="outline" className="h-11" onClick={() => setResponseModalOpen(false)}>Cancelar</Button>
              </div>
              <p className="text-[10px] text-muted-foreground text-center">
                A extensão do navegador será usada para processar o envio automático.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Lead Modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Lead: {selectedLead?.name || "Lead sem nome"}</DialogTitle></DialogHeader>
          <form onSubmit={saveEditLead} className="space-y-3">
            <div className="space-y-1.5"><Label className="text-xs">Nome</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required className="h-10" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label className="text-xs">Telefone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="h-10" /></div>
              <div className="space-y-1.5"><Label className="text-xs">E-mail</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} type="email" className="h-10" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Origem</Label>
                <Select value={form.source} onValueChange={v => setForm({ ...form, source: v })}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="trafego_pago">Tráfego Pago</SelectItem>
                    <SelectItem value="indicacao">Indicação</SelectItem>
                    <SelectItem value="os_vendas">Importado (OS/Vendas)</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Responsável</Label>
                <Select value={form.assigned_to} onValueChange={v => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Atribuir a..." /></SelectTrigger>
                  <SelectContent>
                    {vendedores.map(v => <SelectItem key={v.user_id} value={v.user_id}>{v.display_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Loja</Label>
              <Select value={form.store_id || activeStoreId || ""} onValueChange={v => setForm({ ...form, store_id: v })} disabled={!!activeStoreId}>
                <SelectTrigger className="h-10"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs">Observações</Label><Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="min-h-[80px]" /></div>
            <Button type="submit" className="w-full h-11" disabled={loading}>{loading ? "Salvando..." : "Salvar Alterações"}</Button>
            <Button type="button" variant="outline" className="w-full h-11" onClick={() => {
              setEditModalOpen(false);
              handleResponse(selectedLead);
            }}>Pular para Responder</Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Chat History Modal (Restored) */}
      <Dialog open={chatModalOpen} onOpenChange={setChatModalOpen}>
        <DialogContent className="max-w-md h-[600px] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b bg-muted/30">
            <DialogTitle className="flex items-center justify-between w-full pr-6">
              <div className="flex items-center gap-2">
                {selectedLead?.source === 'whatsapp' ? <MessageCircle className="h-5 w-5 text-green-500" /> : <Instagram className="h-5 w-5 text-pink-500" />}
                Conversa com {selectedLead?.name || "Lead"}
              </div>
              <div className="flex items-center gap-2">
                {selectedLead?.source === 'instagram' && (
                  <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1" onClick={() => handleRefreshProfile(selectedLead)}>
                    <RefreshCw className="h-3 w-3" /> Sincronizar Perfil
                  </Button>
                )}
                <Button variant="outline" size="sm" className="h-7 text-[10px] gap-1 border-purple-500/30 text-purple-400 bg-purple-500/5 hover:bg-purple-500/10" onClick={() => handleAIQualify(selectedLead?.id)}>
                  <Shield className="h-3 w-3" /> Qualificar IA
                </Button>
                <Badge variant="outline" className="animate-pulse bg-green-500/10 text-green-500 border-green-500/20 text-[10px]">
                  LIVE SYNC
                </Badge>
              </div>
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 p-4 bg-muted/10">
            <div className="space-y-3 pb-4">
              {messagesLoading ? (
                <div className="flex flex-col items-center justify-center py-20 space-y-3">
                  <Clock className="h-6 w-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Carregando histórico...</p>
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Nenhuma mensagem capturada ainda. <br /> Use o botão "Enviar p/ CRM" na extensão para sincronizar ou o Instagram Webhook.
                </div>
              ) : (
                chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === 'vendedor' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm relative group ${msg.sender_type === 'vendedor'
                        ? 'bg-primary/20 text-foreground rounded-tr-none border border-primary/20'
                        : 'bg-muted border text-slate-700 rounded-tl-none'
                      }`}>
                      {msg.message_type === 'image' ? (
                        <div className="space-y-1">
                          <img src={msg.media_url} className="rounded-lg max-h-60 object-cover cursor-pointer hover:opacity-90" onClick={() => window.open(msg.media_url, '_blank')} />
                          {msg.content && <p>{msg.content}</p>}
                        </div>
                      ) : msg.message_type === 'audio' ? (
                        <div className="flex items-center gap-2 bg-black/5 p-2 rounded-lg min-w-[200px]">
                          <Mic className="h-4 w-4 text-primary" />
                          <audio controls src={msg.media_url} className="h-8 max-w-full" />
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.content}</p>
                      )}

                      <div className={`text-[8px] mt-1 opacity-60 flex items-center gap-1 ${msg.sender_type === 'vendedor' ? 'justify-end' : ''}`}>
                        {new Date(msg.created_at).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' })}
                        {msg.sender_type === 'vendedor' && <CheckCheck className="h-2.5 w-2.5 text-blue-500" />}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <footer className="p-3 border-t bg-muted/20">
            <div className="flex flex-col gap-2">
              {imageFile && (
                <div className="flex items-center gap-2 bg-primary/10 p-2 rounded-lg text-xs">
                  <ImageIcon className="h-4 w-4" />
                  <span className="truncate">{imageFile.name}</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={() => setImageFile(null)}><X className="h-3 w-3" /></Button>
                </div>
              )}
              {audioBlob && (
                <div className="flex items-center gap-2 bg-primary/10 p-2 rounded-lg text-xs">
                  <Mic className="h-4 w-4" />
                  <span>Áudio gravado pronto p/ envio</span>
                  <Button variant="ghost" size="icon" className="h-5 w-5 ml-auto" onClick={() => setAudioBlob(null)}><X className="h-3 w-3" /></Button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <input type="file" id="chat-img" className="hidden" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} />
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => document.getElementById('chat-img')?.click()}>
                  <Paperclip className="h-5 w-5" />
                </Button>

                <Input
                  placeholder="Escrava uma mensagem..."
                  value={responseText}
                  onChange={e => setResponseText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendResponse()}
                  className="flex-1"
                />

                <Button
                  variant={recording ? "destructive" : "ghost"}
                  size="icon"
                  className={`h-9 w-9 ${recording ? 'animate-pulse' : 'text-muted-foreground'}`}
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

                <Button
                  size="icon"
                  className="h-9 w-9"
                  disabled={loading || (!responseText.trim() && !imageFile && !audioBlob)}
                  onClick={sendResponse}
                >
                  {loading ? <Clock className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </footer>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leads;
