-- Adicionar coluna receipt_url na tabela service_orders para armazenar comprovantes de pagamento
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Notificar PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
