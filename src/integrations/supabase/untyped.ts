import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./client";

/**
 * O mesmo cliente do app, mas sem os tipos gerados.
 *
 * Use SÓ para tabelas que o código consulta e que não existem no banco de
 * produção (por isso não aparecem em types.ts): app_settings, debug_logs,
 * device_evaluations, error_logs, fiscal_settings e invoices. Hoje essas
 * consultas voltam com erro em produção e quem chama já trata isso (fallback
 * local ou erro ignorado). Quando a tabela for criada por migration e os tipos
 * forem regerados, troque `untypedDb` por `supabase`.
 *
 * Também serve para sondas que recebem o nome da tabela em tempo de execução
 * (checagem de saúde do banco), onde o tipo de cada tabela não importa.
 */
export const untypedDb = supabase as unknown as SupabaseClient;
