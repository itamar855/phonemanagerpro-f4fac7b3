import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchEvaluations, fetchModels, fetchNames, fetchRules, fetchSettings, fetchStores } from "../api/db";

/** "Restaura Phone Brasil (Santa Luzia)" → "Santa Luzia" */
export function storeLabel(name: string): string {
  const inside = name.match(/\(([^)]+)\)\s*$/);
  return (inside?.[1] ?? name).trim() || "Loja";
}

const KEY = "troca-store";
const readSaved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/**
 * Loja do simulador: a loja ativa do sistema; na visão "todas as lojas" (admin) usa a última
 * escolhida aqui. Cada loja tem a sua tabela de preços.
 */
export function useTrocaStore() {
  const { userRole, userStoreIds, activeStoreId } = useAuth();
  const q = useQuery({ queryKey: ["troca", "stores"], queryFn: fetchStores, staleTime: 30 * 60_000 });
  const stores = useMemo(() => {
    const all = (q.data ?? []).map((s) => ({ ...s, label: storeLabel(s.name) }));
    return userRole === "admin" ? all : all.filter((s) => userStoreIds.includes(s.id));
  }, [q.data, userRole, userStoreIds]);

  const [picked, setPicked] = useState<string | null>(readSaved);
  const valid = (id: string | null) => !!id && stores.some((s) => s.id === id);
  const storeId = valid(picked) ? picked : valid(activeStoreId) ? activeStoreId : stores[0]?.id ?? null;

  // trocou a loja no seletor geral do app → acompanha
  useEffect(() => {
    if (valid(activeStoreId)) setPicked(activeStoreId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStoreId]);

  const pick = (id: string) => {
    setPicked(id);
    try { localStorage.setItem(KEY, id); } catch { /* sem armazenamento: vale só nesta aba */ }
  };
  return { stores, storeId, pick, loading: q.isLoading };
}

export function useSettings(storeId: string | null) {
  return useQuery({
    queryKey: ["troca", "settings", storeId],
    queryFn: () => fetchSettings(storeId!),
    enabled: !!storeId,
    staleTime: 5 * 60_000,
  });
}

export function useModels(storeId: string | null) {
  return useQuery({
    queryKey: ["troca", "models", storeId],
    queryFn: () => fetchModels(storeId!),
    enabled: !!storeId,
    staleTime: 5 * 60_000,
  });
}

export function useRules(storeId: string | null) {
  return useQuery({
    queryKey: ["troca", "rules", storeId],
    queryFn: () => fetchRules(storeId!),
    enabled: !!storeId,
    staleTime: 5 * 60_000,
  });
}

export function useEvaluations(storeId: string | null) {
  return useQuery({
    queryKey: ["troca", "evaluations", storeId],
    queryFn: async () => {
      const list = await fetchEvaluations(storeId!);
      const names = await fetchNames(list.map((e) => e.created_by ?? ""));
      return { list, names };
    },
    enabled: !!storeId,
  });
}

export function useInvalidateTroca() {
  const qc = useQueryClient();
  return (what: "settings" | "models" | "rules" | "evaluations") => qc.invalidateQueries({ queryKey: ["troca", what] });
}
