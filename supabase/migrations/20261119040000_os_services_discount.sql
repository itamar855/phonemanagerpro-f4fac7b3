-- ==============================================================================
-- OS: vários serviços executados (descrição + valor opcional) e desconto.
-- services_performed = [{ "description": text, "price": numeric|null }]
-- final_price continua sendo o valor cobrado (já com o desconto).
-- ==============================================================================

BEGIN;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS services_performed jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS discount_amount numeric(12,2) NOT NULL DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.service_orders
    ADD CONSTRAINT service_orders_services_performed_array CHECK (jsonb_typeof(services_performed) = 'array');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.service_orders
    ADD CONSTRAINT service_orders_discount_nonneg CHECK (discount_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.service_orders.services_performed IS
  'Serviços executados no aparelho: [{description, price}] (aparecem para o cliente no PDF).';
COMMENT ON COLUMN public.service_orders.discount_amount IS
  'Desconto dado no serviço (R$). final_price já é o valor cobrado com o desconto.';

-- O texto livre de antes vira a lista (uma linha = um serviço, sem valor)
UPDATE public.service_orders so
   SET services_performed = (
     SELECT COALESCE(jsonb_agg(jsonb_build_object('description', btrim(l), 'price', NULL) ORDER BY n), '[]'::jsonb)
       FROM regexp_split_to_table(so.service_performed, E'\\n') WITH ORDINALITY AS t(l, n)
      WHERE btrim(l) <> ''
   )
 WHERE coalesce(btrim(so.service_performed), '') <> ''
   AND so.services_performed = '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.get_public_os_extras(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'service_performed',  so.service_performed,
    'services_performed', so.services_performed,
    'discount_amount',    so.discount_amount,
    'device_condition',   so.device_condition,
    'device_is_off',      so.device_is_off,
    'entry_checklist',    so.entry_checklist,
    'exit_checklist',     so.exit_checklist,
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'name', COALESCE(p.name, 'Peça'),
               'brand', p.brand,
               'model', p.model,
               'quantity', i.quantity,
               'unit_price', i.unit_price
             ) ORDER BY i.created_at)
      FROM public.service_order_items i
      LEFT JOIN public.products p ON p.id = i.product_id
      WHERE i.service_order_id = so.id
    ), '[]'::jsonb)
  )
  FROM public.service_orders so
  WHERE so.id = p_order_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_os_extras(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_os_extras(uuid) TO anon, authenticated, service_role;

COMMIT;
