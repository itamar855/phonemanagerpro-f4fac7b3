-- ==============================================================================
-- OS: "Serviço executado" (texto que o técnico escreve ao concluir) e os dados
-- que faltavam no PDF do link público (checklists, condição física e peças com
-- o valor cobrado — nunca o custo nem o fornecedor).
-- ==============================================================================

BEGIN;

ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS service_performed text;

COMMENT ON COLUMN public.service_orders.service_performed IS
  'O que foi feito no aparelho (aparece para o cliente no PDF e no link da OS).';

-- Mesma regra de acesso de get_public_os_full_data: quem tem o id (uuid) da OS.
CREATE OR REPLACE FUNCTION public.get_public_os_extras(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'service_performed', so.service_performed,
    'device_condition',  so.device_condition,
    'device_is_off',     so.device_is_off,
    'entry_checklist',   so.entry_checklist,
    'exit_checklist',    so.exit_checklist,
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
