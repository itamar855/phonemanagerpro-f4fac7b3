-- Ponte para o replay do zero (Supabase Preview, banco local).
-- As fases 0B e 1A (schema private e a RPC pública da OS) foram aplicadas à
-- mão em produção e nunca entraram numa migration, mas a 20261015000000
-- (phase1b) e as seguintes já contam com elas. Definição copiada de produção
-- em 2026-11-26. Em produção não faz nada (tudo já existe lá).

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

DO $$
BEGIN
  IF to_regprocedure('public.get_public_service_order(uuid)') IS NOT NULL THEN
    RETURN;
  END IF;

  CREATE FUNCTION public.get_public_service_order(p_order_id uuid)
   RETURNS TABLE(order_number integer, status text, device_brand text, device_model text,
                 requested_service text, estimated_completion timestamp with time zone,
                 created_at timestamp with time zone, store_name text)
   LANGUAGE sql
   STABLE SECURITY DEFINER
   SET search_path TO ''
  AS $fn$
      SELECT
          so.order_number,
          so.status,
          so.device_brand,
          so.device_model,
          so.requested_service,
          so.estimated_completion,
          so.created_at,
          COALESCE(s.name, 'Assistência Técnica') AS store_name
      FROM public.service_orders so
      LEFT JOIN public.stores s ON so.store_id = s.id
      WHERE so.id = p_order_id;
  $fn$;

  ALTER FUNCTION public.get_public_service_order(uuid) OWNER TO postgres;
  REVOKE ALL ON FUNCTION public.get_public_service_order(uuid) FROM PUBLIC;
  GRANT EXECUTE ON FUNCTION public.get_public_service_order(uuid) TO anon, authenticated, service_role;
END $$;
