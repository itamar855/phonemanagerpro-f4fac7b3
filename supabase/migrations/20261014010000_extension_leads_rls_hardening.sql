-- ============================================================
-- C3.8 — Migration B: Extension Leads RLS Hardening (Final)
-- Migration: 20261014010000_extension_leads_rls_hardening.sql
--
-- OBJETIVO:
--   Hardening definitivo de segurança após rollout da extensão v10.
--   Ativa RLS nas 3 tabelas, revoga todos os privilégios de anon e public,
--   remove policies antigas inseguras e restringe todo acesso
--   às lojas vinculadas ao operador em member_stores, exigindo
--   consistência de store_id entre registros filhos e pais.
--
-- PRÉ-REQUISITO:
--   100% dos operadores operando na extensão v10 (autenticada).
-- ============================================================

BEGIN;

-- 1. Preflight de integridade estrutural antes do bloqueio
DO $$
BEGIN

-- Verifica que nenhum lead possui store_id nulo
IF EXISTS (
    SELECT 1 FROM public.leads WHERE store_id IS NULL
) THEN
    RAISE EXCEPTION 'C3_8_HARDENING_FAIL: Existem registros em leads com store_id NULL';
END IF;

-- Verifica que nenhuma mensagem possui store_id nulo
IF EXISTS (
    SELECT 1 FROM public.lead_messages WHERE store_id IS NULL
) THEN
    RAISE EXCEPTION 'C3_8_HARDENING_FAIL: Existem registros em lead_messages com store_id NULL';
END IF;

-- Verifica que nenhuma resposta possui store_id nulo
IF EXISTS (
    SELECT 1 FROM public.lead_responses WHERE store_id IS NULL
) THEN
    RAISE EXCEPTION 'C3_8_HARDENING_FAIL: Existem registros em lead_responses com store_id NULL';
END IF;

-- Verifica divergência de store_id entre lead_messages e leads (pai/filho)
IF EXISTS (
    SELECT 1
    FROM public.lead_messages lm
    JOIN public.leads l ON lm.lead_id = l.id
    WHERE lm.store_id <> l.store_id
) THEN
    RAISE EXCEPTION 'C3_8_HARDENING_FAIL: Divergência de store_id entre lead_messages e leads';
END IF;

-- Verifica divergência de store_id entre lead_responses e leads (pai/filho)
IF EXISTS (
    SELECT 1
    FROM public.lead_responses lr
    JOIN public.leads l ON lr.lead_id = l.id
    WHERE lr.store_id <> l.store_id
) THEN
    RAISE EXCEPTION 'C3_8_HARDENING_FAIL: Divergência de store_id entre lead_responses e leads';
END IF;

END $$;

-- 2. Restrição NOT NULL para store_id nas 3 tabelas
ALTER TABLE public.leads
  ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE public.lead_messages
  ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE public.lead_responses
  ALTER COLUMN store_id SET NOT NULL;

-- 3. Ativação de RLS (sem FORCE RLS para preservar owner/service_role)
ALTER TABLE public.leads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_responses  ENABLE ROW LEVEL SECURITY;

-- 4. Revogação de acesso de anon e public (FINAL_ANON_ACCESS = NONE)
REVOKE ALL ON public.leads          FROM anon, public;
REVOKE ALL ON public.lead_messages  FROM anon, public;
REVOKE ALL ON public.lead_responses FROM anon, public;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads          TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_messages  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_responses TO authenticated;

-- 5. Remoção de policies antigas inseguras
DROP POLICY IF EXISTS "ERP_Ver_Leads"          ON public.leads;
DROP POLICY IF EXISTS "ERP_Editar_Leads"        ON public.leads;
DROP POLICY IF EXISTS "ERP_Deletar_Leads"       ON public.leads;
DROP POLICY IF EXISTS "Extensao_Captura_Leads"  ON public.leads;
DROP POLICY IF EXISTS "Allow authenticated users to read leads"   ON public.leads;
DROP POLICY IF EXISTS "Allow authenticated users to insert leads" ON public.leads;
DROP POLICY IF EXISTS "Allow authenticated users to update leads" ON public.leads;
DROP POLICY IF EXISTS "Allow authenticated users to delete leads" ON public.leads;
DROP POLICY IF EXISTS "leads_anon_insert_capture"                 ON public.leads;

-- 6. Policies para authenticated (store-scoped)

-- 5.1 leads
CREATE POLICY "leads_select_own_store"
  ON public.leads FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()));

CREATE POLICY "leads_insert_own_store"
  ON public.leads FOR INSERT TO authenticated
  WITH CHECK (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()));

CREATE POLICY "leads_update_own_store"
  ON public.leads FOR UPDATE TO authenticated
  USING  (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()))
  WITH CHECK (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()));

CREATE POLICY "leads_delete_own_store"
  ON public.leads FOR DELETE TO authenticated
  USING (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()));

-- 5.2 lead_messages (consistência pai/filho)
CREATE POLICY "lead_messages_select_own_store"
  ON public.lead_messages FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()));

CREATE POLICY "lead_messages_insert_own_store"
  ON public.lead_messages FOR INSERT TO authenticated
  WITH CHECK (
    store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_messages.lead_id
        AND l.store_id = lead_messages.store_id
    )
  );

CREATE POLICY "lead_messages_update_own_store"
  ON public.lead_messages FOR UPDATE TO authenticated
  USING  (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()))
  WITH CHECK (
    store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_messages.lead_id
        AND l.store_id = lead_messages.store_id
    )
  );

CREATE POLICY "lead_messages_delete_own_store"
  ON public.lead_messages FOR DELETE TO authenticated
  USING (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()));

-- 5.3 lead_responses (consistência pai/filho)
CREATE POLICY "lead_responses_select_own_store"
  ON public.lead_responses FOR SELECT TO authenticated
  USING (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()));

CREATE POLICY "lead_responses_insert_own_store"
  ON public.lead_responses FOR INSERT TO authenticated
  WITH CHECK (
    store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_responses.lead_id
        AND l.store_id = lead_responses.store_id
    )
  );

CREATE POLICY "lead_responses_update_own_store"
  ON public.lead_responses FOR UPDATE TO authenticated
  USING  (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()))
  WITH CHECK (
    store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_responses.lead_id
        AND l.store_id = lead_responses.store_id
    )
  );

CREATE POLICY "lead_responses_delete_own_store"
  ON public.lead_responses FOR DELETE TO authenticated
  USING (store_id IN (SELECT store_id FROM public.member_stores WHERE user_id = auth.uid()));

COMMIT;

-- ============================================================
-- FIM DA MIGRATION B
-- NÃO APLICAR REMOTAMENTE ATÉ CONFIRMAÇÃO DE ROLLOUT DA V10
-- ============================================================
