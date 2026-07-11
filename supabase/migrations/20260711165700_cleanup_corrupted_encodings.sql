-- Clean up existing database entries that were inserted with corrupted UTF-8 encodings
UPDATE public.transactions
SET description = replace(description, 'â€“', '–')
WHERE description LIKE '%â€“%';

UPDATE public.transactions
SET description = replace(description, 'ManutenÃ§Ã£o', 'Manutenção')
WHERE description LIKE '%ManutenÃ§Ã£o%';

UPDATE public.transactions
SET category = 'Manutenção'
WHERE category = 'ManutenÃ§Ã£o';

UPDATE public.cash_entries
SET description = replace(description, 'â€“', '–')
WHERE description LIKE '%â€“%';

UPDATE public.cash_entries
SET description = replace(description, 'ManutenÃ§Ã£o', 'Manutenção')
WHERE description LIKE '%ManutenÃ§Ã£o%';
