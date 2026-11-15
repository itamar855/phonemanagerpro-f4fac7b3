import { useState } from "react";
import { Loader2, Plus, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { createQuickReply, deleteQuickReply } from "../api/inbox";
import { WhatsAppChannelCard } from "../components/settings/WhatsAppChannelCard";
import { InstagramChannelCard } from "../components/settings/InstagramChannelCard";
import { AutomationSettingsCard } from "../components/settings/AutomationSettingsCard";
import { AiAgentSettings } from "../components/settings/AiAgentSettings";
import { EmptyState } from "../components/shared/EmptyState";
import { crmKeys, useCrmContext, useQuickReplies } from "../hooks/useInbox";

export default function SettingsPage() {
  const { storeId } = useCrmContext();
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl p-3 md:p-6">
        <Tabs defaultValue="canais">
          <TabsList className="h-auto w-full justify-start overflow-x-auto [scrollbar-width:none] sm:w-auto">
            <TabsTrigger value="canais">Canais</TabsTrigger>
            <TabsTrigger value="respostas">Respostas rápidas</TabsTrigger>
            <TabsTrigger value="automacoes">Automações</TabsTrigger>
            <TabsTrigger value="ia">Agente de IA</TabsTrigger>
          </TabsList>
          <TabsContent value="canais" className="space-y-4 pt-2">
            <WhatsAppChannelCard storeId={storeId} />
            <InstagramChannelCard storeId={storeId} />
          </TabsContent>
          <TabsContent value="respostas" className="pt-2">
            <QuickRepliesSettings />
          </TabsContent>
          <TabsContent value="automacoes" className="pt-2">
            <AutomationSettingsCard />
          </TabsContent>
          <TabsContent value="ia" className="pt-2">
            <AiAgentSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function QuickRepliesSettings() {
  const { storeId, writeStoreId, userId } = useCrmContext();
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuickReplies(storeId);
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const s = shortcut.trim().replace(/^\//, "").toLowerCase().replace(/\s+/g, "-");
    if (!s || !body.trim() || !writeStoreId || !userId) return;
    setSaving(true);
    try {
      await createQuickReply(writeStoreId, userId, s, body.trim());
      setShortcut(""); setBody("");
      qc.invalidateQueries({ queryKey: ["crm", "quick-replies"] });
      toast.success(`Resposta /${s} criada.`);
    } catch (err) {
      const msg = (err as Error).message;
      toast.error(msg.includes("duplicate") ? "Já existe um atalho com esse nome." : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor="qr-short">Atalho</Label>
            <Input id="qr-short" value={shortcut} onChange={(e) => setShortcut(e.target.value)} placeholder="/endereco" maxLength={30} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qr-body">Mensagem</Label>
            <Textarea id="qr-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Estamos na Rua…, aberto de segunda a sábado das 8h às 18h." required className="text-base md:text-sm" />
          </div>
        </div>
        <Button type="submit" size="sm" disabled={saving || !writeStoreId}>
          {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Adicionar
        </Button>
      </form>

      {isLoading ? null : data.length === 0 ? (
        <EmptyState icon={Zap} title="Nenhuma resposta rápida" description="Crie atalhos para mensagens que você manda sempre. Na conversa, digite / para usar." />
      ) : (
        <ul className="divide-y divide-border/50 rounded-xl border border-border/60 bg-card">
          {data.map((q) => (
            <li key={q.id} className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">/{q.shortcut}</p>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{q.body}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0"
                aria-label={`Excluir /${q.shortcut}`}
                onClick={async () => {
                  try { await deleteQuickReply(q.id); qc.invalidateQueries({ queryKey: crmKeys.quickReplies(storeId) }); }
                  catch (err) { toast.error((err as Error).message); }
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
