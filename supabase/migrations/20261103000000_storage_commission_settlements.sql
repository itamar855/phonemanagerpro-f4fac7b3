-- ==============================================================================
-- MIGRATION: ADICIONAR COMMISSION_SETTLEMENTS A CAN_ACCESS_COMPROVANTE
-- Timestamp: 20261103000000
-- Transação: ATÔMICA (BEGIN ... COMMIT)
-- Projeto: CellManagerPro / phonemanagerpro (hzrqtolfbwnmmeliazmh)
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_access_comprovante(p_file_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_clean_path text;
    v_first_segment text;
    v_is_admin boolean;
BEGIN
    -- 3.1 Se não autenticado, nega imediatamente
    IF v_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    -- 3.2 Dono ou Admin global possuem acesso irrestrito
    SELECT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = v_user_id AND ur.role IN ('dono', 'admin')
    ) INTO v_is_admin;

    IF v_is_admin THEN
        RETURN TRUE;
    END IF;

    -- 3.3 Normalizar caminho removendo prefixo de URL ou bucket
    v_clean_path := p_file_path;
    IF v_clean_path LIKE '%/comprovantes/%' THEN
        v_clean_path := split_part(v_clean_path, '/comprovantes/', 2);
    ELSIF v_clean_path LIKE 'comprovantes/%' THEN
        v_clean_path := substring(v_clean_path from 14);
    END IF;

    -- 3.4 Formato novo: prefixo UUID da loja (<store_id>/...)
    v_first_segment := split_part(v_clean_path, '/', 1);
    IF v_first_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN EXISTS (
            SELECT 1 FROM public.member_stores ms
            WHERE ms.user_id = v_user_id AND ms.store_id = v_first_segment::uuid
        );
    END IF;

    -- 3.5 Owner registrado no storage.objects
    IF EXISTS (
        SELECT 1 FROM storage.objects o
        WHERE o.bucket_id = 'comprovantes' AND o.name = v_clean_path AND o.owner = v_user_id
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3.6 Arquivos legados vinculados no banco a lojas que o usuário pertence
    -- 3.6.1 cash_entries
    IF EXISTS (
        SELECT 1 FROM public.cash_entries ce
        JOIN public.member_stores ms ON ms.store_id = ce.store_id
        WHERE ms.user_id = v_user_id
          AND (ce.receipt_url LIKE '%' || v_clean_path OR ce.supplier_order_receipt_url LIKE '%' || v_clean_path)
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3.6.2 service_orders
    IF EXISTS (
        SELECT 1 FROM public.service_orders so
        JOIN public.member_stores ms ON ms.store_id = so.store_id
        WHERE ms.user_id = v_user_id
          AND so.receipt_url LIKE '%' || v_clean_path
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3.6.3 service_order_photos
    IF EXISTS (
        SELECT 1 FROM public.service_order_photos sop
        JOIN public.service_orders so ON so.id = sop.service_order_id
        JOIN public.member_stores ms ON ms.store_id = so.store_id
        WHERE ms.user_id = v_user_id
          AND sop.photo_url LIKE '%' || v_clean_path
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3.6.4 service_order_items
    IF EXISTS (
        SELECT 1 FROM public.service_order_items soi
        JOIN public.service_orders so ON so.id = soi.service_order_id
        JOIN public.member_stores ms ON ms.store_id = so.store_id
        WHERE ms.user_id = v_user_id
          AND (soi.receipt_url LIKE '%' || v_clean_path OR soi.supplier_order_receipt_url LIKE '%' || v_clean_path)
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3.6.5 transactions
    IF EXISTS (
        SELECT 1 FROM public.transactions tr
        JOIN public.member_stores ms ON ms.store_id = tr.store_id
        WHERE ms.user_id = v_user_id
          AND tr.receipt_url LIKE '%' || v_clean_path
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3.6.6 cash_registers
    IF EXISTS (
        SELECT 1 FROM public.cash_registers cr
        JOIN public.member_stores ms ON ms.store_id = cr.store_id
        WHERE ms.user_id = v_user_id
          AND (cr.opening_receipt_url LIKE '%' || v_clean_path OR cr.closing_receipt_url LIKE '%' || v_clean_path)
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3.6.7 products
    IF EXISTS (
        SELECT 1 FROM public.products pr
        JOIN public.member_stores ms ON ms.store_id = pr.store_id
        WHERE ms.user_id = v_user_id
          AND (pr.device_payment_voucher LIKE '%' || v_clean_path OR pr.parts_payment_voucher LIKE '%' || v_clean_path)
    ) THEN
        RETURN TRUE;
    END IF;

    -- 3.6.8 commission_settlements (membros da loja ou o próprio colaborador liquidado)
    IF EXISTS (
        SELECT 1 FROM public.commission_settlements cs
        LEFT JOIN public.member_stores ms ON ms.store_id = cs.store_id
        WHERE (ms.user_id = v_user_id OR cs.user_id = v_user_id)
          AND cs.receipt_url LIKE '%' || v_clean_path
    ) THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_comprovante(text) TO authenticated, service_role, anon;

COMMIT;
