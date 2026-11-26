-- Ponte para o replay do zero (Supabase Preview, banco local).
-- cash_entries, accessories e member_stores foram criadas fora das migrations
-- (em produção já existem), mas as migrations seguintes já mexem nelas.
-- Definição copiada de produção em 2026-11-26 (colunas, checks e FKs).
-- IF NOT EXISTS: em produção não faz nada.

CREATE TABLE IF NOT EXISTS public.cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_register_id uuid NOT NULL REFERENCES public.cash_registers(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id),
  type text NOT NULL CHECK (type = ANY (ARRAY['entrada', 'saida', 'sangria', 'abertura', 'fechamento'])),
  payment_method text CHECK (payment_method = ANY (ARRAY['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'transferencia', 'outro'])),
  amount numeric(12,2) NOT NULL,
  description text NOT NULL,
  receipt_url text,
  receipt_required boolean NOT NULL DEFAULT true,
  reference_id uuid,
  reference_type text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed boolean DEFAULT false,
  supplier_order_receipt_url text
);
ALTER TABLE public.cash_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.accessories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'outro'
    CHECK (category = ANY (ARRAY['carregador', 'cabo', 'capa', 'pelicula', 'fone', 'peca', 'ferramenta', 'outro'])),
  brand text,
  quantity integer NOT NULL DEFAULT 0,
  min_quantity integer NOT NULL DEFAULT 5,
  cost_price numeric(12,2) NOT NULL DEFAULT 0,
  sale_price numeric(12,2),
  description text,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.accessories ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.member_stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, store_id)
);
ALTER TABLE public.member_stores ENABLE ROW LEVEL SECURITY;

-- 20260331051600_reconcile_data usa transactions.status, que só é criada na
-- 20260331053000_sync_caixa_transactions. Mesma definição de lá, adiantada.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
