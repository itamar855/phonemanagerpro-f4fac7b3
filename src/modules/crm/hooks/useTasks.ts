import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getAutomationSettings, listEntityTasks, listTasks, taskCounts, type TaskScope } from "../api/tasks";

export const taskKeys = {
  list: (storeId: string | null, userId: string | null, scope: TaskScope, done: boolean) => ["crm", "tasks", "list", storeId, userId, scope, done] as const,
  entity: (contactId?: string, dealId?: string) => ["crm", "tasks", "entity", contactId ?? null, dealId ?? null] as const,
  counts: (storeId: string | null) => ["crm", "task-counts", storeId] as const,
  automation: (storeId: string | null) => ["crm", "automation-settings", storeId] as const,
};

export function useTasks(storeId: string | null, userId: string | null, scope: TaskScope, done: boolean) {
  return useQuery({
    queryKey: taskKeys.list(storeId, userId, scope, done),
    queryFn: () => listTasks({ storeId, userId, scope, done }),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useEntityTasks(args: { contactId?: string; dealId?: string }) {
  return useQuery({
    queryKey: taskKeys.entity(args.contactId, args.dealId),
    queryFn: () => listEntityTasks(args),
    enabled: Boolean(args.contactId || args.dealId),
    staleTime: 15_000,
  });
}

/** Badge do menu: 1 RPC, cache de 60 s. */
export function useTaskCounts(storeId: string | null) {
  return useQuery({ queryKey: taskKeys.counts(storeId), queryFn: () => taskCounts(storeId), staleTime: 60_000, refetchInterval: 5 * 60_000 });
}

export function useAutomationSettings(storeId: string | null) {
  return useQuery({ queryKey: taskKeys.automation(storeId), queryFn: () => getAutomationSettings(storeId!), enabled: Boolean(storeId) });
}

export function useInvalidateTasks() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["crm", "tasks"] });
    qc.invalidateQueries({ queryKey: ["crm", "task-counts"] });
  };
}

/** Atualiza listas e contadores quando alguém (ou a automação) mexe nas tarefas. */
export function useTasksRealtime(storeId: string | null) {
  const invalidate = useInvalidateTasks();
  const ref = useRef(invalidate);
  ref.current = invalidate;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const ch = supabase
      .channel(`crm-tasks-${storeId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "crm_tasks", ...(storeId ? { filter: `store_id=eq.${storeId}` } : {}) }, () => {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => ref.current(), 500);
      })
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(ch);
    };
  }, [storeId]);
}
