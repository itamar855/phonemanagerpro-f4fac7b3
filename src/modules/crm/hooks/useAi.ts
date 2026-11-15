import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAiSettings, listAiRuns, pendingSuggestion } from "../api/ai";

export const aiKeys = {
  settings: (storeId: string | null) => ["crm", "ai-settings", storeId] as const,
  suggestion: (conversationId: string) => ["crm", "ai-suggestion", conversationId] as const,
  runs: (storeId: string | null) => ["crm", "ai-runs", storeId] as const,
};

export function useAiSettings(storeId: string | null) {
  return useQuery({ queryKey: aiKeys.settings(storeId), queryFn: () => getAiSettings(storeId!), enabled: Boolean(storeId), staleTime: 60_000 });
}

export function useAiRuns(storeId: string | null) {
  return useQuery({ queryKey: aiKeys.runs(storeId), queryFn: () => listAiRuns(storeId), staleTime: 15_000 });
}

/** Sugestão pendente da IA na conversa aberta, atualizada em tempo real. */
export function useAiSuggestion(conversationId: string | undefined) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: aiKeys.suggestion(conversationId ?? ""),
    queryFn: () => pendingSuggestion(conversationId!),
    enabled: Boolean(conversationId),
    staleTime: 10_000,
  });
  useEffect(() => {
    if (!conversationId) return;
    const ch = supabase
      .channel(`crm-ai-sug-${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_ai_suggestions", filter: `conversation_id=eq.${conversationId}` }, () => {
        qc.invalidateQueries({ queryKey: aiKeys.suggestion(conversationId) });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [conversationId, qc]);
  return q;
}
