import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { crmDb } from "../api/db";
import { ALL, toCrmStores, validFilter, type CrmStore } from "../lib/stores";

/** Lojas (todas: quem tem CRM atende as duas). Nome curto + cor fixa. */
export function useCrmStores() {
  const q = useQuery({
    queryKey: ["crm", "stores"],
    queryFn: async () => {
      const { data, error } = await crmDb.from("stores").select("id, name");
      if (error) throw error;
      return toCrmStores((data ?? []) as { id: string; name: string | null }[]);
    },
    staleTime: 30 * 60_000,
  });
  const stores: CrmStore[] = q.data ?? [];
  const byId = new Map(stores.map((s) => [s.id, s]));
  return { stores, byId, multi: stores.length > 1, loading: q.isLoading };
}

// Filtro de loja do CRM, separado do seletor geral do sistema (lá o funcionário fica preso na loja dele).
const KEY = "crm-store-filter";
const listeners = new Set<() => void>();

function read(): string {
  try { return localStorage.getItem(KEY) || ALL; } catch { return ALL; }
}

export function setCrmStoreFilter(value: string) {
  try { localStorage.setItem(KEY, value); } catch { /* sem armazenamento: vale só nesta aba */ }
  memo = value;
  listeners.forEach((l) => l());
}

let memo: string | null = null;
const snapshot = () => (memo ??= read());
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** "all" ou o id da loja escolhida no CRM. */
export function useCrmStoreFilter(stores: CrmStore[]): string {
  const raw = useSyncExternalStore(subscribe, snapshot, () => ALL);
  // enquanto as lojas carregam, confia no salvo; depois descarta loja que não existe mais
  return stores.length ? validFilter(raw, stores) : raw;
}
