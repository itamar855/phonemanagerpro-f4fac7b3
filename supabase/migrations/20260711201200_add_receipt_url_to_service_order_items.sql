-- Adicionar coluna receipt_url na tabela service_order_items para armazenar comprovantes de peças avulsas
ALTER TABLE public.service_order_items
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Notificar PostgREST para recarregar o schema cache
NOTIFY pgrst, 'reload schema';
