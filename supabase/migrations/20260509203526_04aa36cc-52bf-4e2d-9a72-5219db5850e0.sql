-- 1. Clientes
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS birth_date DATE,
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);

-- 2. Contas Bancárias
-- Esta migration nunca rodou em produção como foi escrita: lá não existe
-- bank_accounts, e store_bank_accounts continua sendo tabela (não view).
-- As colunas de taxa foram criadas direto em store_bank_accounts. Ajustado em
-- 2026-11-26 para o replay do zero (Supabase Preview) chegar no mesmo lugar.
ALTER TABLE public.store_bank_accounts
ADD COLUMN IF NOT EXISTS credit_fee_percent NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS credit_settlement_days INTEGER DEFAULT 30,
ADD COLUMN IF NOT EXISTS debit_fee_percent NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS debit_settlement_days INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS pix_fee_percent NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS pix_settlement_days INTEGER DEFAULT 0;

-- 4. Profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES public.stores(id);