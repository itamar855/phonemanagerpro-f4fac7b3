import { createContext, useContext } from "react";

export interface TrocaCtx {
  storeId: string;
  storeLabel: string;
  isManager: boolean;
  userId: string | null;
}

export const TrocaContext = createContext<TrocaCtx | null>(null);

export function useTrocaContext(): TrocaCtx {
  const ctx = useContext(TrocaContext);
  if (!ctx) throw new Error("useTrocaContext fora do módulo de troca");
  return ctx;
}
