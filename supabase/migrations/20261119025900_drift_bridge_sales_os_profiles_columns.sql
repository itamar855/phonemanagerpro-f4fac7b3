-- Ponte para o replay do zero (Supabase Preview, banco local).
-- Colunas criadas à mão em produção que nunca entraram numa migration, mas que
-- o app e as migrations seguintes (a partir da 20261119030000) usam.
-- Tipos e defaults copiados de produção em 2026-11-26.
-- IF NOT EXISTS: em produção não faz nada.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb;

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_birth date,
  ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS installments integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS seller_id uuid;

ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS technician text,
  ADD COLUMN IF NOT EXISTS payment_cash numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_card numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_pix numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_other numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_notes text,
  ADD COLUMN IF NOT EXISTS device_is_off boolean DEFAULT false;
