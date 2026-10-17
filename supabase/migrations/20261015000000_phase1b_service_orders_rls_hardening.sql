-- ==============================================================================
-- SCRIPT 1: PHASE 1B REV 7.2 — ATOMIC MIGRATION TRANSACTION
-- Projeto: CellManagerPro / phonemanagerpro (hzrqtolfbwnmmeliazmh)
-- Transação: ATÔMICA (BEGIN ... COMMIT)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PREFLIGHT COMPLETO FAIL-CLOSED E BASELINE AUDITADO
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_diff_count INTEGER;
    v_cnt INTEGER;
    v_is_nullable TEXT;
    v_rpc_owner TEXT;
    v_rpc_secdef BOOLEAN;
    v_rpc_search_path TEXT[];
    v_rpc_anon_exec BOOLEAN;
    v_rpc_auth_exec BOOLEAN;
    v_rpc_pub_exec BOOLEAN;
    v_rpc_overloads INTEGER;
BEGIN
    -- 1.1 Exigir existência prévia do schema private (Phase0B)
    SELECT count(*) INTO v_cnt FROM information_schema.schemata WHERE schema_name = 'private';
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: schema private não existe previamente no banco';
    END IF;

    -- 1.2 Invariantes de integridade referencial e dados de service_orders
    SELECT count(*) INTO v_cnt FROM public.service_orders WHERE store_id IS NULL;
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: service_orders possui % registros com store_id NULL', v_cnt;
    END IF;

    SELECT count(*) INTO v_cnt FROM public.service_orders os
    WHERE NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = os.store_id);
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: service_orders possui % registros com store_id inexistente', v_cnt;
    END IF;

    -- 1.3 Invariantes de service_order_items, history e photos
    SELECT count(*) INTO v_cnt FROM public.service_order_items soi
    WHERE NOT EXISTS (SELECT 1 FROM public.service_orders os WHERE os.id = soi.service_order_id);
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: service_order_items possui % itens órfãos', v_cnt;
    END IF;

    SELECT count(*) INTO v_cnt FROM public.service_order_items soi
    WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = soi.product_id);
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: service_order_items possui % produtos inexistentes', v_cnt;
    END IF;

    SELECT count(*) INTO v_cnt FROM public.service_order_items soi
    JOIN public.service_orders os ON os.id = soi.service_order_id
    JOIN public.products p ON p.id = soi.product_id
    WHERE p.store_id IS DISTINCT FROM os.store_id;
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: service_order_items possui % produtos de loja divergente da OS', v_cnt;
    END IF;

    SELECT count(*) INTO v_cnt FROM public.service_order_history soh
    WHERE NOT EXISTS (SELECT 1 FROM public.service_orders os WHERE os.id = soh.service_order_id);
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: service_order_history possui % registros órfãos', v_cnt;
    END IF;

    SELECT count(*) INTO v_cnt FROM public.service_order_photos sop
    WHERE NOT EXISTS (SELECT 1 FROM public.service_orders os WHERE os.id = sop.service_order_id);
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: service_order_photos possui % registros órfãos', v_cnt;
    END IF;

    -- 1.4 RLS habilitado e FORCE RLS = false nas 4 tabelas
    SELECT count(*) INTO v_cnt FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND rowsecurity = true;
    IF v_cnt <> 4 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: RLS não está habilitado nas 4 tabelas de OS';
    END IF;

    SELECT count(*) INTO v_cnt FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND c.relforcerowsecurity = true;
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: relforcerowsecurity ativo indevidamente';
    END IF;

    -- 1.5 Baseline das 12 policies legadas: EXCEPT nos dois sentidos com conteúdo completo
    CREATE TEMPORARY TABLE temp_expected_old_policies (
        tablename TEXT,
        policyname TEXT,
        permissive TEXT,
        roles TEXT[],
        cmd TEXT,
        qual TEXT,
        with_check TEXT
    ) ON COMMIT DROP;

    INSERT INTO temp_expected_old_policies VALUES
        ('service_order_history', 'Authenticated can insert os_history', 'PERMISSIVE', '{authenticated}', 'INSERT', NULL, '(auth.uid() = created_by)'),
        ('service_order_history', 'Authenticated can view os_history', 'PERMISSIVE', '{authenticated}', 'SELECT', 'true', NULL),
        ('service_order_items', 'Enable all access for authenticated users on service_order_item', 'PERMISSIVE', '{public}', 'ALL', '(auth.role() = ''authenticated''::text)', NULL),
        ('service_order_items', 'soi_all', 'PERMISSIVE', '{public}', 'ALL', '(auth.role() = ''authenticated''::text)', NULL),
        ('service_order_photos', 'Enable all access for authenticated users on service_order_phot', 'PERMISSIVE', '{public}', 'ALL', '(auth.role() = ''authenticated''::text)', NULL),
        ('service_order_photos', 'sop_all', 'PERMISSIVE', '{public}', 'ALL', '(auth.role() = ''authenticated''::text)', NULL),
        ('service_orders', 'Admins can manage service_orders', 'PERMISSIVE', '{public}', 'ALL', 'has_role(auth.uid(), ''admin''::app_role)', NULL),
        ('service_orders', 'Authenticated can insert service_orders', 'PERMISSIVE', '{authenticated}', 'INSERT', NULL, '(auth.uid() = created_by)'),
        ('service_orders', 'Authenticated can view service_orders', 'PERMISSIVE', '{authenticated}', 'SELECT', 'true', NULL),
        ('service_orders', 'Gerentes can update service_orders', 'PERMISSIVE', '{authenticated}', 'UPDATE', 'has_role(auth.uid(), ''gerente''::app_role)', NULL),
        ('service_orders', 'Public can view service orders', 'PERMISSIVE', '{anon}', 'SELECT', 'true', NULL),
        ('service_orders', 'Technicians can update own service_orders', 'PERMISSIVE', '{authenticated}', 'UPDATE', '(technician_id = auth.uid())', NULL);

    SELECT count(*) INTO v_diff_count FROM (
        SELECT tablename, policyname, permissive, roles::text[], cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
        EXCEPT
        SELECT tablename, policyname, permissive, roles::text[], cmd, qual, with_check FROM temp_expected_old_policies
    ) d1;
    IF v_diff_count > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: Policies reais divergem do baseline esperado (diff=%)', v_diff_count;
    END IF;

    SELECT count(*) INTO v_diff_count FROM (
        SELECT tablename, policyname, permissive, roles::text[], cmd, qual, with_check FROM temp_expected_old_policies
        EXCEPT
        SELECT tablename, policyname, permissive, roles::text[], cmd, qual, with_check
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
    ) d2;
    IF v_diff_count > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: Baseline esperado possui policies ausentes no banco (diff=%)', v_diff_count;
    END IF;

    -- 1.6 Baseline de grants: EXCEPT nos dois sentidos com information_schema.table_privileges
    CREATE TEMPORARY TABLE temp_expected_old_grants (
        table_name TEXT,
        grantee TEXT,
        privilege_type TEXT
    ) ON COMMIT DROP;

    INSERT INTO temp_expected_old_grants (table_name, grantee, privilege_type)
    SELECT t, g, p
    FROM unnest(ARRAY['service_orders', 'service_order_items', 'service_order_history', 'service_order_photos']) t
    CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role']) g
    CROSS JOIN unnest(ARRAY['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE']) p;

    SELECT count(*) INTO v_diff_count FROM (
        SELECT table_name, grantee, privilege_type
        FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
          AND grantee IN ('anon', 'authenticated', 'service_role')
        EXCEPT
        SELECT table_name, grantee, privilege_type FROM temp_expected_old_grants
    ) g_diff1;
    IF v_diff_count > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: Grants atuais excedem o baseline esperado (diff=%)', v_diff_count;
    END IF;

    SELECT count(*) INTO v_diff_count FROM (
        SELECT table_name, grantee, privilege_type FROM temp_expected_old_grants
        EXCEPT
        SELECT table_name, grantee, privilege_type
        FROM information_schema.table_privileges
        WHERE table_schema = 'public'
          AND table_name IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
          AND grantee IN ('anon', 'authenticated', 'service_role')
    ) g_diff2;
    IF v_diff_count > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: Grants atuais não cobrem o baseline esperado (diff=%)', v_diff_count;
    END IF;

    -- Zero privilégios para PUBLIC nas 4 tabelas
    SELECT count(*) INTO v_cnt FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND grantee = 'PUBLIC';
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: PUBLIC possui privilégios de tabela no baseline';
    END IF;

    -- 1.7 store_id atualmente nullable = SIM
    SELECT is_nullable INTO v_is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_orders' AND column_name = 'store_id';
    IF v_is_nullable <> 'YES' THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: service_orders.store_id não está nullable';
    END IF;

    -- 1.8 Trigger e função Phase1B ausentes
    SELECT count(*) INTO v_cnt FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND p.proname = 'enforce_service_orders_invariants';
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: private.enforce_service_orders_invariants já existe';
    END IF;

    SELECT count(*) INTO v_cnt FROM pg_trigger
    WHERE tgrelid = 'public.service_orders'::regclass AND tgname = 'trg_service_orders_invariants';
    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: Trigger trg_service_orders_invariants já existe';
    END IF;

    -- 1.9 RPC Phase1A restrita ao overload exato public.get_public_service_order(uuid)
    SELECT count(*) INTO v_rpc_overloads FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_public_service_order';
    IF v_rpc_overloads <> 1 THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: Esperado exatamente 1 overload para get_public_service_order (encontrado %)', v_rpc_overloads;
    END IF;

    SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_rpc_owner, v_rpc_secdef, v_rpc_search_path
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.oid = 'public.get_public_service_order(uuid)'::regprocedure;

    IF v_rpc_owner <> 'postgres' OR v_rpc_secdef IS NOT TRUE OR v_rpc_search_path IS DISTINCT FROM ARRAY['search_path=""'] THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: Propriedades da RPC public.get_public_service_order(uuid) incorretas';
    END IF;

    SELECT has_function_privilege('anon', 'public.get_public_service_order(uuid)', 'EXECUTE'),
           has_function_privilege('authenticated', 'public.get_public_service_order(uuid)', 'EXECUTE'),
           has_function_privilege('public', 'public.get_public_service_order(uuid)', 'EXECUTE')
    INTO v_rpc_anon_exec, v_rpc_auth_exec, v_rpc_pub_exec;

    IF NOT v_rpc_anon_exec OR NOT v_rpc_auth_exec OR v_rpc_pub_exec THEN
        RAISE EXCEPTION 'PHASE1B_PREFLIGHT_FAIL: Privilégios EXECUTE da RPC incorretos (anon=%, auth=%, public=%)',
            v_rpc_anon_exec, v_rpc_auth_exec, v_rpc_pub_exec;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. DDL ESTRUTURAL
-- ------------------------------------------------------------------------------
ALTER TABLE public.service_orders ALTER COLUMN store_id SET NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. TRIGGER DE INVARIANTES ESTRUTURAIS & INVARIANTE DE PEÇAS NA TRANSFERÊNCIA
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
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid()
                      AND ur.role::text IN ('admin', 'gerente')
                ) THEN
                    RAISE EXCEPTION 'FORBIDDEN_INSERT_TECHNICIAN_ASSIGNMENT: Apenas admin ou gerente podem atribuir técnico na criação da OS.';
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
                IF (to_jsonb(NEW) - ARRAY[
                    'status', 'completed_at', 'delivered_at', 'exit_checklist',
                    'warranty_end_date', 'updated_at'
                ]) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY[
                    'status', 'completed_at', 'delivered_at', 'exit_checklist',
                    'warranty_end_date', 'updated_at'
                ]) THEN
                    RAISE EXCEPTION 'FORBIDDEN_TECHNICIAN_COLUMN_UPDATE: Técnicos só podem atualizar colunas operacionais técnicas autorizadas.';
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
            IF NEW.technician_id IS DISTINCT FROM OLD.technician_id THEN
                IF NOT EXISTS (
                    SELECT 1 FROM public.user_roles ur
                    WHERE ur.user_id = auth.uid()
                      AND ur.role::text IN ('admin', 'gerente')
                ) THEN
                    RAISE EXCEPTION 'FORBIDDEN_TECHNICIAN_REASSIGNMENT: Apenas admin ou gerente podem alterar atribuição de técnico.';
                END IF;
            END IF;
        END IF;

        -- 5. Invariante Estrutural de Peças Vinculadas em Transferência de Loja (inclusive service_role) (Item 1 Rev 7.1)
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

-- Hardening estrito da função de trigger: sem EXECUTE direto para PUBLIC, anon, authenticated e service_role (Item 5)
REVOKE ALL ON FUNCTION private.enforce_service_orders_invariants() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.enforce_service_orders_invariants() FROM anon;
REVOKE ALL ON FUNCTION private.enforce_service_orders_invariants() FROM authenticated;
REVOKE ALL ON FUNCTION private.enforce_service_orders_invariants() FROM service_role;

DROP TRIGGER IF EXISTS trg_service_orders_invariants ON public.service_orders;
CREATE TRIGGER trg_service_orders_invariants
BEFORE INSERT OR UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION private.enforce_service_orders_invariants();

-- ------------------------------------------------------------------------------
-- 4. DROP DAS 12 POLICIES LEGADAS PELOS NOMES LITERAIS AUDITADOS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can manage service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "Authenticated can insert service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "Authenticated can view service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "Gerentes can update service_orders" ON public.service_orders;
DROP POLICY IF EXISTS "Public can view service orders" ON public.service_orders;
DROP POLICY IF EXISTS "Technicians can update own service_orders" ON public.service_orders;

DROP POLICY IF EXISTS "Enable all access for authenticated users on service_order_item" ON public.service_order_items;
DROP POLICY IF EXISTS "soi_all" ON public.service_order_items;

DROP POLICY IF EXISTS "Enable all access for authenticated users on service_order_phot" ON public.service_order_photos;
DROP POLICY IF EXISTS "sop_all" ON public.service_order_photos;

DROP POLICY IF EXISTS "Authenticated can insert os_history" ON public.service_order_history;
DROP POLICY IF EXISTS "Authenticated can view os_history" ON public.service_order_history;

-- ------------------------------------------------------------------------------
-- 5. NOVAS POLICIES PHASE1B (4 TABELAS)
-- ------------------------------------------------------------------------------

-- 5.1 service_orders
CREATE POLICY "so_select_member_store" ON public.service_orders
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = auth.uid() AND ms.store_id = service_orders.store_id
    )
);

CREATE POLICY "so_insert_member_store" ON public.service_orders
FOR INSERT TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = auth.uid() AND ms.store_id = service_orders.store_id
    )
);

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
    )
)
WITH CHECK (
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
    )
);

-- 5.2 service_order_items
CREATE POLICY "soi_select_member_store" ON public.service_order_items
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.service_orders os
        JOIN public.member_stores ms ON ms.store_id = os.store_id
        WHERE os.id = service_order_items.service_order_id
          AND ms.user_id = auth.uid()
    )
);

CREATE POLICY "soi_insert_authorized_role" ON public.service_order_items
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.service_orders os
        JOIN public.member_stores ms ON ms.store_id = os.store_id
        JOIN public.products p ON p.id = service_order_items.product_id
        WHERE os.id = service_order_items.service_order_id
          AND ms.user_id = auth.uid()
          AND p.store_id = os.store_id
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
                  AND os.technician_id = auth.uid()
              )
          )
    )
);

CREATE POLICY "soi_delete_authorized_role" ON public.service_order_items
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.service_orders os
        JOIN public.member_stores ms ON ms.store_id = os.store_id
        WHERE os.id = service_order_items.service_order_id
          AND ms.user_id = auth.uid()
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
                  AND os.technician_id = auth.uid()
              )
          )
    )
);

-- 5.3 service_order_history
CREATE POLICY "soh_select_member_store" ON public.service_order_history
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.service_orders os
        JOIN public.member_stores ms ON ms.store_id = os.store_id
        WHERE os.id = service_order_history.service_order_id
          AND ms.user_id = auth.uid()
    )
);

CREATE POLICY "soh_insert_member_store" ON public.service_order_history
FOR INSERT TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.service_orders os
        JOIN public.member_stores ms ON ms.store_id = os.store_id
        WHERE os.id = service_order_history.service_order_id
          AND ms.user_id = auth.uid()
    )
);

-- 5.4 service_order_photos
CREATE POLICY "sop_select_member_store" ON public.service_order_photos
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.service_orders os
        JOIN public.member_stores ms ON ms.store_id = os.store_id
        WHERE os.id = service_order_photos.service_order_id
          AND ms.user_id = auth.uid()
    )
);

CREATE POLICY "sop_insert_member_store" ON public.service_order_photos
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.service_orders os
        JOIN public.member_stores ms ON ms.store_id = os.store_id
        WHERE os.id = service_order_photos.service_order_id
          AND ms.user_id = auth.uid()
    )
);

CREATE POLICY "sop_delete_authorized_role" ON public.service_order_photos
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.service_orders os
        JOIN public.member_stores ms ON ms.store_id = os.store_id
        WHERE os.id = service_order_photos.service_order_id
          AND ms.user_id = auth.uid()
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
                  AND os.technician_id = auth.uid()
              )
          )
    )
);

-- ------------------------------------------------------------------------------
-- 6. REVOKE TOTAL E GRANTS MÍNIMOS ESTADOS
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.service_orders FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.service_order_items FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.service_order_history FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.service_order_photos FROM PUBLIC, anon, authenticated, service_role;

-- Grants para authenticated
GRANT SELECT, INSERT, UPDATE ON TABLE public.service_orders TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.service_order_items TO authenticated;
GRANT SELECT, INSERT ON TABLE public.service_order_history TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.service_order_photos TO authenticated;

-- Grants estritos de CRUD para service_role (0 TRUNCATE, 0 TRIGGER, 0 REFERENCES)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_order_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_order_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_order_photos TO service_role;

-- ------------------------------------------------------------------------------
-- 7. POSTCONDITIONS FAIL-CLOSED BIDIRECIONAL
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_diff_count INTEGER;
    v_cnt INTEGER;
    v_is_not_null TEXT;
    v_anon_policy_cnt INTEGER;
    v_true_policy_cnt INTEGER;
    v_anon_priv_cnt INTEGER;
    v_pub_priv_cnt INTEGER;
    v_dangerous_priv_cnt INTEGER;
    v_fn_owner TEXT;
    v_fn_secdef BOOLEAN;
    v_fn_config TEXT[];
    v_fn_pub_exec BOOLEAN;
    v_fn_anon_exec BOOLEAN;
    v_fn_auth_exec BOOLEAN;
    v_fn_sr_exec BOOLEAN;
    v_trg_cnt INTEGER;
    v_rpc_overloads INTEGER;
    v_rpc_owner TEXT;
    v_rpc_secdef BOOLEAN;
    v_rpc_search_path TEXT[];
    v_rpc_anon_exec BOOLEAN;
    v_rpc_auth_exec BOOLEAN;
    v_rpc_pub_exec BOOLEAN;
BEGIN
    -- 7.1 Confirmar restrição NOT NULL em store_id
    SELECT is_nullable INTO v_is_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service_orders'
      AND column_name = 'store_id';

    IF v_is_not_null <> 'NO' THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: store_id não está NOT NULL (is_nullable=%)', v_is_not_null;
    END IF;

    -- 7.2 Inventário exato e bidirecional das 11 policies aprovadas (Rev 7.2)
    CREATE TEMPORARY TABLE temp_expected_new_policy_inventory (
        tablename TEXT,
        policyname TEXT,
        permissive TEXT,
        roles TEXT[],
        cmd TEXT
    ) ON COMMIT DROP;

    INSERT INTO temp_expected_new_policy_inventory (tablename, policyname, permissive, roles, cmd) VALUES
        ('service_orders', 'so_select_member_store', 'PERMISSIVE', ARRAY['authenticated']::text[], 'SELECT'),
        ('service_orders', 'so_insert_member_store', 'PERMISSIVE', ARRAY['authenticated']::text[], 'INSERT'),
        ('service_orders', 'so_update_member_role', 'PERMISSIVE', ARRAY['authenticated']::text[], 'UPDATE'),
        ('service_order_items', 'soi_select_member_store', 'PERMISSIVE', ARRAY['authenticated']::text[], 'SELECT'),
        ('service_order_items', 'soi_insert_authorized_role', 'PERMISSIVE', ARRAY['authenticated']::text[], 'INSERT'),
        ('service_order_items', 'soi_delete_authorized_role', 'PERMISSIVE', ARRAY['authenticated']::text[], 'DELETE'),
        ('service_order_history', 'soh_select_member_store', 'PERMISSIVE', ARRAY['authenticated']::text[], 'SELECT'),
        ('service_order_history', 'soh_insert_member_store', 'PERMISSIVE', ARRAY['authenticated']::text[], 'INSERT'),
        ('service_order_photos', 'sop_select_member_store', 'PERMISSIVE', ARRAY['authenticated']::text[], 'SELECT'),
        ('service_order_photos', 'sop_insert_member_store', 'PERMISSIVE', ARRAY['authenticated']::text[], 'INSERT'),
        ('service_order_photos', 'sop_delete_authorized_role', 'PERMISSIVE', ARRAY['authenticated']::text[], 'DELETE');

    -- Comparação bidirecional de inventário: actual EXCEPT expected = 0
    SELECT count(*) INTO v_diff_count
    FROM (
        SELECT tablename, policyname, permissive, roles::text[], cmd
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
        EXCEPT
        SELECT tablename, policyname, permissive, roles, cmd
        FROM temp_expected_new_policy_inventory
    ) d1;

    IF v_diff_count > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Policies reais em pg_policies excedem o inventário esperado (diff=%)', v_diff_count;
    END IF;

    -- Comparação bidirecional de inventário: expected EXCEPT actual = 0
    SELECT count(*) INTO v_diff_count
    FROM (
        SELECT tablename, policyname, permissive, roles, cmd
        FROM temp_expected_new_policy_inventory
        EXCEPT
        SELECT tablename, policyname, permissive, roles::text[], cmd
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
    ) d2;

    IF v_diff_count > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Inventário esperado não foi totalmente encontrado em pg_policies (diff=%)', v_diff_count;
    END IF;

    -- Total de policies nas 4 tabelas deve ser exatamente 11
    SELECT count(*) INTO v_cnt
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos');

    IF v_cnt <> 11 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Total de policies nas 4 tabelas diverge de 11 (encontrado %)', v_cnt;
    END IF;

    -- Zero policies para role anon ou role public
    SELECT count(*) INTO v_cnt
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND ('anon' = ANY(roles) OR 'public' = ANY(roles));

    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Existem % policies expostas para anon ou public', v_cnt;
    END IF;

    -- Zero policies com qual = 'true' ou with_check = 'true'
    SELECT count(*) INTO v_cnt
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND (trim(qual) = 'true' OR trim(with_check) = 'true');

    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Existem % policies com qual=true ou with_check=true', v_cnt;
    END IF;

    -- Validação de formato estrutural (nullness shape) por comando (Rev 7.2)
    -- SELECT: qual IS NOT NULL AND with_check IS NULL
    -- INSERT: qual IS NULL AND with_check IS NOT NULL
    -- UPDATE: qual IS NOT NULL AND with_check IS NOT NULL
    -- DELETE: qual IS NOT NULL AND with_check IS NULL
    SELECT count(*) INTO v_cnt
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND NOT (
          (cmd = 'SELECT' AND qual IS NOT NULL AND with_check IS NULL) OR
          (cmd = 'INSERT' AND qual IS NULL AND with_check IS NOT NULL) OR
          (cmd = 'UPDATE' AND qual IS NOT NULL AND with_check IS NOT NULL) OR
          (cmd = 'DELETE' AND qual IS NOT NULL AND with_check IS NULL)
      );

    IF v_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Existem % policies com estrutura de nullness inválida para seu comando (cmd)', v_cnt;
    END IF;

    -- 7.3 Comparação de grants finais via EXCEPT bidirecional estritamente delimitada a anon, authenticated e service_role (Item 2)
    CREATE TEMPORARY TABLE temp_expected_final_grants (
        table_name TEXT,
        grantee TEXT,
        privilege_type TEXT
    ) ON COMMIT DROP;

    INSERT INTO temp_expected_final_grants VALUES
        ('service_orders', 'authenticated', 'SELECT'),
        ('service_orders', 'authenticated', 'INSERT'),
        ('service_orders', 'authenticated', 'UPDATE'),
        ('service_order_items', 'authenticated', 'SELECT'),
        ('service_order_items', 'authenticated', 'INSERT'),
        ('service_order_items', 'authenticated', 'DELETE'),
        ('service_order_history', 'authenticated', 'SELECT'),
        ('service_order_history', 'authenticated', 'INSERT'),
        ('service_order_photos', 'authenticated', 'SELECT'),
        ('service_order_photos', 'authenticated', 'INSERT'),
        ('service_order_photos', 'authenticated', 'DELETE'),
        ('service_orders', 'service_role', 'SELECT'),
        ('service_orders', 'service_role', 'INSERT'),
        ('service_orders', 'service_role', 'UPDATE'),
        ('service_orders', 'service_role', 'DELETE'),
        ('service_order_items', 'service_role', 'SELECT'),
        ('service_order_items', 'service_role', 'INSERT'),
        ('service_order_items', 'service_role', 'UPDATE'),
        ('service_order_items', 'service_role', 'DELETE'),
        ('service_order_history', 'service_role', 'SELECT'),
        ('service_order_history', 'service_role', 'INSERT'),
        ('service_order_history', 'service_role', 'UPDATE'),
        ('service_order_history', 'service_role', 'DELETE'),
        ('service_order_photos', 'service_role', 'SELECT'),
        ('service_order_photos', 'service_role', 'INSERT'),
        ('service_order_photos', 'service_role', 'UPDATE'),
        ('service_order_photos', 'service_role', 'DELETE');

    CREATE TEMPORARY TABLE temp_actual_final_grants (
        table_name TEXT,
        grantee TEXT,
        privilege_type TEXT
    ) ON COMMIT DROP;

    -- Consulta estritamente restrita a anon, authenticated e service_role para evitar ruído de outros grantees/owner
    INSERT INTO temp_actual_final_grants
    SELECT table_name, grantee, privilege_type
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND grantee IN ('anon', 'authenticated', 'service_role');

    -- Bidirecional 1: actual EXCEPT expected
    SELECT count(*) INTO v_diff_count
    FROM (
        SELECT * FROM temp_actual_final_grants
        EXCEPT
        SELECT * FROM temp_expected_final_grants
    ) g_diff1;

    IF v_diff_count > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Grants finais reais excedem a matriz esperada (diff=%)', v_diff_count;
    END IF;

    -- Bidirecional 2: expected EXCEPT actual
    SELECT count(*) INTO v_diff_count
    FROM (
        SELECT * FROM temp_expected_final_grants
        EXCEPT
        SELECT * FROM temp_actual_final_grants
    ) g_diff2;

    IF v_diff_count > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Grants finais esperados não foram todos concedidos (diff=%)', v_diff_count;
    END IF;

    -- 7.4 Verificação isolada de PUBLIC = 0 e anon = 0
    SELECT count(*) INTO v_pub_priv_cnt
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND grantee = 'PUBLIC';

    IF v_pub_priv_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Role PUBLIC possui privilégios em tabelas de OS (cnt=%)', v_pub_priv_cnt;
    END IF;

    SELECT count(*) INTO v_anon_priv_cnt
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND grantee = 'anon';

    IF v_anon_priv_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Role anon ainda possui privilégios de tabela (cnt=%)', v_anon_priv_cnt;
    END IF;

    -- 7.5 Validar que service_role NÃO possui privilégios perigosos
    SELECT count(*) INTO v_dangerous_priv_cnt
    FROM information_schema.table_privileges
    WHERE table_schema = 'public'
      AND table_name IN ('service_orders', 'service_order_items', 'service_order_history', 'service_order_photos')
      AND grantee = 'service_role'
      AND privilege_type IN ('TRUNCATE', 'TRIGGER', 'REFERENCES');

    IF v_dangerous_priv_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: service_role possui privilégios perigosos em tabelas de OS (cnt=%)', v_dangerous_priv_cnt;
    END IF;

    -- 7.6 Hardening da função de trigger com revogação também de service_role e search_path estritamente vazio (Item 5)
    SELECT 
        r.rolname,
        p.prosecdef,
        p.proconfig,
        has_function_privilege('public', p.oid, 'EXECUTE'),
        has_function_privilege('anon', p.oid, 'EXECUTE'),
        has_function_privilege('authenticated', p.oid, 'EXECUTE'),
        has_function_privilege('service_role', p.oid, 'EXECUTE')
    INTO 
        v_fn_owner,
        v_fn_secdef,
        v_fn_config,
        v_fn_pub_exec,
        v_fn_anon_exec,
        v_fn_auth_exec,
        v_fn_sr_exec
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'private' AND p.proname = 'enforce_service_orders_invariants';

    IF v_fn_owner <> 'postgres' THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Trigger function owner deve ser postgres (encontrado %)', v_fn_owner;
    END IF;

    IF NOT v_fn_secdef THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Trigger function deve ser SECURITY DEFINER';
    END IF;

    IF NOT ('search_path=' = ANY(v_fn_config) OR 'search_path=""' = ANY(v_fn_config)) THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Trigger function search_path deve ser estritamente vazio (encontrado %)', v_fn_config;
    END IF;

    IF v_fn_pub_exec THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: PUBLIC não pode possuir privilégio EXECUTE na função de trigger';
    END IF;

    IF v_fn_anon_exec THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: anon não pode possuir privilégio EXECUTE na função de trigger';
    END IF;

    IF v_fn_auth_exec THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: authenticated não pode possuir privilégio EXECUTE na função de trigger';
    END IF;

    IF v_fn_sr_exec THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: service_role não pode possuir privilégio EXECUTE direto na função de trigger';
    END IF;

    SELECT count(*) INTO v_trg_cnt
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'service_orders'
      AND t.tgname = 'trg_service_orders_invariants'
      AND NOT t.tgisinternal;

    IF v_trg_cnt <> 1 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Trigger trg_service_orders_invariants não registrado corretamente (cnt=%)', v_trg_cnt;
    END IF;

    -- 7.7 Verificação completa das propriedades da RPC Phase 1A
    SELECT count(*) INTO v_rpc_overloads FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_public_service_order';
    IF v_rpc_overloads <> 1 THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Esperado exatamente 1 overload para get_public_service_order (encontrado %)', v_rpc_overloads;
    END IF;

    SELECT pg_get_userbyid(p.proowner), p.prosecdef, p.proconfig
    INTO v_rpc_owner, v_rpc_secdef, v_rpc_search_path
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.oid = 'public.get_public_service_order(uuid)'::regprocedure;

    IF v_rpc_owner <> 'postgres' OR v_rpc_secdef IS NOT TRUE OR v_rpc_search_path IS DISTINCT FROM ARRAY['search_path=""'] THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Propriedades da RPC public.get_public_service_order(uuid) incorretas';
    END IF;

    SELECT has_function_privilege('anon', 'public.get_public_service_order(uuid)', 'EXECUTE'),
           has_function_privilege('authenticated', 'public.get_public_service_order(uuid)', 'EXECUTE'),
           has_function_privilege('public', 'public.get_public_service_order(uuid)', 'EXECUTE')
    INTO v_rpc_anon_exec, v_rpc_auth_exec, v_rpc_pub_exec;

    IF NOT v_rpc_anon_exec OR NOT v_rpc_auth_exec OR v_rpc_pub_exec THEN
        RAISE EXCEPTION 'PHASE1B_POSTCONDITION_FAIL: Privilégios EXECUTE da RPC get_public_service_order alterados indevidamente (anon=%, auth=%, public=%)',
            v_rpc_anon_exec, v_rpc_auth_exec, v_rpc_pub_exec;
    END IF;
END $$;

COMMIT;