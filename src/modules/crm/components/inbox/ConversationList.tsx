import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Inbox, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ChannelTab, ConversationQuery, InboxFilter } from "../../api/inbox";
import { useConversations, useInboxCounts } from "../../hooks/useInbox";
import { formatPhone } from "../../lib/phone";
import { shortTime } from "../../lib/format";
import type { CrmConversationWithContact } from "../../lib/types";
import { EmptyState } from "../shared/EmptyState";
import { ContactAvatar } from "../shared/ContactAvatar";

const FILTERS: { value: InboxFilter; label: string }[] = [
  { value: "open", label: "Abertas" },
  { value: "mine", label: "Minhas" },
  { value: "unassigned", label: "Sem responsável" },
  { value: "ai", label: "IA atendendo" },
  { value: "resolved", label: "Resolvidas" },
];

interface Props {
  storeId: string | null;
  userId: string | null;
  selectedId?: string;
  onSelect: (id: string) => void;
  channel: ChannelTab;
  onChannelChange: (c: ChannelTab) => void;
  filter: InboxFilter;
  onFilterChange: (f: InboxFilter) => void;
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function ConversationList({ storeId, userId, selectedId, onSelect, channel, onChannelChange, filter, onFilterChange }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput);
  const query: ConversationQuery = useMemo(() => ({ storeId, channel, filter, search, userId }), [storeId, channel, filter, search, userId]);
  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useConversations(query);
  const { data: counts } = useInboxCounts(storeId);
  const items = useMemo(() => data?.pages.flat() ?? [], [data]);

  // carrega mais ao chegar no fim da lista
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const tabs: { value: ChannelTab; label: string; total?: number; unread?: number }[] = [
    { value: "all", label: "Todas", total: counts?.all, unread: counts?.unread_all },
    { value: "instagram", label: "Instagram", total: counts?.instagram, unread: counts?.unread_instagram },
    { value: "whatsapp", label: "WhatsApp", total: counts?.whatsapp, unread: counts?.unread_whatsapp },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-border/50 p-3">
        <div role="tablist" aria-label="Canal" className="grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
          {tabs.map((t) => (
            <button
              key={t.value}
              role="tab"
              aria-selected={channel === t.value}
              onClick={() => onChannelChange(t.value)}
              className={cn(
                "flex min-h-[36px] items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                channel === t.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {Boolean(t.unread) && (
                <span className="min-w-[18px] rounded-full bg-primary px-1 text-[10px] font-semibold leading-[18px] text-primary-foreground">
                  {t.unread}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar nome, @ ou telefone"
              aria-label="Buscar conversas"
              className="h-9 pl-8 pr-8"
            />
            {searchInput && (
              <button
                onClick={() => setSearchInput("")}
                aria-label="Limpar busca"
                className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select value={filter} onValueChange={(v) => onFilterChange(v as InboxFilter)}>
            <SelectTrigger className="h-9 w-[150px]" aria-label="Filtrar conversas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                  {f.value === "mine" && counts?.mine ? ` (${counts.mine})` : ""}
                  {f.value === "unassigned" && counts?.unassigned ? ` (${counts.unassigned})` : ""}
                  {f.value === "ai" && counts?.ai ? ` (${counts.ai})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto" aria-label="Conversas" aria-busy={isLoading}>
        {isLoading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-3 py-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        {isError && <EmptyState icon={Inbox} title="Não foi possível carregar" description={(error as Error)?.message} />}
        {!isLoading && !isError && items.length === 0 && (
          <EmptyState
            icon={Inbox}
            title={search ? "Nada encontrado" : filter === "resolved" ? "Nenhuma conversa resolvida" : "Nenhuma conversa aberta"}
            description={search ? "Tente outro nome ou número." : "Quando alguém mandar mensagem, ela aparece aqui."}
          />
        )}
        {items.map((c) => (
          <ConversationRow key={c.id} c={c} selected={c.id === selectedId} onSelect={onSelect} />
        ))}
        <div ref={sentinel} />
        {isFetchingNextPage && (
          <div className="flex justify-center py-3" role="status" aria-label="Carregando mais">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

function ConversationRow({ c, selected, onSelect }: { c: CrmConversationWithContact; selected: boolean; onSelect: (id: string) => void }) {
  const unread = c.unread_count > 0;
  const subtitle = c.channel === "instagram" && c.contact.instagram_username ? `@${c.contact.instagram_username}` : formatPhone(c.contact.phone);
  return (
    <button
      onClick={() => onSelect(c.id)}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "flex w-full items-start gap-3 border-b border-border/30 px-3 py-3 text-left transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        selected ? "bg-primary/10" : "hover:bg-muted/40",
      )}
    >
      <ContactAvatar name={c.contact.name} avatarUrl={c.contact.avatar_url} channel={c.channel} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold text-foreground" : "font-medium text-foreground/90")}>
            {c.contact.name}
          </span>
          <span className={cn("shrink-0 text-[11px] tabular-nums", unread ? "font-semibold text-primary" : "text-muted-foreground")}>
            {shortTime(c.last_message_at)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={cn("truncate text-xs", unread ? "text-foreground/80" : "text-muted-foreground")}>
            {c.last_message_direction === "out" && <span className="text-muted-foreground">Você: </span>}
            {c.last_message_preview || subtitle}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {c.handler === "ai" && <Bot className="h-3.5 w-3.5 text-violet-500" aria-label="IA atendendo" />}
            {unread && (
              <span className="min-w-[20px] rounded-full bg-primary px-1.5 text-center text-[11px] font-semibold leading-5 text-primary-foreground">
                {c.unread_count > 99 ? "99+" : c.unread_count}
              </span>
            )}
          </div>
        </div>
        {c.contact.origin_channel === "instagram" && c.channel === "whatsapp" && (
          <span className="mt-1 inline-flex items-center gap-1 rounded bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-medium text-pink-600 dark:text-pink-400">
            Veio do Instagram
          </span>
        )}
      </div>
    </button>
  );
}
