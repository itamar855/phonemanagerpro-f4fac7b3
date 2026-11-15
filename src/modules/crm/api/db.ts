// Única porta de entrada do módulo CRM para o Supabase.
// As tabelas crm_* não estão no types.ts gerado; o cast fica concentrado aqui.
import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const crmDb = supabase as any;

export const ALL_STORES = "all";

/** Aplica o filtro de loja (na visão "todas as lojas" a RLS já limita ao que o usuário pode ver). */
export function byStore<Q extends { eq: (col: string, v: unknown) => Q }>(query: Q, storeId: string | null | undefined): Q {
  return storeId && storeId !== ALL_STORES ? query.eq("store_id", storeId) : query;
}

/** Chama uma Edge Function e devolve a mensagem de erro do corpo, quando houver. */
export async function invokeFn<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let detail = error.message;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = await (error as any).context?.json?.();
      if (ctx?.error) detail = ctx.error;
    } catch {
      /* corpo não-JSON */
    }
    throw new Error(detail);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((data as any)?.error) throw new Error((data as any).error);
  return data as T;
}

export function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
