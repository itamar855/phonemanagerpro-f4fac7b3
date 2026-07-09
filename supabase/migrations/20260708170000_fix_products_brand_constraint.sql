-- Drop the check constraint that limits the allowed brands on products table
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_brand_check;
