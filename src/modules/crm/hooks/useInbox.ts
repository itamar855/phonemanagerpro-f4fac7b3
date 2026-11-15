import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  PAGE_SIZE, getConversation, inboxCounts, listConversations, listMessages, listQuickReplies, listTeam,
  type ConversationQuery,
} from "../api/inbox";
import type { CrmMessage } from "../lib/types";

export const crmKeys = {
  all: ["crm"] as const,
  conversations: (q: ConversationQuery) => ["crm", "conversations", q] as const,
  conversation: (id: string) => ["crm", "conversation", id] as const,
  counts: (storeId: string | null) => ["crm", "counts", storeId] as const,
  messages: (conversationId: string) => ["crm", "messages", conversationId] as const,
  team: (storeId: string | null) => ["crm", "team", storeId] as const,
  quickReplies: (storeId: string | null) => ["crm", "quick-replies", storeId] as const,
  contact: (id: string) => ["crm", "contact", id] as const,
  channel: (storeId: string | null) => ["crm", "channel", storeId] as const,
};

/** Loja ativa e usuário, no formato que o CRM usa. */
export function useCrmContext() {
  const { activeStoreId, user, userRole, userStoreIds } = useAuth();
  const storeId = activeStoreId && activeStoreId !== "all" ? activeStoreId : null;
  // Loja para criar coisas novas: a ativa ou, na visão "todas", a primeira do usuário
  const writeStoreId = storeId ?? userStoreIds[0] ?? null;
  return { storeId, writeStoreId, userId: user?.id ?? null, userRole };
}

export function useConversations(q: ConversationQuery) {
  return useInfiniteQuery({
    queryKey: crmKeys.conversations(q),
    queryFn: ({ pageParam }) => listConversations(q, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.length < PAGE_SIZE ? undefined : last[last.length - 1]?.last_message_at ?? undefined),
    staleTime: 15_000,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: crmKeys.conversation(id ?? ""),
    queryFn: () => getConversation(id!),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useInboxCounts(storeId: string | null) {
  return useQuery({ queryKey: crmKeys.counts(storeId), queryFn: () => inboxCounts(storeId), staleTime: 15_000 });
}

export function useMessages(conversationId: string | undefined) {
  return useInfiniteQuery({
    queryKey: crmKeys.messages(conversationId ?? ""),
    queryFn: ({ pageParam }) => listMessages(conversationId!, pageParam),
    initialPageParam: null as string | null,
    // páginas vêm em ordem cronológica; a próxima é a mais antiga
    getNextPageParam: (first) => (first.length < PAGE_SIZE ? undefined : first[0]?.created_at ?? undefined),
    enabled: Boolean(conversationId),
    staleTime: 30_000,
  });
}

export function useTeam(storeId: string | null) {
  return useQuery({ queryKey: crmKeys.team(storeId), queryFn: () => listTeam(storeId), staleTime: 5 * 60_000 });
}

export function useQuickReplies(storeId: string | null) {
  return useQuery({ queryKey: crmKeys.quickReplies(storeId), queryFn: () => listQuickReplies(storeId), staleTime: 5 * 60_000 });
}

type MessagesData = InfiniteData<CrmMessage[], string | null>;

/** Insere/atualiza uma mensagem no cache da conversa (evita refazer a consulta). */
export function upsertMessageInCache(data: MessagesData | undefined, msg: CrmMessage): MessagesData | undefined {
  if (!data) return data;
  let found = false;
  const pages = data.pages.map((page) =>
    page.map((m) => {
      if (m.id === msg.id) { found = true; return { ...m, ...msg }; }
      return m;
    }),
  );
  if (!found) {
    // a primeira página (pages[0]) é a mais recente
    pages[0] = [...pages[0], msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
  }
  return { ...data, pages };
}

/**
 * Tempo real só enquanto o CRM está aberto: lista filtrada pela loja e
 * mensagens só da conversa aberta. Atualiza o cache pontualmente.
 */
export function useCrmRealtime(storeId: string | null, openConversationId: string | undefined) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refreshLists = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["crm", "conversations"] });
        qc.invalidateQueries({ queryKey: ["crm", "counts"] });
      }, 400);
    };
    const channel = supabase
      .channel(`crm-inbox-${storeId ?? "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_conversations", ...(storeId ? { filter: `store_id=eq.${storeId}` } : {}) },
        (payload) => {
          refreshLists();
          const row = payload.new as { id?: string } | undefined;
          if (row?.id) qc.invalidateQueries({ queryKey: crmKeys.conversation(row.id) });
        },
      )
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [qc, storeId]);

  useEffect(() => {
    if (!openConversationId) return;
    const channel = supabase
      .channel(`crm-messages-${openConversationId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crm_messages", filter: `conversation_id=eq.${openConversationId}` },
        (payload) => {
          const msg = payload.new as CrmMessage;
          if (!msg?.id) return;
          qc.setQueryData<MessagesData>(crmKeys.messages(openConversationId), (d) => upsertMessageInCache(d, msg));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, openConversationId]);
}
