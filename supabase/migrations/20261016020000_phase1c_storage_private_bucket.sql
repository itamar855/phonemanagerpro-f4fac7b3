-- ==============================================================================
-- MIGRATION: PHASE 1C (PARTE 2 - PASSO 2) — STORAGE COMPROVANTES PRIVATE BUCKET
-- Timestamp: 20261016020000
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
BEGIN
    -- 1.1 Verificar existência do bucket comprovantes
    SELECT count(*) INTO v_cnt FROM storage.buckets WHERE id = 'comprovantes';
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'PHASE1C_STORAGE_PREFLIGHT_FAIL: Bucket comprovantes não encontrado';
    END IF;

    -- 1.2 Verificar se a função can_access_comprovante existe
    SELECT count(*) INTO v_cnt FROM pg_proc
    WHERE proname = 'can_access_comprovante' AND pronamespace = 'public'::regnamespace;
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'PHASE1C_STORAGE_PREFLIGHT_FAIL: Função can_access_comprovante ausente';
    END IF;

    -- 1.3 Verificar se storage.objects possui RLS ativo
    SELECT count(*) INTO v_cnt FROM pg_class
    WHERE relnamespace = 'storage'::regnamespace AND relname = 'objects' AND relrowsecurity IS TRUE;
    IF v_cnt <> 1 THEN
        RAISE EXCEPTION 'PHASE1C_STORAGE_PREFLIGHT_FAIL: storage.objects não possui RLS ativo';
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. ALTERAR BUCKET PARA PRIVADO
-- ------------------------------------------------------------------------------
UPDATE storage.buckets
SET public = false
WHERE id = 'comprovantes';

-- ------------------------------------------------------------------------------
-- 3. REMOVER POLÍTICAS PÚBLICAS PERMISSIVAS LEGADAS DE LEITURA
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "Comprovantes sao publicos" ON storage.objects;
DROP POLICY IF EXISTS "Public Access to comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can view comprovantes" ON storage.objects;

-- ------------------------------------------------------------------------------
-- 4. CRIAR POLÍTICA DE LEITURA AUTORIZADA POR LOJA E PAPEL
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "comprovantes_select_authorized" ON storage.objects;

CREATE POLICY "comprovantes_select_authorized"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'comprovantes'
  AND public.can_access_comprovante(name) IS TRUE
);

-- ------------------------------------------------------------------------------
-- 5. VALIDAÇÃO PÓS-EXECUÇÃO
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_is_public BOOLEAN;
    v_policy_cnt INTEGER;
    v_legacy_cnt INTEGER;
BEGIN
    -- 5.1 Verificar se o bucket é estritamente privado
    SELECT public INTO v_is_public FROM storage.buckets WHERE id = 'comprovantes';
    IF v_is_public IS NOT FALSE THEN
        RAISE EXCEPTION 'PHASE1C_STORAGE_POST_FAIL: Bucket comprovantes ainda está público';
    END IF;

    -- 5.2 Verificar se a política autorizada existe
    SELECT count(*) INTO v_policy_cnt FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'comprovantes_select_authorized';
    IF v_policy_cnt <> 1 THEN
        RAISE EXCEPTION 'PHASE1C_STORAGE_POST_FAIL: Política comprovantes_select_authorized não criada';
    END IF;

    -- 5.3 Verificar se políticas públicas legadas foram removidas
    SELECT count(*) INTO v_legacy_cnt FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN ('Comprovantes sao publicos', 'Public Access to comprovantes', 'Authenticated can view comprovantes');
    IF v_legacy_cnt <> 0 THEN
        RAISE EXCEPTION 'PHASE1C_STORAGE_POST_FAIL: Políticas públicas legadas ainda presentes: %', v_legacy_cnt;
    END IF;
END $$;

COMMIT;
