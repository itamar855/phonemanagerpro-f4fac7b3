-- Migration: Adicionar comprovante do pedido ao fornecedor
-- Separado do comprovante de pagamento (receipt_url já existente)

-- 1. service_order_items: comprovante do pedido feito ao fornecedor
ALTER TABLE public.service_order_items
  ADD COLUMN IF NOT EXISTS supplier_order_receipt_url TEXT;

-- 2. cash_entries: comprovante do pedido ao fornecedor (para confirmação retroativa no financeiro)
ALTER TABLE public.cash_entries
  ADD COLUMN IF NOT EXISTS supplier_order_receipt_url TEXT;

-- Notificar PostgREST para recarregar schema cache
NOTIFY pgrst, 'reload schema';
