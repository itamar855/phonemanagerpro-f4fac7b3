-- ==============================================================================
-- FIX: Fluxo de Ordens de Serviço (Técnico e Vendedor) + RPC Atômica de Peças Avulsas
-- Projeto: CellManagerPro / phonemanagerpro
--
-- Problemas corrigidos:
--   1. Técnico não conseguia criar OS atribuindo técnico (FORBIDDEN_INSERT_TECHNICIAN_ASSIGNMENT).
--      Consequência: OS ficava sem técnico e o insert de peças (service_order_items) falhava por RLS.
--   2. Técnico não conseguia lançar pagamentos / valor final / comprovante na própria OS
--      (FORBIDDEN_TECHNICIAN_COLUMN_UPDATE).
--   3. Técnico não conseguia transferir a própria OS para outro técnico
--      (FORBIDDEN_TECHNICIAN_REASSIGNMENT + WITH CHECK da policy so_update_member_role).
--   4. Vendedor agora pode atualizar colunas financeiras (pagamentos, valor final, comprovante)
--      em ordens de serviço da sua loja.
--   5. Inclusão de peça avulsa agora é atômica via RPC (public.add_service_order_custom_part).
--      Evita que um produto fique órfão com status 'sold' no estoque caso a vinculação à OS falhe.
--
-- Regras mantidas sem alteração:
--   - Admin/gerente: comportamento idêntico.
--   - Técnico só edita OS em que ele é o técnico atual (USING da policy inalterado).
--     OS sem técnico continua exigindo atribuição por admin/gerente.
--   - Técnico atribuído deve ter membership na loja da OS (INSERT e UPDATE).
--   - Campos imutáveis, transferência de loja e invariante de peças: inalterados.
--   - Policies de service_order_items / history / photos: inalteradas.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Função de trigger (mesma assinatura, owner e hardening da Phase1B)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.enforce_service_orders_invariants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- =========================================================================
    -- RAMO 1: INSERT (Nunca referencia OLD)
    -- =========================================================================
    IF TG_OP = 'INSERT' THEN
        IF NEW.technician_id IS NOT NULL THEN
            IF auth.uid() IS NOT NULL THEN
                -- Técnico também pode atribuir técnico na criação da OS
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid()
                      AND ur.role::text IN ('admin', 'gerente', 'tecnico')
                ) THEN
                    RAISE EXCEPTION 'FORBIDDEN_INSERT_TECHNICIAN_ASSIGNMENT: Apenas admin, gerente ou técnico podem atribuir técnico na criação da OS.';
                END IF;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM public.member_stores ms
                WHERE ms.user_id = NEW.technician_id AND ms.store_id = NEW.store_id
            ) THEN
                RAISE EXCEPTION 'FORBIDDEN_TECHNICIAN_TARGET: O técnico atribuído não possui membership na loja da OS.';
            END IF;
        END IF;

    -- =========================================================================
    -- RAMO 2: UPDATE
    -- =========================================================================
    ELSIF TG_OP = 'UPDATE' THEN
        -- 1. Campos imutáveis para qualquer operador (inclusive service_role)
        IF NEW.id IS DISTINCT FROM OLD.id THEN
            RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFIED: O identificador id da OS não pode ser alterado.';
        END IF;

        IF NEW.order_number IS DISTINCT FROM OLD.order_number THEN
            RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFIED: O número da OS (order_number) não pode ser alterado.';
        END IF;

        IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
            RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFIED: O registro created_at da OS não pode ser alterado.';
        END IF;

        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'IMMUTABLE_FIELD_MODIFIED: O autor da OS (created_by) não pode ser alterado.';
        END IF;

        -- 2. Tratamento explícito de papéis para operadores humanos autenticados
        IF auth.uid() IS NOT NULL THEN
            IF EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid()
                  AND ur.role::text IN ('admin', 'gerente')
            ) THEN
                NULL;
            ELSIF EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid()
                  AND ur.role::text = 'tecnico'
            ) THEN
                -- Técnico: colunas técnicas + pagamentos/valor final/comprovante + técnico
                IF (to_jsonb(NEW) - ARRAY[
                    'status', 'completed_at', 'delivered_at', 'exit_checklist',
                    'warranty_end_date', 'updated_at',
                    'payment_cash', 'payment_card', 'payment_pix', 'payment_other',
                    'payment_notes', 'final_price', 'receipt_url', 'technician_id'
                ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
                    'status', 'completed_at', 'delivered_at', 'exit_checklist',
                    'warranty_end_date', 'updated_at',
                    'payment_cash', 'payment_card', 'payment_pix', 'payment_other',
                    'payment_notes', 'final_price', 'receipt_url', 'technician_id'
                ]) THEN
                    RAISE EXCEPTION 'FORBIDDEN_TECHNICIAN_COLUMN_UPDATE: Técnicos só podem atualizar colunas operacionais técnicas autorizadas.';
                END IF;
            ELSIF EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid()
                  AND ur.role::text = 'vendedor'
            ) THEN
                -- Vendedor: pagamentos, valor final e comprovante
                IF (to_jsonb(NEW) - ARRAY[
                    'updated_at',
                    'payment_cash', 'payment_card', 'payment_pix', 'payment_other',
                    'payment_notes', 'final_price', 'receipt_url'
                ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
                    'updated_at',
                    'payment_cash', 'payment_card', 'payment_pix', 'payment_other',
                    'payment_notes', 'final_price', 'receipt_url'
                ]) THEN
                    RAISE EXCEPTION 'FORBIDDEN_VENDEDOR_COLUMN_UPDATE: Vendedores só podem atualizar colunas financeiras (pagamentos, valor final e comprovante).';
                END IF;
            ELSE
                RAISE EXCEPTION 'FORBIDDEN_ROLE_UPDATE: Papel não autorizado a atualizar ordens de serviço.';
            END IF;

            -- 3. Transferência de Loja (Autorizações do operador humano)
            IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid()
                      AND ur.role::text IN ('admin', 'gerente')
                ) THEN
                    RAISE EXCEPTION 'FORBIDDEN_STORE_TRANSFER: Apenas admin ou gerente podem transferir OS entre lojas.';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM public.member_stores ms
                    WHERE ms.user_id = auth.uid() AND ms.store_id = OLD.store_id
                ) THEN
                    RAISE EXCEPTION 'FORBIDDEN_STORE_TRANSFER: O operador não possui membership na loja de origem (OLD.store_id).';
                END IF;

                IF NOT EXISTS (
                    SELECT 1 FROM public.member_stores ms
                    WHERE ms.user_id = auth.uid() AND ms.store_id = NEW.store_id
                ) THEN
                    RAISE EXCEPTION 'FORBIDDEN_STORE_TRANSFER: O operador não possui membership na loja de destino (NEW.store_id).';
                END IF;
            END IF;

            -- 4. Reatribuição de Técnico
            -- Técnico pode transferir a OS que é dele (OLD.technician_id = auth.uid())
            IF NEW.technician_id IS DISTINCT FROM OLD.technician_id THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid()
                      AND ur.role::text IN ('admin', 'gerente')
                ) AND NOT (
                    OLD.technician_id = auth.uid()
                    AND EXISTS (
                        SELECT 1 FROM public.user_roles ur
                        WHERE ur.user_id = auth.uid()
                          AND ur.role::text = 'tecnico'
                    )
                ) THEN
                    RAISE EXCEPTION 'FORBIDDEN_TECHNICIAN_REASSIGNMENT: Apenas admin, gerente ou o técnico atual da OS podem alterar atribuição de técnico.';
                END IF;
            END IF;
        END IF;

        -- 5. Invariante Estrutural de Peças Vinculadas em Transferência de Loja (inclusive service_role)
        IF NEW.store_id IS DISTINCT FROM OLD.store_id THEN
            IF EXISTS (
                SELECT 1
                FROM public.service_order_items soi
                JOIN public.products p ON p.id = soi.product_id
                WHERE soi.service_order_id = OLD.id
                  AND p.store_id IS DISTINCT FROM NEW.store_id
            ) THEN
                RAISE EXCEPTION
                  'FORBIDDEN_STORE_TRANSFER_ITEM_MISMATCH: A OS possui peças vinculadas que não pertencem à loja de destino.';
            END IF;
        END IF;

        -- 6. Revalidar pertinência do técnico se store_id ou technician_id mudou (inclusive service_role)
        IF (NEW.store_id IS DISTINCT FROM OLD.store_id) OR (NEW.technician_id IS DISTINCT FROM OLD.technician_id) THEN
            IF NEW.technician_id IS NOT NULL THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.member_stores ms
                    WHERE ms.user_id = NEW.technician_id AND ms.store_id = NEW.store_id
                ) THEN
                    RAISE EXCEPTION 'FORBIDDEN_TECHNICIAN_TARGET: O técnico atribuído não possui membership na loja da OS.';
                END IF;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

ALTER FUNCTION private.enforce_service_orders_invariants() OWNER TO postgres;

REVOKE ALL ON FUNCTION private.enforce_service_orders_invariants() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_service_orders_invariants() FROM anon;
REVOKE ALL ON FUNCTION private.enforce_service_orders_invariants() FROM authenticated;
REVOKE ALL ON FUNCTION private.enforce_service_orders_invariants() FROM service_role;

-- ------------------------------------------------------------------------------
-- 2. Policy de UPDATE em service_orders
--    USING: admin/gerente, técnico na sua própria OS, ou vendedor na sua loja membro.
--    WITH CHECK: valida role e loja membro.
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "so_update_member_role" ON public.service_orders;

CREATE POLICY "so_update_member_role" ON public.service_orders
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = auth.uid() AND ms.store_id = service_orders.store_id
    )
    AND (
        EXISTS (
            SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid() AND ur.role::text IN ('admin', 'gerente')
        )
        OR (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.role::text = 'tecnico'
            )
            AND technician_id = auth.uid()
        )
        OR (
            EXISTS (
                SELECT 1 FROM public.user_roles ur
                WHERE ur.user_id = auth.uid() AND ur.role::text = 'vendedor'
            )
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = auth.uid() AND ms.store_id = service_orders.store_id
    )
    AND EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid() AND ur.role::text IN ('admin', 'gerente', 'tecnico', 'vendedor')
    )
);

-- ------------------------------------------------------------------------------
-- 3. RPC Atômica para adicionar peça avulsa à OS (evita produto órfão no estoque)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_service_order_custom_part(
    p_service_order_id UUID,
    p_name TEXT,
    p_brand TEXT,
    p_model TEXT,
    p_cost_price NUMERIC,
    p_sale_price NUMERIC,
    p_supplier_id UUID DEFAULT NULL,
    p_supplier_name TEXT DEFAULT NULL,
    p_receipt_url TEXT DEFAULT NULL,
    p_supplier_order_receipt_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_store_id UUID;
    v_product_id UUID;
    v_item_id UUID;
    v_user_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED: Usuário não autenticado.';
    END IF;

    -- Obter store_id da OS
    SELECT store_id INTO v_store_id
    FROM public.service_orders
    WHERE id = p_service_order_id;

    IF v_store_id IS NULL THEN
        RAISE EXCEPTION 'SERVICE_ORDER_NOT_FOUND: Ordem de serviço não encontrada.';
    END IF;

    -- 1. Inserir produto com status sold (se a vinculação ao item falhar, faz rollback automático)
    INSERT INTO public.products (
        store_id,
        name,
        brand,
        model,
        cost_price,
        sale_price,
        status,
        product_type,
        condition,
        created_by,
        supplier_id,
        supplier_name,
        parts_payment_voucher
    ) VALUES (
        v_store_id,
        trim(p_name),
        COALESCE(NULLIF(trim(p_brand), ''), 'Genérico'),
        COALESCE(NULLIF(trim(p_model), ''), trim(p_name)),
        p_cost_price,
        COALESCE(p_sale_price, p_cost_price * 1.5),
        'sold',
        'peca',
        'new',
        v_user_id,
        p_supplier_id,
        p_supplier_name,
        p_receipt_url
    ) RETURNING id INTO v_product_id;

    -- 2. Inserir em service_order_items (se RLS ou validações falharem, o rollback automático anula o produto acima)
    INSERT INTO public.service_order_items (
        service_order_id,
        product_id,
        quantity,
        unit_price,
        unit_cost,
        supplier_id,
        supplier_name,
        receipt_url,
        supplier_order_receipt_url
    ) VALUES (
        p_service_order_id,
        v_product_id,
        1,
        COALESCE(p_sale_price, p_cost_price * 1.5),
        p_cost_price,
        p_supplier_id,
        p_supplier_name,
        p_receipt_url,
        p_supplier_order_receipt_url
    ) RETURNING id INTO v_item_id;

    RETURN jsonb_build_object(
        'product_id', v_product_id,
        'item_id', v_item_id
    );
END;
$$;

ALTER FUNCTION public.add_service_order_custom_part(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, TEXT, TEXT) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.add_service_order_custom_part(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_service_order_custom_part(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_service_order_custom_part(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_service_order_custom_part(UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, UUID, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
