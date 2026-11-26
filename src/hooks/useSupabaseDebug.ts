import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import debugLogger from "@/utils/debugLogger";

// ============================================================
// CellManagerPro — useSupabaseDebug Hook
// Intercepta queries Supabase e loga automaticamente.
// Ativado em desenvolvimento; silencioso em produção.
// ============================================================

const SLOW_QUERY_THRESHOLD_MS = 2000;

type SupabaseOperation = "select" | "insert" | "update" | "delete" | "upsert" | "rpc";

interface QueryLog {
  table: string;
  operation: SupabaseOperation;
  durationMs: number;
  rowCount?: number;
  error?: string;
}

// Armazena métricas de queries para análise
const queryMetrics: QueryLog[] = [];
const MAX_METRICS = 100;

/**
 * Hook que monitora e loga queries Supabase automaticamente.
 * 
 * Uso:
 * ```tsx
 * const MyComponent = () => {
 *   useSupabaseDebug(); // Ativa o monitoramento
 *   // ... resto do componente
 * };
 * ```
 */
export function useSupabaseDebug() {
  const isInitialized = useRef(false);

  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    debugLogger.info("Supabase Debug Monitor initialized", {
      url: import.meta.env.VITE_SUPABASE_URL,
      projectId: import.meta.env.VITE_SUPABASE_PROJECT_ID,
    });

    // Verificar conexão inicial
    checkConnection();
  }, []);
}

/**
 * Wrapper para queries Supabase com logging automático.
 * 
 * Uso:
 * ```tsx
 * const { data, error } = await trackedQuery(
 *   "products",
 *   "select",
 *   () => supabase.from("products").select("*")
 * );
 * ```
 */
export async function trackedQuery<T, E extends { message?: string; code?: string } | null = { message?: string; code?: string } | null>(
  table: string,
  operation: SupabaseOperation,
  queryFn: () => PromiseLike<{ data: T; error: E }>
): Promise<{ data: T; error: E }> {
  const start = performance.now();

  try {
    const result = await queryFn();
    const durationMs = Math.round(performance.now() - start);

    const log: QueryLog = {
      table,
      operation,
      durationMs,
      rowCount: Array.isArray(result.data) ? result.data.length : undefined,
      error: result.error?.message,
    };

    // Salvar métrica
    queryMetrics.push(log);
    if (queryMetrics.length > MAX_METRICS) queryMetrics.shift();

    // Log de acordo com resultado
    if (result.error) {
      debugLogger.error(`Query falhou: ${operation.toUpperCase()} ${table}`, {
        error: result.error.message,
        code: result.error.code,
        durationMs,
      });
    } else if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
      debugLogger.warn(`Query lenta: ${operation.toUpperCase()} ${table}`, {
        durationMs,
        rowCount: log.rowCount,
        threshold: SLOW_QUERY_THRESHOLD_MS,
      });
    } else if (import.meta.env.DEV) {
      debugLogger.debug(`${operation.toUpperCase()} ${table}`, {
        durationMs,
        rowCount: log.rowCount,
      });
    }

    return result;
  } catch (e) {
    const durationMs = Math.round(performance.now() - start);
    debugLogger.error(`Query exception: ${operation.toUpperCase()} ${table}`, {
      exception: e.message,
      durationMs,
    }, e);
    throw e;
  }
}

/**
 * Verifica a conexão com o Supabase e loga o resultado.
 */
async function checkConnection() {
  const start = performance.now();
  try {
    const { error } = await supabase.from("stores").select("id", { count: "exact", head: true });
    const ms = Math.round(performance.now() - start);
    if (error) {
      debugLogger.warn("Supabase connection check: error", { error: error.message, ms });
    } else {
      debugLogger.info("Supabase connection check: OK", { ms });
    }
  } catch (e) {
    debugLogger.error("Supabase connection check: FAILED", { error: e.message }, e);
  }
}

/**
 * Retorna métricas de queries coletadas.
 */
export function getQueryMetrics(): QueryLog[] {
  return [...queryMetrics];
}

/**
 * Retorna estatísticas resumidas das queries.
 */
export function getQueryStats() {
  if (queryMetrics.length === 0) return null;

  const avgDuration = queryMetrics.reduce((sum, q) => sum + q.durationMs, 0) / queryMetrics.length;
  const slowQueries = queryMetrics.filter(q => q.durationMs > SLOW_QUERY_THRESHOLD_MS);
  const failedQueries = queryMetrics.filter(q => q.error);

  const byTable: Record<string, number> = {};
  queryMetrics.forEach(q => { byTable[q.table] = (byTable[q.table] || 0) + 1; });

  return {
    totalQueries: queryMetrics.length,
    avgDurationMs: Math.round(avgDuration),
    slowQueries: slowQueries.length,
    failedQueries: failedQueries.length,
    byTable,
  };
}

export default useSupabaseDebug;
