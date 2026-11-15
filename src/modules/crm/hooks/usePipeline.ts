import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dealActivities, listBoardDeals, listContactDeals, listPipelines, listStages, pipelineSummary } from "../api/pipeline";

export const pipelineKeys = {
  pipelines: (storeId: string | null) => ["crm", "pipelines", storeId] as const,
  stages: (pipelineId: string) => ["crm", "stages", pipelineId] as const,
  board: (pipelineId: string, ownerId: string | null) => ["crm", "board", pipelineId, ownerId] as const,
  summary: (pipelineId: string, ownerId: string | null) => ["crm", "board-summary", pipelineId, ownerId] as const,
  dealActivities: (dealId: string) => ["crm", "deal-activities", dealId] as const,
  contactDeals: (contactId: string) => ["crm", "contact-deals", contactId] as const,
};

export function usePipelines(storeId: string | null) {
  return useQuery({ queryKey: pipelineKeys.pipelines(storeId), queryFn: () => listPipelines(storeId), staleTime: 5 * 60_000 });
}

export function useStages(pipelineId: string | undefined) {
  return useQuery({ queryKey: pipelineKeys.stages(pipelineId ?? ""), queryFn: () => listStages(pipelineId!), enabled: Boolean(pipelineId), staleTime: 5 * 60_000 });
}

export function useBoardDeals(pipelineId: string | undefined, ownerId: string | null) {
  return useQuery({ queryKey: pipelineKeys.board(pipelineId ?? "", ownerId), queryFn: () => listBoardDeals(pipelineId!, ownerId), enabled: Boolean(pipelineId), staleTime: 15_000 });
}

export function usePipelineSummary(pipelineId: string | undefined, ownerId: string | null) {
  return useQuery({ queryKey: pipelineKeys.summary(pipelineId ?? "", ownerId), queryFn: () => pipelineSummary(pipelineId!, ownerId), enabled: Boolean(pipelineId), staleTime: 15_000 });
}

export function useDealActivities(dealId: string | undefined) {
  return useQuery({ queryKey: pipelineKeys.dealActivities(dealId ?? ""), queryFn: () => dealActivities(dealId!), enabled: Boolean(dealId) });
}

export function useContactDeals(contactId: string | undefined) {
  return useQuery({ queryKey: pipelineKeys.contactDeals(contactId ?? ""), queryFn: () => listContactDeals(contactId!), enabled: Boolean(contactId), staleTime: 15_000 });
}

/** Recarrega quadro e totais quando outra pessoa mexe nos negócios da loja. */
export function useDealsRealtime(storeId: string | null) {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const ch = supabase
      .channel(`crm-deals-${storeId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_deals", ...(storeId ? { filter: `store_id=eq.${storeId}` } : {}) }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          qc.invalidateQueries({ queryKey: ["crm", "board"] });
          qc.invalidateQueries({ queryKey: ["crm", "board-summary"] });
          qc.invalidateQueries({ queryKey: ["crm", "contact-deals"] });
        }, 500);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(ch);
    };
  }, [qc, storeId]);
}

/** Invalida tudo que depende de negócios (após criar/editar/mover). */
export function useInvalidateDeals() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["crm", "board"] });
    qc.invalidateQueries({ queryKey: ["crm", "board-summary"] });
    qc.invalidateQueries({ queryKey: ["crm", "contact-deals"] });
    qc.invalidateQueries({ queryKey: ["crm", "deal-activities"] });
  };
}
