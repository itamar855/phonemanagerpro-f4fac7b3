-- ============================================================
-- Fix: Remove duplicate PF bank accounts
-- PF accounts must be unique (one person) and NOT tied to any store.
-- ============================================================

-- Step 1: For each group of PF accounts with the same bank_name,
-- keep the oldest one (first created) and update all transactions
-- that reference the duplicate account IDs to point to the kept account.

DO $$
DECLARE
  rec RECORD;
  keep_id UUID;
  dup_id UUID;
BEGIN
  -- Loop over each distinct PF bank name that has more than one record
  FOR rec IN
    SELECT bank_name, COUNT(*) as cnt
    FROM store_bank_accounts
    WHERE owner_type = 'PF'
    GROUP BY bank_name
    HAVING COUNT(*) > 1
  LOOP
    RAISE NOTICE 'Fixing duplicate PF account: % (%)', rec.bank_name, rec.cnt;

    -- Pick the oldest (canonical) account to keep
    SELECT id INTO keep_id
    FROM store_bank_accounts
    WHERE owner_type = 'PF' AND bank_name = rec.bank_name
    ORDER BY created_at ASC
    LIMIT 1;

    -- Update all transactions referencing duplicate accounts to use the kept account
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

      -- Delete the duplicate account record
      DELETE FROM store_bank_accounts WHERE id = dup_id;
    END LOOP;

    -- Also ensure the kept account has store_id = NULL
    UPDATE store_bank_accounts
    SET store_id = NULL
    WHERE id = keep_id;

  END LOOP;
END;
$$;

-- Step 2: For any remaining PF accounts that still have a store_id, clear it
UPDATE store_bank_accounts
SET store_id = NULL
WHERE owner_type = 'PF' AND store_id IS NOT NULL;

-- Verify
SELECT id, bank_name, owner_type, store_id, created_at
FROM store_bank_accounts
WHERE owner_type = 'PF'
ORDER BY bank_name, created_at;
