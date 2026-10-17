-- ==============================================================================
-- PRODUCTION-SPECIFIC DATA BACKFILL
-- DO NOT RUN ON CLEAN/STAGING DATABASES
-- Run only after the commission settlement schema migration
-- and only after revalidating the preflight against the target database.
-- ==============================================================================

DO $$
DECLARE
    v_manifest RECORD;
    v_tx_count INTEGER := 0;
    v_sale_count INTEGER := 0;
    v_dup_check INTEGER;
    v_tx RECORD;
    v_sale RECORD;
BEGIN
    CREATE TEMPORARY TABLE temp_sale_tx_manifest (
        transaction_id UUID NOT NULL,
        sale_id UUID NOT NULL
    ) ON COMMIT DROP;

    -- Manifesto Estático Auditado (19 transações -> 18 vendas distintas)
    INSERT INTO temp_sale_tx_manifest (transaction_id, sale_id) VALUES
        ('94ecf08a-52ea-469b-bb68-8ee24d6dba65', '61433df5-30b5-43ad-8db9-815b55a3410d'),
        ('31369f37-8d06-45f2-b3bd-540461a0c093', 'dc06ab5d-8a23-444c-ba30-17c39efc0308'),
        ('0bdcf159-7af7-4938-a265-f2ddd0c97e7a', '235d89c4-5718-4719-9c2b-c10fc0c8c358'),
        ('d20f7cac-bd55-4d92-8c3f-daf3d86d3e1d', '235d89c4-5718-4719-9c2b-c10fc0c8c358'),
        ('cafef9d2-5300-4041-9b15-97bbe517f507', '8892b9d2-8fb0-4379-8f58-15ac44b0d037'),
        ('34c70d4e-8da5-44af-80be-708a85470651', '5cbc2119-d0a3-4106-b60d-b90c65f2fa81'),
        ('3eb30c3b-3def-4b75-addd-76bbbe7d1431', '69ee72c8-ab7f-4b38-bb04-cf518248a027'),
        ('2a20761f-0017-4bc4-953f-8880422fedd9', 'e39a9d43-d425-45a6-8846-2e6ae6ae006f'),
        ('6142de15-c32c-4e33-8b26-9afe21714556', '8a333557-cf80-4e17-b7f5-1317cb4fa8a2'),
        ('aeededa9-bca1-495e-851c-9ac304ee813c', 'c5df8929-837d-4ec4-b73e-29474392874e'),
        ('32a20e2b-a60a-4de7-a3a3-6c65539fdd1f', '49830c6f-cab2-42d5-88a1-6de9873e0d31'),
        ('27bcbfcc-b261-48ec-b859-d4922b94c6d7', '589a7858-41aa-418a-b0dd-9cf576a98b98'),
        ('4424981e-bba0-4196-8b47-027f085f2824', '4f8fc466-fd60-43d1-9f9b-b92c712d387e'),
        ('d7a25d44-be40-4af9-93c3-ed864020d568', 'e5c94506-2e32-4421-809f-d12935844132'),
        ('b2860e07-e6b3-45ce-adc5-e2fa1f29f378', '212a1333-2b15-4b20-a995-8c1820134b3c'),
        ('3bbed6dc-e6be-4e1b-a058-a444d3109f94', 'd31d4d2e-f09a-4a7d-b10d-d15c8c2674fa'),
        ('75956705-26d0-4bbf-a7e9-51cce73a2519', '09358756-0aee-458a-8a98-dc094642b430'),
        ('cb715f21-cb66-4d45-9ef4-7f3f44d26ec6', 'cfd26f34-8164-46cf-83d5-08eb082c242e'),
        ('8d519f28-200f-4bb2-abca-8f6a5fcb3b95', 'a33458c9-9e59-4cef-86a7-f54ec0e8f08f');

    -- Condição 1: exatamente 19 transactions no manifesto
    SELECT count(*) INTO v_tx_count FROM temp_sale_tx_manifest;
    IF v_tx_count != 19 THEN
        RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Manifesto deve conter exatamente 19 transactions, encontrado %', v_tx_count;
    END IF;

    -- Condição 2: exatamente 18 sales distintas no manifesto
    SELECT count(DISTINCT sale_id) INTO v_sale_count FROM temp_sale_tx_manifest;
    IF v_sale_count != 18 THEN
        RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Manifesto deve conter exatamente 18 sales distintas, encontrado %', v_sale_count;
    END IF;

    -- Condição 10: nenhum transaction_id associado a duas sales diferentes
    SELECT count(*) INTO v_dup_check
    FROM (
        SELECT transaction_id
        FROM temp_sale_tx_manifest
        GROUP BY transaction_id
        HAVING count(DISTINCT sale_id) > 1
    ) sub;
    IF v_dup_check > 0 THEN
        RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Transaction associada a mais de uma sale no manifesto';
    END IF;

    -- Validação das condições 3 a 9 para cada item do manifesto
    FOR v_manifest IN SELECT transaction_id, sale_id FROM temp_sale_tx_manifest LOOP
        -- Condição 3: transaction_id existe
        SELECT id, store_id, product_id, created_by, type, sale_id
        INTO v_tx
        FROM public.transactions
        WHERE id = v_manifest.transaction_id;

        IF v_tx.id IS NULL THEN
            RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Transaction % não encontrada no banco', v_manifest.transaction_id;
        END IF;

        -- Condição 4: sale_id existe
        SELECT id, store_id, product_id, created_by
        INTO v_sale
        FROM public.sales
        WHERE id = v_manifest.sale_id;

        IF v_sale.id IS NULL THEN
            RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Sale % não encontrada no banco', v_manifest.sale_id;
        END IF;

        -- Condição 5: transaction possui type = 'sale'
        IF v_tx.type != 'sale' THEN
            RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Transaction % possui type %, esperado ''sale''', v_tx.id, v_tx.type;
        END IF;

        -- Condição 6: sale_id IS NULL OU já possui exatamente o sale_id esperado (idempotência sem conflito)
        IF v_tx.sale_id IS NOT NULL AND v_tx.sale_id != v_manifest.sale_id THEN
            RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Transaction % já possui sale_id divergente % (esperado %)', v_tx.id, v_tx.sale_id, v_manifest.sale_id;
        END IF;

        -- Condição 7: transaction.product_id = sale.product_id
        IF v_tx.product_id IS DISTINCT FROM v_sale.product_id THEN
            RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Mismatch de product_id entre transaction % (%) e sale % (%)', v_tx.id, v_tx.product_id, v_sale.id, v_sale.product_id;
        END IF;

        -- Condição 8: transaction.store_id = sale.store_id
        IF v_tx.store_id IS DISTINCT FROM v_sale.store_id THEN
            RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Mismatch de store_id entre transaction % (%) e sale % (%)', v_tx.id, v_tx.store_id, v_sale.id, v_sale.store_id;
        END IF;

        -- Condição 9: transaction.created_by = sale.created_by
        IF v_tx.created_by IS DISTINCT FROM v_sale.created_by THEN
            RAISE EXCEPTION 'BACKFILL_PREFLIGHT_FAILED: Mismatch de created_by entre transaction % (%) e sale % (%)', v_tx.id, v_tx.created_by, v_sale.id, v_sale.created_by;
        END IF;
    END LOOP;

    -- Execução idempotente do backfill
    UPDATE public.transactions t
    SET sale_id = m.sale_id
    FROM temp_sale_tx_manifest m
    WHERE t.id = m.transaction_id
      AND t.sale_id IS NULL;

END $$;
