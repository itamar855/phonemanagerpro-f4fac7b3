-- Ponte para o replay do zero (Supabase Preview, banco local).
-- Os dados da loja (CNPJ, telefone, redes, logo, rodapé do PDF) foram criados
-- à mão em produção e nunca entraram numa migration, mas a 20261031000000 e
-- as seguintes já leem essas colunas. Tipos copiados de produção em 2026-11-26.
-- IF NOT EXISTS: em produção não faz nada.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS whatsapp text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS pdf_footer text;
