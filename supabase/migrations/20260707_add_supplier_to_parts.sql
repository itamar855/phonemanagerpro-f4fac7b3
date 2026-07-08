-- ============================================================
-- Adicionar supplier_id e supplier_name nas tabelas de peças
-- ============================================================

-- 1. Tabela service_order_items (Peças da OS)
ALTER TABLE public.service_order_items
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT;

-- 2. Tabela product_repair_items (Peças de Reparo do Estoque)
ALTER TABLE public.product_repair_items
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_name TEXT;

-- Forçar reload do schema cache
NOTIFY pgrst, 'reload schema';
