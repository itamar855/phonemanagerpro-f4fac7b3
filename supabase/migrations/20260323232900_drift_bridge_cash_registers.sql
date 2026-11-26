-- Ponte para o replay do zero (Supabase Preview, banco local).
-- Em produção cash_registers já existia (criada fora das migrations) quando a
-- 20260323233000_enterprise_phase1 rodou, então o CREATE TABLE IF NOT EXISTS
-- de lá foi pulado e a tabela ficou com colunas diferentes (opened_by,
-- opening_amount, ...), que o app e a 20261117010000 usam. Criar aqui com a
-- definição de produção (copiada em 2026-11-26) faz o replay seguir o mesmo
-- caminho. IF NOT EXISTS: em produção não faz nada.
CREATE TABLE IF NOT EXISTS public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  opened_by uuid NOT NULL REFERENCES auth.users(id),
  closed_by uuid REFERENCES auth.users(id),
  opening_amount numeric(12,2) NOT NULL DEFAULT 0,
  closing_amount numeric(12,2),
  expected_amount numeric(12,2),
  difference numeric(12,2),
  difference_reason text,
  status text NOT NULL DEFAULT 'open' CHECK (status = ANY (ARRAY['open', 'closed'])),
  opening_note text,
  closing_note text,
  opening_receipt_url text,
  closing_receipt_url text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
