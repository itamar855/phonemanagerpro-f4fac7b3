-- ============================================================
-- Fix: Remove duplicate PF bank accounts
-- PF accounts must be unique (one person) and NOT tied to any store.
-- ============================================================

-- Step 1: Remove NOT NULL constraint from store_id 
-- (PF accounts are global/personal and do not belong to any store)
ALTER TABLE store_bank_accounts ALTER COLUMN store_id DROP NOT NULL;

-- Step 2: For each group of PF accounts with the same bank_name,
-- keep the oldest one and redirect all transactions to it
DO $$
DECLARE
  rec RECORD;
  keep_id UUID;
  dup_id UUID;
BEGIN
  FOR rec IN
    SELECT bank_name, COUNT(*) as cnt
    FROM store_bank_accounts
    WHERE owner_type = 'PF'
    GROUP BY bank_name
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Fixing duplicate PF account: % (%)', rec.bank_name, rec.cnt;

    SELECT id INTO keep_id
    FROM store_bank_accounts
    WHERE owner_type = 'PF' AND bank_name = rec.bank_name
    ORDER BY created_at ASC
    LIMIT 1;

    FOR dup_id IN
      SELECT id FROM store_bank_accounts
      WHERE owner_type = 'PF'
        AND bank_name = rec.bank_name
        AND id <> keep_id
    LOOP
      RAISE NOTICE '  Redirecting account % -> %', dup_id, keep_id;

      UPDATE transactions
      SET source_account_id = keep_id
      WHERE source_account_id = dup_id;

      UPDATE transactions
      SET destination_account_id = keep_id
      WHERE destination_account_id = dup_id;

      DELETE FROM store_bank_accounts WHERE id = dup_id;
    END LOOP;

    UPDATE store_bank_accounts SET store_id = NULL WHERE id = keep_id;
  END LOOP;
END;
$$;

-- Step 3: Clear store_id from any remaining PF accounts
UPDATE store_bank_accounts
SET store_id = NULL
WHERE owner_type = 'PF' AND store_id IS NOT NULL;
