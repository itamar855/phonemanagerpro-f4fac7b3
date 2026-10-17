-- ==============================================================================
-- MIGRATION: PHASE 1C — SUPPLIERS RLS HARDENING
-- Timestamp: 20261016000000
-- Transação: ATÔMICA (BEGIN ... COMMIT)
-- Projeto: CellManagerPro / phonemanagerpro (hzrqtolfbwnmmeliazmh)
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PREFLIGHT READ-ONLY FAIL-CLOSED
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_cnt INTEGER;
    v_null_store_cnt INTEGER;
    v_orphan_store_cnt INTEGER;
BEGIN
    -- 1.1 Verificar existência de public.suppliers
    SELECT count(*) INTO v_cnt FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'suppliers';
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'PHASE1C_PREFLIGHT_FAIL: Tabela public.suppliers não encontrada';
    END IF;

    -- 1.2 Verificar se existem registros com store_id nulo
    SELECT count(*) INTO v_null_store_cnt FROM public.suppliers WHERE store_id IS NULL;
    IF v_null_store_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1C_PREFLIGHT_FAIL: public.suppliers possui % registros com store_id NULL', v_null_store_cnt;
    END IF;

    -- 1.3 Verificar se existem fornecedores com store_id apontando para lojas inexistentes
    SELECT count(*) INTO v_orphan_store_cnt FROM public.suppliers s
    WHERE NOT EXISTS (SELECT 1 FROM public.stores st WHERE st.id = s.store_id);
    IF v_orphan_store_cnt > 0 THEN
        RAISE EXCEPTION 'PHASE1C_PREFLIGHT_FAIL: public.suppliers possui % registros com store_id órfão', v_orphan_store_cnt;
    END IF;

    -- 1.4 Verificar se member_stores existe e tem RLS habilitado
    SELECT count(*) INTO v_cnt FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relname = 'member_stores' AND relrowsecurity IS TRUE;
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'PHASE1C_PREFLIGHT_FAIL: public.member_stores não existe ou não possui RLS ativo';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. DDL ESTRUTURAL
-- ------------------------------------------------------------------------------
-- 2.1 Garantir default auth.uid() para created_by
ALTER TABLE public.suppliers ALTER COLUMN created_by SET DEFAULT auth.uid();

-- 2.2 Tornar store_id estritamente NOT NULL
ALTER TABLE public.suppliers ALTER COLUMN store_id SET NOT NULL;

-- ------------------------------------------------------------------------------
-- 3. REVOGAÇÃO DAS POLICIES LEGADAS PERMISSIVAS
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "suppliers_select" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_insert" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_update" ON public.suppliers;
DROP POLICY IF EXISTS "suppliers_delete" ON public.suppliers;

-- ------------------------------------------------------------------------------
-- 4. NOVAS POLICIES PHASE 1C COM ISOLAMENTO MULTI-TENANT FAIL-CLOSED
-- ------------------------------------------------------------------------------

-- 4.1 SELECT: Usuário autenticado só vê fornecedores da loja em que possui membership
CREATE POLICY "suppliers_select_member_store" ON public.suppliers
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = auth.uid() AND ms.store_id = suppliers.store_id
    )
);

-- 4.2 INSERT: Criador deve ser o próprio usuário autenticado e pertencer à loja do fornecedor
CREATE POLICY "suppliers_insert_member_store" ON public.suppliers
FOR INSERT TO authenticated
WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = auth.uid() AND ms.store_id = suppliers.store_id
    )
);

-- 4.3 UPDATE: Restrito aos membros da loja; valida estado inicial e final impedindo troca de loja
CREATE POLICY "suppliers_update_member_store" ON public.suppliers
FOR UPDATE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = auth.uid() AND ms.store_id = suppliers.store_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = auth.uid() AND ms.store_id = suppliers.store_id
    )
);

-- 4.4 DELETE: Apenas administradores, gerentes ou donos com membership na loja do fornecedor
CREATE POLICY "suppliers_delete_member_role" ON public.suppliers
FOR DELETE TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.member_stores ms
        JOIN public.user_roles ur ON ur.user_id = ms.user_id
        WHERE ms.user_id = auth.uid()
          AND ms.store_id = suppliers.store_id
          AND ur.role::text IN ('dono', 'admin', 'gerente')
    )
);

-- ------------------------------------------------------------------------------
-- 5. POST-CHECK DE INTEGRIDADE DENTRO DA TRANSAÇÃO
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_policy_cnt INTEGER;
    v_is_nullable TEXT;
    v_created_default TEXT;
BEGIN
    -- 5.1 Verificar se existem exatamente 4 policies em public.suppliers
    SELECT count(*) INTO v_policy_cnt FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'suppliers';
    IF v_policy_cnt <> 4 THEN
        RAISE EXCEPTION 'PHASE1C_POSTCHECK_FAIL: Esperado exatamente 4 policies em suppliers (encontrado %)', v_policy_cnt;
    END IF;

    -- 5.2 Confirmar store_id NOT NULL
    SELECT is_nullable INTO v_is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'store_id';
    IF v_is_nullable <> 'NO' THEN
        RAISE EXCEPTION 'PHASE1C_POSTCHECK_FAIL: store_id continua nullable';
    END IF;

    -- 5.3 Confirmar created_by default auth.uid()
    SELECT column_default INTO v_created_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'suppliers' AND column_name = 'created_by';
    IF v_created_default IS NULL OR v_created_default NOT ILIKE '%auth.uid()%' THEN
        RAISE EXCEPTION 'PHASE1C_POSTCHECK_FAIL: created_by não possui default auth.uid() (valor=%)', v_created_default;
    END IF;
END $$;

COMMIT;
