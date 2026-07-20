-- Migration to support full sale rollback

-- Add metadata column to transactions to store cart items for PDV
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add reference_id to cash_entries to firmly link them to sales/transactions
ALTER TABLE public.cash_entries ADD COLUMN IF NOT EXISTS reference_id UUID;
