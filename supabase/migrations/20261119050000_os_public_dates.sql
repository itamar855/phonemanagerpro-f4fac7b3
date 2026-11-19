-- ==============================================================================
-- PDF público da OS: datas (previsão, conclusão, entrega) e garantia, além do
-- checklist e dos serviços que já vinham.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_public_os_extras(p_order_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'service_performed',    so.service_performed,
    'services_performed',   so.services_performed,
    'discount_amount',      so.discount_amount,
    'device_condition',     so.device_condition,
    'device_is_off',        so.device_is_off,
    'entry_checklist',      so.entry_checklist,
    'exit_checklist',       so.exit_checklist,
    'estimated_completion', so.estimated_completion,
    'completed_at',         so.completed_at,
    'delivered_at',         so.delivered_at,
    'warranty_end_date',    so.warranty_end_date,
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
