-- ============================================================
-- C3.8 — Migration A: Extension Leads Schema Bridge
-- Migration: 20261014000000_extension_leads_schema_bridge.sql
--
-- OBJETIVO:
--   Compatibilidade transitória de schema (Zero Downtime).
--   Adiciona colunas store_id com FK para public.stores(id),
--   executa backfill inicial e cria índices de suporte.
--
-- GARANTIAS:
--   - RLS NÃO é alterado nesta fase.
--   - Grants e policies de anon NÃO são tocados.
--   - Extensão legada CONTINUA FUNCIONANDO normalmente.
--   - Extensão v10 passa a ser 100% compatível com as colunas do schema.
-- ============================================================

-- 1. ADD COLUMN store_id com Foreign Key para stores(id)
ALTER TABLE public.lead_messages
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id);

ALTER TABLE public.lead_responses
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id);

-- 2. BACKFILL store_id via leads.store_id
UPDATE public.lead_messages lm
SET    store_id = l.store_id
FROM   public.leads l
WHERE  lm.lead_id  = l.id
  AND  lm.store_id IS NULL
  AND  l.store_id IS NOT NULL;

UPDATE public.lead_responses lr
SET    store_id = l.store_id
FROM   public.leads l
WHERE  lr.lead_id  = l.id
  AND  lr.store_id IS NULL
  AND  l.store_id IS NOT NULL;

-- 3. Preflight Fail-Closed pós-backfill
-- Garante que nenhuma mensagem/resposta filha de um lead com loja permaneça órfã
DO $$
BEGIN

IF EXISTS (
    SELECT 1
    FROM public.lead_messages lm
    JOIN public.leads l ON lm.lead_id = l.id
    WHERE l.store_id IS NOT NULL AND lm.store_id IS NULL
) THEN
    RAISE EXCEPTION 'C3_8_BRIDGE_FAIL: lead_messages possui registros com store_id não propagado após backfill';
END IF;

IF EXISTS (
    SELECT 1
    FROM public.lead_responses lr
    JOIN public.leads l ON lr.lead_id = l.id
    WHERE l.store_id IS NOT NULL AND lr.store_id IS NULL
) THEN
    RAISE EXCEPTION 'C3_8_BRIDGE_FAIL: lead_responses possui registros com store_id não propagado após backfill';
END IF;

END $$;

-- 4. Índices de Suporte
CREATE INDEX IF NOT EXISTS idx_member_stores_user_id   ON public.member_stores (user_id);
CREATE INDEX IF NOT EXISTS idx_member_stores_store_id  ON public.member_stores (store_id);
CREATE INDEX IF NOT EXISTS idx_leads_store_id          ON public.leads (store_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_store_id  ON public.lead_messages (store_id);
CREATE INDEX IF NOT EXISTS idx_lead_messages_lead_id   ON public.lead_messages (lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_responses_store_id ON public.lead_responses (store_id);
CREATE INDEX IF NOT EXISTS idx_lead_responses_lead_id  ON public.lead_responses (lead_id);

-- ============================================================
-- FIM DA MIGRATION A
-- NÃO APLICAR REMOTAMENTE ATÉ AUTORIZAÇÃO EXPLÍCITA
-- ============================================================
