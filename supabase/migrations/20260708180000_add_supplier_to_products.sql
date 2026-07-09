-- ============================================================
-- Adicionar fornecedor (supplier_id/supplier_name) na tabela public.products
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT;

-- Forçar reload do schema cache
NOTIFY pgrst, 'reload schema';
