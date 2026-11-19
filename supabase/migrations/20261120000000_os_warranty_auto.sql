-- ==============================================================================
-- OS: garantia de 90 dias automática na entrega e permissão para técnico e
-- vendedor salvarem os serviços executados e o desconto.
--
-- 1. Trava de colunas (enforce_service_orders_invariants): técnico e vendedor
--    passam a poder gravar service_performed, services_performed e
--    discount_amount (antes o salvamento dava FORBIDDEN_*_COLUMN_UPDATE).
-- 2. Ao ficar "Entregue" sem garantia, warranty_end_date = dia da entrega
--    (horário de Brasília) + 90 dias. Garantia digitada na tela é respeitada.
-- 3. OS já entregues sem garantia recebem a data pela mesma regra.
-- ==============================================================================

BEGIN;

-- 1. Trava de colunas
CREATE OR REPLACE FUNCTION private.enforce_service_orders_invariants()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
                    'payment_notes', 'final_price', 'receipt_url', 'technician_id',
                    'service_performed', 'services_performed', 'discount_amount'
                ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
                    'status', 'completed_at', 'delivered_at', 'exit_checklist',
                    'warranty_end_date', 'updated_at',
                    'payment_cash', 'payment_card', 'payment_pix', 'payment_other',
                    'payment_notes', 'final_price', 'receipt_url', 'technician_id',
                    'service_performed', 'services_performed', 'discount_amount'
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
                    'payment_notes', 'final_price', 'receipt_url',
                    'service_performed', 'services_performed', 'discount_amount'
                ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
                    'updated_at',
                    'payment_cash', 'payment_card', 'payment_pix', 'payment_other',
                    'payment_notes', 'final_price', 'receipt_url',
                    'service_performed', 'services_performed', 'discount_amount'
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
$function$;


-- ------------------------------------------------------------------------------
-- 2. Garantia automática
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.os_default_warranty()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'delivered' AND NEW.warranty_end_date IS NULL THEN
    NEW.warranty_end_date :=
      (((COALESCE(NEW.delivered_at, now()) AT TIME ZONE 'America/Sao_Paulo')::date + 90)::timestamp AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.os_default_warranty() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_service_orders_default_warranty ON public.service_orders;
CREATE TRIGGER trg_service_orders_default_warranty
  BEFORE INSERT OR UPDATE OF status, warranty_end_date ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION private.os_default_warranty();

-- ------------------------------------------------------------------------------
-- 3. OS já entregues sem garantia (sem mexer no updated_at)
-- ------------------------------------------------------------------------------
ALTER TABLE public.service_orders DISABLE TRIGGER update_service_orders_updated_at;
UPDATE public.service_orders
   SET warranty_end_date =
     (((COALESCE(delivered_at, updated_at, created_at) AT TIME ZONE 'America/Sao_Paulo')::date + 90)::timestamp AT TIME ZONE 'UTC')
 WHERE status = 'delivered' AND warranty_end_date IS NULL;
ALTER TABLE public.service_orders ENABLE TRIGGER update_service_orders_updated_at;

COMMIT;
