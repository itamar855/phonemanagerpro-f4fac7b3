-- Ponte para o replay do zero (Supabase Preview, banco local).
-- lead_messages e lead_responses (CRM antigo) foram criadas à mão em produção
-- e nunca entraram numa migration, mas as migrations seguintes mexem nelas
-- (20260331, 20261014*, 20261114200100) até a 20261117000000 apagá-las.
-- Colunas tiradas do types.ts gerado na época (commit ed9c0f6).
--
-- Só roda num banco "novo": se o CRM novo (crm_contacts) já existe, é
-- produção (ou cópia dela), onde essas tabelas já foram apagadas de
-- propósito, e aqui não faz nada.
DO $$
BEGIN
  IF to_regclass('public.crm_contacts') IS NOT NULL THEN
    RETURN;
  END IF;

  CREATE TABLE IF NOT EXISTS public.lead_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    sender text NOT NULL,
    content text,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS public.lead_responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    content text NOT NULL,
    status text NOT NULL DEFAULT 'pendente',
    created_at timestamptz NOT NULL DEFAULT now()
  );
END $$;
