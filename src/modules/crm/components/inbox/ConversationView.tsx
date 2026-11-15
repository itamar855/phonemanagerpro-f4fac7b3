import { Fragment, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { ArrowLeft, CheckCircle2, Loader2, MessageSquareDashed, PanelRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { addNote, logActivity, sendMessage, updateConversation, uploadMedia } from "../../api/inbox";
import { crmKeys, useConversation, useMessages, useQuickReplies, useTeam } from "../../hooks/useInbox";
import { dayLabel } from "../../lib/format";
import { formatPhone } from "../../lib/phone";
import type { CrmMessage } from "../../lib/types";
import { CHANNEL_LABEL } from "../../lib/constants";
import { ContactAvatar } from "../shared/ContactAvatar";
import { EmptyState } from "../shared/EmptyState";
import { Composer, type ComposerMode } from "./Composer";
import { MessageBubble } from "./MessageBubble";

const IG_WINDOW_MS = 24 * 60 * 60 * 1000;
const UNASSIGNED = "__none__";

interface Props {
  conversationId: string;
  userId: string | null;
  onBack: () => void;
  onToggleDetails: () => void;
  detailsOpen: boolean;
}

export function ConversationView({ conversationId, userId, onBack, onToggleDetails, detailsOpen }: Props) {
  const qc = useQueryClient();
  // rascunho vindo de uma tarefa ("Abrir conversa" com mensagem sugerida)
  const location = useLocation();
  const draft = (location.state as { draft?: string } | null)?.draft;
  const { data: conv, isLoading: convLoading } = useConversation(conversationId);
  const messagesQ = useMessages(conversationId);
  const { data: team = [] } = useTeam(conv?.store_id ?? null);
  const { data: quickReplies = [] } = useQuickReplies(conv?.store_id ?? null);
  const names = useMemo(() => new Map(team.map((t) => [t.user_id, t.display_name])), [team]);

  // páginas: [0] = mais recente; exibe da mais antiga para a mais nova
  const messages = useMemo(() => (messagesQ.data ? [...messagesQ.data.pages].reverse().flat() : []), [messagesQ.data]);

  // marcar como lida ao abrir / ao chegar mensagem com a conversa aberta
  useEffect(() => {
    if (!conv || conv.unread_count === 0) return;
    updateConversation(conv.id, { unread_count: 0 })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["crm", "counts"] });
        qc.invalidateQueries({ queryKey: ["crm", "conversations"] });
      })
      .catch(() => { /* sem permissão ou offline: fica como não lida */ });
  }, [conv, qc]);

  // rolagem: vai para o fim ao abrir e quando chega mensagem nova perto do fim
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;
  const firstLoad = useRef(true);
  useEffect(() => { firstLoad.current = true; }, [conversationId]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || !lastId) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
    if (firstLoad.current || nearBottom) {
      el.scrollTop = el.scrollHeight;
      firstLoad.current = false;
    }
  }, [lastId]);

  if (convLoading) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="ml-auto h-12 w-1/2" />
      </div>
    );
  }
  if (!conv) return <EmptyState icon={MessageSquareDashed} title="Conversa não encontrada" />;

  const igWindowClosed =
    conv.channel === "instagram" && (!conv.last_inbound_at || Date.now() - new Date(conv.last_inbound_at).getTime() > IG_WINDOW_MS);
  const disabledReason = conv.contact.ignored
    ? "Contato marcado como \"não é cliente\"."
    : igWindowClosed
      ? "A janela de 24 h do Instagram fechou. Você poderá responder quando o cliente escrever de novo."
      : null;

  const resolved = conv.status === "resolved";
  const subtitle = conv.channel === "instagram" && conv.contact.instagram_username
    ? `@${conv.contact.instagram_username}`
    : formatPhone(conv.contact.phone);

  async function setStatus(status: "open" | "resolved") {
    try {
      await updateConversation(conv!.id, { status });
      if (userId) void logActivity({ storeId: conv!.store_id, userId, contactId: conv!.contact_id, conversationId: conv!.id, type: status === "resolved" ? "conversation_resolved" : "conversation_reopened" });
      qc.invalidateQueries({ queryKey: crmKeys.conversation(conv!.id) });
      qc.invalidateQueries({ queryKey: ["crm", "conversations"] });
      qc.invalidateQueries({ queryKey: ["crm", "counts"] });
      toast.success(status === "resolved" ? "Conversa resolvida." : "Conversa reaberta.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function assign(value: string) {
    const assigned_to = value === UNASSIGNED ? null : value;
    try {
      await updateConversation(conv!.id, { assigned_to });
      if (userId) void logActivity({ storeId: conv!.store_id, userId, contactId: conv!.contact_id, conversationId: conv!.id, type: "conversation_assigned", payload: { assigned_to } });
      qc.invalidateQueries({ queryKey: crmKeys.conversation(conv!.id) });
      qc.invalidateQueries({ queryKey: ["crm", "conversations"] });
      qc.invalidateQueries({ queryKey: ["crm", "counts"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function handleSend({ mode, text, file }: { mode: ComposerMode; text: string; file: File | null }) {
    if (mode === "note") {
      if (!userId) throw new Error("Sessão expirada.");
      const note = await addNote({ storeId: conv!.store_id, conversationId: conv!.id, contactId: conv!.contact_id, userId, body: text });
      qc.setQueryData(crmKeys.messages(conv!.id), (d: { pages: CrmMessage[][]; pageParams: unknown[] } | undefined) =>
        d ? { ...d, pages: [[...d.pages[0], note], ...d.pages.slice(1)] } : d,
      );
      return;
    }
    let res;
    if (file) {
      const up = await uploadMedia(conv!.store_id, file);
      res = await sendMessage({ conversationId: conv!.id, kind: file.type.startsWith("image/") ? "image" : "document", body: text, mediaPath: up.path, mime: up.mime });
    } else {
      res = await sendMessage({ conversationId: conv!.id, kind: "text", body: text });
    }
    if (res.warning) toast.warning(res.warning);
    qc.invalidateQueries({ queryKey: crmKeys.messages(conv!.id) });
    qc.invalidateQueries({ queryKey: crmKeys.conversation(conv!.id) });
    qc.invalidateQueries({ queryKey: ["crm", "conversations"] });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border/50 px-2 py-2 md:px-4">
        <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0 md:hidden" onClick={onBack} aria-label="Voltar para a lista">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <ContactAvatar name={conv.contact.name} avatarUrl={conv.contact.avatar_url} channel={conv.channel} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{conv.contact.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {CHANNEL_LABEL[conv.channel]} · {subtitle}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Select value={conv.assigned_to ?? UNASSIGNED} onValueChange={assign}>
            <SelectTrigger className="hidden h-9 w-[160px] sm:flex" aria-label="Responsável">
              <SelectValue placeholder="Responsável" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={UNASSIGNED}>Sem responsável</SelectItem>
              {team.map((t) => (
                <SelectItem key={t.user_id} value={t.user_id}>
                  {t.display_name}{t.user_id === userId ? " (você)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {resolved ? (
            <Button variant="outline" size="sm" className="h-9" onClick={() => setStatus("open")}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Reabrir
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-9" onClick={() => setStatus("resolved")}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Resolver</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-9 w-9", detailsOpen && "bg-muted")}
            onClick={onToggleDetails}
            aria-label="Detalhes do contato"
            aria-pressed={detailsOpen}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-3 md:px-6" aria-live="polite" aria-relevant="additions">
        {messagesQ.hasNextPage && (
          <div className="flex justify-center pb-2">
            <Button variant="ghost" size="sm" onClick={() => messagesQ.fetchNextPage()} disabled={messagesQ.isFetchingNextPage}>
              {messagesQ.isFetchingNextPage ? <Loader2 className="h-4 w-4 animate-spin" /> : "Carregar mensagens anteriores"}
            </Button>
          </div>
        )}
        {messagesQ.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="ml-auto h-10 w-1/2" />
            <Skeleton className="h-16 w-3/5" />
          </div>
        )}
        {!messagesQ.isLoading && messages.length === 0 && (
          <EmptyState icon={MessageSquareDashed} title="Sem mensagens ainda" description="Envie a primeira mensagem abaixo." />
        )}
        {messages.map((m, i) => {
          const showDay = i === 0 || dayLabel(messages[i - 1].created_at) !== dayLabel(m.created_at);
          return (
            <Fragment key={m.id}>
              {showDay && (
                <div className="sticky top-0 z-10 flex justify-center py-1">
                  <span className="rounded-full border border-border/50 bg-card/90 px-3 py-0.5 text-[11px] font-medium text-muted-foreground backdrop-blur">
                    {dayLabel(m.created_at)}
                  </span>
                </div>
              )}
              <MessageBubble m={m} authorName={m.sender_user_id ? names.get(m.sender_user_id) : undefined} />
            </Fragment>
          );
        })}
      </div>

      <Composer
        key={`${conversationId}:${draft ?? ""}`}
        channel={conv.channel}
        disabledReason={disabledReason}
        quickReplies={quickReplies}
        onSend={handleSend}
        initialText={draft}
      />
    </div>
  );
}
