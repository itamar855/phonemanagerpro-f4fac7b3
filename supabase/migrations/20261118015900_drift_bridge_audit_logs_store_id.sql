-- Ponte para o replay do zero (Supabase Preview, banco local).
-- audit_logs.store_id foi criado à mão em produção e nunca entrou numa
-- migration, mas a 20261118020000 (isolamento por loja) já usa a coluna.
-- Tipo e FK copiados de produção em 2026-11-26.
-- IF NOT EXISTS: em produção não faz nada.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id);
