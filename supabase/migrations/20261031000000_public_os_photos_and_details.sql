-- ==============================================================================
-- MIGRATION: RPCs PÚBLICAS PARA RASTREIO DE OS PELO CLIENTE (FOTOS E DADOS DO PDF)
-- Timestamp: 20261031000000
-- Projeto: CellManagerPro / phonemanagerpro
-- ==============================================================================

BEGIN;

-- 1. RPC para fotos públicas anexadas à OS (defeito, reparo e saída)
CREATE OR REPLACE FUNCTION public.get_public_service_order_photos(p_order_id uuid)
RETURNS TABLE (
    id uuid,
    photo_url text,
    stage text,
    created_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT sop.id, sop.photo_url, sop.stage, sop.created_at
    FROM public.service_order_photos sop
    WHERE sop.service_order_id = p_order_id
    ORDER BY sop.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_service_order_photos(uuid) TO anon, authenticated, service_role;

-- 2. RPC para dados completos da OS pública para emissão de PDF e visualização do cliente
CREATE OR REPLACE FUNCTION public.get_public_os_full_data(p_order_id uuid)
RETURNS TABLE (
    id uuid,
    order_number bigint,
    status text,
    customer_name text,
    customer_phone text,
    device_brand text,
    device_model text,
    device_color text,
    reported_defect text,
    requested_service text,
    estimated_price numeric,
    final_price numeric,
    warranty_end_date timestamptz,
    estimated_completion timestamptz,
    created_at timestamptz,
    store_id uuid,
    store_name text,
    store_phone text,
    store_address text,
    store_cnpj text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT 
        so.id,
        so.order_number,
        so.status,
        so.customer_name,
        so.customer_phone,
        so.device_brand,
        so.device_model,
        so.device_color,
        so.reported_defect,
        so.requested_service,
        so.estimated_price,
        so.final_price,
        so.warranty_end_date,
        so.estimated_completion,
        so.created_at,
        so.store_id,
        COALESCE(st.name, 'Assistência Técnica') AS store_name,
        st.phone AS store_phone,
        st.address AS store_address,
        st.cnpj AS store_cnpj
    FROM public.service_orders so
    LEFT JOIN public.stores st ON st.id = so.store_id
    WHERE so.id = p_order_id
    LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_os_full_data(uuid) TO anon, authenticated, service_role;

COMMIT;
