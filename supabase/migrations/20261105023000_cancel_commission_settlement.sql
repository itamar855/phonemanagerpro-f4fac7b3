-- ==============================================================================
-- MIGRATION: 20261105023000_cancel_commission_settlement.sql
-- DESCRIÇÃO:
-- 1. Suporte auditável a anulação/estorno de liquidações de comissão (status 'cancelled' + snapshot).
-- 2. RPC atômica public.cancel_commission_settlement com reversão financeira segura (Caixa aberto vs. fechado + DRE).
-- 3. Alinhamento server-side em public.settle_commissions bloqueando OS com comissão anulada ou pendente no Caixa.
-- ==============================================================================

BEGIN;

-- 1. EVOLUÇÃO DE SCHEMA EM public.commission_settlements
DO $$
DECLARE
    v_con_name TEXT;
BEGIN
    FOR v_con_name IN
        SELECT c.conname
        FROM pg_catalog.pg_constraint c
        JOIN pg_catalog.pg_class t ON t.oid = c.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname = 'commission_settlements'
          AND c.contype = 'c'
          AND pg_catalog.pg_get_constraintdef(c.oid) ILIKE '%status%'
    LOOP
        EXECUTE pg_catalog.format('ALTER TABLE public.commission_settlements DROP CONSTRAINT %I', v_con_name);
    END LOOP;
END $$;

ALTER TABLE public.commission_settlements
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id),
    ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
    ADD COLUMN IF NOT EXISTS cancelled_items_snapshot JSONB;

ALTER TABLE public.commission_settlements
    ADD CONSTRAINT commission_settlements_status_check
    CHECK (status IN ('paid', 'cancelled'));

-- 2. ATUALIZAÇÃO DA RPC public.settle_commissions COM TRAVAS SERVER-SIDE DE COMISSÃO ANULADA E CAIXA CONFIRMADO
CREATE OR REPLACE FUNCTION public.settle_commissions(p_payload pg_catalog.jsonb)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_perms pg_catalog.jsonb;
    v_is_admin BOOLEAN;
    v_has_finance_perm BOOLEAN;

    v_store_id UUID;
    v_user_id UUID;
    v_period_start DATE;
    v_period_end DATE;
    v_payment_method TEXT;
    v_source_type TEXT;
    v_source_account_id UUID;
    v_notes TEXT;
    v_receipt_url TEXT;

    v_sales_ids pg_catalog.jsonb;
    v_os_ids pg_catalog.jsonb;
    v_elem pg_catalog.jsonb;
    v_current_id UUID;

    v_total_sales_comm NUMERIC(12,2) := 0;
    v_total_service_comm NUMERIC(12,2) := 0;
    v_total_amount NUMERIC(12,2) := 0;

    v_settlement_id UUID;
    v_cash_reg_id UUID := NULL;
    v_cash_entry_id UUID := NULL;
    v_transaction_id UUID := NULL;

    v_user_name TEXT := 'Colaborador';

    v_sale_rec RECORD;
    v_os_rec RECORD;
    v_sale_date DATE;
    v_os_date DATE;
    v_os_parts_cost NUMERIC(12,2);
    v_os_gross NUMERIC(12,2);
    v_os_profit NUMERIC(12,2);
    v_os_comm_pct NUMERIC(5,2);
    v_os_comm_amt NUMERIC(12,2);
    v_os_comm_on_services BOOLEAN;
    v_open_regs_count INTEGER;
    v_last_reopen_at TIMESTAMPTZ;
    v_confirmed_entries INTEGER;
    v_unconfirmed_entries INTEGER;

    v_items_count INTEGER := 0;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão inválida ou usuário não autenticado';
    END IF;

    v_store_id := (p_payload->>'store_id')::UUID;
    v_user_id := (p_payload->>'user_id')::UUID;
    v_period_start := (p_payload->>'period_start')::DATE;
    v_period_end := (p_payload->>'period_end')::DATE;
    v_payment_method := p_payload->>'payment_method';
    v_source_type := p_payload->>'source_type';
    v_source_account_id := (p_payload->>'source_account_id')::UUID;
    v_notes := p_payload->>'notes';
    v_receipt_url := p_payload->>'receipt_url';
    v_sales_ids := COALESCE(p_payload->'sale_ids', '[]'::pg_catalog.jsonb);
    v_os_ids := COALESCE(p_payload->'service_order_ids', '[]'::pg_catalog.jsonb);

    IF v_store_id IS NULL OR v_user_id IS NULL OR v_period_start IS NULL OR v_period_end IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENTS: store_id, user_id, period_start e period_end são obrigatórios';
    END IF;

    IF v_payment_method NOT IN ('dinheiro', 'pix', 'transferencia') THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_METHOD: Método de pagamento % inválido. Métodos aceitos: dinheiro, pix, transferencia', v_payment_method;
    END IF;

    IF v_source_type NOT IN ('caixa', 'banco') THEN
        RAISE EXCEPTION 'INVALID_SOURCE_TYPE: source_type deve ser "caixa" ou "banco"';
    END IF;

    SELECT ur.role, ur.permissions INTO v_caller_role, v_caller_perms
    FROM public.user_roles ur
    WHERE ur.user_id = v_caller_id
    LIMIT 1;

    v_is_admin := (v_caller_role = 'admin');
    v_has_finance_perm := (v_caller_perms->>'gerenciar_financeiro')::boolean IS TRUE;

    IF NOT (v_is_admin OR (v_caller_role = 'gerente' AND v_has_finance_perm)) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Apenas administradores ou gerentes com permissão gerenciar_financeiro podem liquidar comissões';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = v_caller_id AND ms.store_id = v_store_id
    ) THEN
        RAISE EXCEPTION 'STORE_MISMATCH: O operador solicitante não possui vínculo ativo (member_stores) com a loja indicada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.member_stores WHERE user_id = v_user_id AND store_id = v_store_id
    ) THEN
        RAISE EXCEPTION 'STORE_MISMATCH: O colaborador beneficiário não possui vínculo (member_stores) com a loja indicada';
    END IF;

    SELECT COALESCE(display_name, 'Colaborador') INTO v_user_name
    FROM public.profiles
    WHERE user_id = v_user_id;

    IF v_payment_method = 'dinheiro' THEN
        IF v_source_type != 'caixa' THEN
            RAISE EXCEPTION 'INVALID_SOURCE: Pagamentos em dinheiro devem ter source_type = "caixa"';
        END IF;

        v_cash_reg_id := (p_payload->>'cash_register_id')::UUID;

        IF v_cash_reg_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.cash_registers
                WHERE id = v_cash_reg_id AND store_id = v_store_id AND status = 'open'
            ) THEN
                RAISE EXCEPTION 'INVALID_CASH_REGISTER: Caixa informado % não está aberto ou não pertence à loja indicada', v_cash_reg_id;
            END IF;
        ELSE
            SELECT pg_catalog.count(id) INTO v_open_regs_count
            FROM public.cash_registers
            WHERE store_id = v_store_id AND status = 'open';

            IF v_open_regs_count = 0 THEN
                RAISE EXCEPTION 'NO_OPEN_CASH_REGISTER: Não há caixa aberto na loja indicada para efetuar pagamento em dinheiro';
            ELSIF v_open_regs_count = 1 THEN
                SELECT id INTO v_cash_reg_id
                FROM public.cash_registers
                WHERE store_id = v_store_id AND status = 'open'
                LIMIT 1;
            ELSE
                RAISE EXCEPTION 'MULTIPLE_OPEN_CASH_REGISTERS: Existem % caixas abertos na loja. É obrigatório selecionar explicitamente o cash_register_id a ser debitado', v_open_regs_count;
            END IF;
        END IF;
    ELSE
        IF v_source_type != 'banco' THEN
            RAISE EXCEPTION 'INVALID_SOURCE: Pagamentos via % devem ter source_type = "banco"', v_payment_method;
        END IF;

        IF v_source_account_id IS NULL THEN
            RAISE EXCEPTION 'SOURCE_ACCOUNT_REQUIRED: Conta bancária de origem é obrigatória para pagamento via %', v_payment_method;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM public.store_bank_accounts
            WHERE id = v_source_account_id AND store_id = v_store_id
        ) THEN
            RAISE EXCEPTION 'ACCOUNT_NOT_FOUND: Conta bancária selecionada não pertence à loja da liquidação ou não existe';
        END IF;
    END IF;

    IF pg_catalog.jsonb_array_length(v_sales_ids) = 0 AND pg_catalog.jsonb_array_length(v_os_ids) = 0 THEN
        RAISE EXCEPTION 'NO_ITEMS: Nenhuma venda ou OS informada para liquidação';
    END IF;

    INSERT INTO public.commission_settlements (
        store_id, user_id, period_start, period_end,
        total_sales_commission, total_service_commission, total_amount,
        payment_method, source_type, cash_register_id,
        source_account_id, status, paid_at, receipt_url,
        notes, created_by
    ) VALUES (
        v_store_id, v_user_id, v_period_start, v_period_end,
        0, 0, 0,
        v_payment_method, v_source_type, v_cash_reg_id,
        v_source_account_id, 'paid', pg_catalog.now(), v_receipt_url,
        v_notes, v_caller_id
    ) RETURNING id INTO v_settlement_id;

    -- PROCESSAR VENDAS
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(v_sales_ids)
    LOOP
        v_current_id := (v_elem#>>'{}')::UUID;

        IF EXISTS (SELECT 1 FROM public.commission_settlement_items WHERE sale_id = v_current_id) THEN
            RAISE EXCEPTION 'SALE_ALREADY_SETTLED: A venda % já foi liquidada anteriormente', v_current_id;
        END IF;

        SELECT s.id, s.store_id, s.created_by, s.sale_price, s.discount,
               s.commission_percent, s.commission_value, s.product_id, s.created_at
        INTO v_sale_rec
        FROM public.sales s
        WHERE s.id = v_current_id
        FOR UPDATE;

        IF v_sale_rec.id IS NULL THEN
            RAISE EXCEPTION 'SALE_NOT_FOUND: Venda % não encontrada', v_current_id;
        END IF;

        IF v_sale_rec.store_id != v_store_id THEN
            RAISE EXCEPTION 'STORE_MISMATCH: Venda % pertence a outra loja', v_current_id;
        END IF;

        IF v_sale_rec.created_by != v_user_id THEN
            RAISE EXCEPTION 'OWNER_MISMATCH: Venda % pertence a outro colaborador', v_current_id;
        END IF;

        v_sale_date := (v_sale_rec.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE;
        IF v_sale_date < v_period_start OR v_sale_date > v_period_end THEN
            RAISE EXCEPTION 'SALE_OUTSIDE_PERIOD: A venda % (data Brasília: %) está fora do período de apuração (% a %)',
                v_current_id, v_sale_date, v_period_start, v_period_end;
        END IF;

        IF COALESCE(v_sale_rec.commission_value, 0) <= 0 THEN
            RAISE EXCEPTION 'SALE_COMMISSION_ZERO: Venda % não possui comissão positiva elegível (commission_value: %)',
                v_current_id, COALESCE(v_sale_rec.commission_value, 0);
        END IF;

        INSERT INTO public.commission_settlement_items (
            settlement_id, item_type, sale_id,
            gross_amount, cost_amount, profit_amount,
            commission_percent, commission_amount
        ) VALUES (
            v_settlement_id, 'sale', v_sale_rec.id,
            COALESCE(v_sale_rec.sale_price, 0),
            NULL,
            NULL,
            COALESCE(v_sale_rec.commission_percent, 0),
            COALESCE(v_sale_rec.commission_value, 0)
        );

        v_total_sales_comm := v_total_sales_comm + COALESCE(v_sale_rec.commission_value, 0);
        v_items_count := v_items_count + 1;
    END LOOP;

    -- PROCESSAR ORDENS DE SERVIÇO
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(v_os_ids)
    LOOP
        v_current_id := (v_elem#>>'{}')::UUID;

        IF EXISTS (SELECT 1 FROM public.commission_settlement_items WHERE service_order_id = v_current_id) THEN
            RAISE EXCEPTION 'OS_ALREADY_SETTLED: A OS % já foi liquidada anteriormente', v_current_id;
        END IF;

        SELECT os.id, os.order_number, os.store_id, os.technician_id, os.status,
               os.final_price, os.estimated_price, os.delivered_at, os.internal_notes
        INTO v_os_rec
        FROM public.service_orders os
        WHERE os.id = v_current_id
        FOR UPDATE;

        IF v_os_rec.id IS NULL THEN
            RAISE EXCEPTION 'OS_NOT_FOUND: Ordem de serviço % não encontrada', v_current_id;
        END IF;

        IF v_os_rec.store_id != v_store_id THEN
            RAISE EXCEPTION 'STORE_MISMATCH: OS % pertence a outra loja', v_current_id;
        END IF;

        IF v_os_rec.technician_id IS NULL OR v_os_rec.technician_id != v_user_id THEN
            RAISE EXCEPTION 'OWNER_MISMATCH: OS % não está atribuída ao técnico selecionado', v_current_id;
        END IF;

        IF v_os_rec.status != 'delivered' THEN
            RAISE EXCEPTION 'OS_NOT_DELIVERED: OS % não está com status delivered', v_current_id;
        END IF;

        IF v_os_rec.delivered_at IS NULL THEN
            RAISE EXCEPTION 'OS_MISSING_DELIVERED_AT: OS % não possui data de entrega (delivered_at)', v_current_id;
        END IF;

        -- Salvaguarda Server-Side 1: Comissão expressamente anulada pela gestão
        IF COALESCE(v_os_rec.internal_notes, '') ILIKE '%[COMISSAO_ANULADA%' THEN
            RAISE EXCEPTION 'OS_COMMISSION_WAIVED: A comissão da OS #% (%) foi expressamente anulada pela gestão', v_os_rec.order_number, v_current_id;
        END IF;

        v_os_date := (v_os_rec.delivered_at AT TIME ZONE 'America/Sao_Paulo')::DATE;
        IF v_os_date < v_period_start OR v_os_date > v_period_end THEN
            RAISE EXCEPTION 'OS_OUTSIDE_PERIOD: A OS % (entregue em Brasília: %) está fora do período de apuração (% a %)',
                v_current_id, v_os_date, v_period_start, v_period_end;
        END IF;

        v_os_gross := COALESCE(v_os_rec.final_price, v_os_rec.estimated_price, 0);

        -- Salvaguarda Server-Side 2: OS deve possuir entrada confirmada no Caixa (pós-última reabertura)
        IF v_os_gross > 0 AND v_os_rec.delivered_at >= '2026-07-01 00:00:00+00'::TIMESTAMPTZ THEN
            SELECT pg_catalog.max(h.created_at) INTO v_last_reopen_at
            FROM public.service_order_history h
            WHERE h.service_order_id = v_os_rec.id
              AND h.old_status = 'delivered'
              AND h.new_status <> 'delivered';

            SELECT
                pg_catalog.count(*) FILTER (WHERE ce.confirmed IS TRUE),
                pg_catalog.count(*) FILTER (WHERE COALESCE(ce.confirmed, FALSE) IS FALSE)
            INTO v_confirmed_entries, v_unconfirmed_entries
            FROM public.cash_entries ce
            WHERE ce.type = 'entrada'
              AND (v_last_reopen_at IS NULL OR ce.created_at > v_last_reopen_at)
              AND (
                  ce.reference_id = v_os_rec.id
                  OR (
                      ce.reference_id IS NULL
                      AND (ce.store_id IS NULL OR ce.store_id = v_os_rec.store_id)
                      AND COALESCE(ce.description, '') NOT LIKE 'PDV:%'
                      AND COALESCE(ce.description, '') NOT LIKE 'Venda:%'
                      AND ce.description ~* ('\mOS\s*#?\s*' || v_os_rec.order_number || '\M')
                  )
              );

            IF COALESCE(v_unconfirmed_entries, 0) > 0 OR COALESCE(v_confirmed_entries, 0) = 0 THEN
                RAISE EXCEPTION 'OS_FINANCIAL_PENDING: A OS #% (%) ainda não possui recebimento confirmado no Caixa', v_os_rec.order_number, v_current_id;
            END IF;
        END IF;

        SELECT COALESCE(pg_catalog.sum(unit_cost * COALESCE(quantity, 1)), 0) INTO v_os_parts_cost
        FROM public.service_order_items
        WHERE service_order_id = v_os_rec.id;

        SELECT
            COALESCE(commission_on_services, false),
            COALESCE(commission_services_percent, 0)
        INTO v_os_comm_on_services, v_os_comm_pct
        FROM public.user_roles
        WHERE user_id = v_user_id
        LIMIT 1;

        IF v_os_comm_on_services IS NOT TRUE THEN
            RAISE EXCEPTION 'SERVICE_COMMISSION_DISABLED: O técnico % não possui comissão sobre serviços habilitada (commission_on_services = false)', v_user_id;
        END IF;

        IF v_os_comm_pct <= 0 THEN
            RAISE EXCEPTION 'SERVICE_COMMISSION_PERCENT_ZERO: O técnico % possui percentual de comissão de serviços zero ou negativo (% %%)', v_user_id, v_os_comm_pct;
        END IF;

        v_os_profit := v_os_gross - v_os_parts_cost;

        IF v_os_profit <= 0 THEN
            RAISE EXCEPTION 'SERVICE_ORDER_ZERO_PROFIT: OS % possui margem/lucro zero ou negativo (R$ %) após custo de peças, gerando comissão nula', v_current_id, v_os_profit;
        END IF;

        v_os_comm_amt := (v_os_profit * v_os_comm_pct) / 100.0;

        IF v_os_comm_amt <= 0 THEN
            RAISE EXCEPTION 'SERVICE_ORDER_COMMISSION_ZERO: OS % gerou valor de comissão zero ou negativo', v_current_id;
        END IF;

        INSERT INTO public.commission_settlement_items (
            settlement_id, item_type, service_order_id,
            gross_amount, cost_amount, profit_amount,
            commission_percent, commission_amount
        ) VALUES (
            v_settlement_id, 'service_order', v_os_rec.id,
            v_os_gross, v_os_parts_cost, v_os_profit,
            v_os_comm_pct, v_os_comm_amt
        );

        v_total_service_comm := v_total_service_comm + v_os_comm_amt;
        v_items_count := v_items_count + 1;
    END LOOP;

    v_total_amount := v_total_sales_comm + v_total_service_comm;

    IF v_total_amount <= 0 THEN
        RAISE EXCEPTION 'ZERO_AMOUNT: O montante total apurado da liquidação é zero';
    END IF;

    IF v_payment_method = 'dinheiro' THEN
        INSERT INTO public.cash_entries (
            cash_register_id, store_id, type, amount,
            description, payment_method, confirmed, created_by
        ) VALUES (
            v_cash_reg_id, v_store_id, 'saida', v_total_amount,
            'Liquidação de Comissão: ' || v_user_name,
            'dinheiro', true, v_caller_id
        ) RETURNING id INTO v_cash_entry_id;

        INSERT INTO public.transactions (
            type, category, amount, net_amount,
            description, store_id, created_by, status,
            reconciled, receipt_url, metadata
        ) VALUES (
            'expense_pj', 'comissao', v_total_amount, v_total_amount,
            'Comissão paga a ' || v_user_name || ' (Dinheiro)',
            v_store_id, v_caller_id, 'completed',
            true, v_receipt_url,
            pg_catalog.jsonb_build_object(
                'source', 'commission_settlement',
                'settlement_id', v_settlement_id
            )
        ) RETURNING id INTO v_transaction_id;
    ELSE
        INSERT INTO public.transactions (
            type, category, amount, net_amount,
            description, store_id, created_by, status,
            reconciled, receipt_url, source_account_id, metadata
        ) VALUES (
            'expense_pj', 'comissao', v_total_amount, v_total_amount,
            'Comissão (' || pg_catalog.upper(v_payment_method) || ') paga a ' || v_user_name,
            v_store_id, v_caller_id, 'completed',
            true, v_receipt_url, v_source_account_id,
            pg_catalog.jsonb_build_object(
                'source', 'commission_settlement',
                'settlement_id', v_settlement_id
            )
        ) RETURNING id INTO v_transaction_id;
    END IF;

    UPDATE public.commission_settlements
    SET total_sales_commission = v_total_sales_comm,
        total_service_commission = v_total_service_comm,
        total_amount = v_total_amount,
        transaction_id = v_transaction_id,
        cash_entry_id = v_cash_entry_id
    WHERE id = v_settlement_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'settlement_id', v_settlement_id,
        'user_name', v_user_name,
        'total_amount', v_total_amount,
        'total_sales_commission', v_total_sales_comm,
        'total_service_commission', v_total_service_comm,
        'items_count', v_items_count,
        'cash_entry_id', v_cash_entry_id,
        'transaction_id', v_transaction_id,
        'payment_method', v_payment_method
    );
END;
$$;

-- 3. NOVA RPC ATÔMICA: public.cancel_commission_settlement
CREATE OR REPLACE FUNCTION public.cancel_commission_settlement(
    p_settlement_id UUID,
    p_reason TEXT,
    p_refund_to_open_register BOOLEAN DEFAULT FALSE
)
RETURNS pg_catalog.jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_caller_role TEXT;
    v_caller_perms pg_catalog.jsonb;
    v_is_admin BOOLEAN;
    v_has_finance_perm BOOLEAN;

    v_settlement RECORD;
    v_clean_reason TEXT;
    v_user_name TEXT := 'Colaborador';
    v_snapshot pg_catalog.jsonb;
    v_items_released INTEGER := 0;
    v_orig_reg_status TEXT := NULL;
    v_open_reg_id UUID := NULL;
    v_cash_reversal_mode TEXT := 'not_applicable';
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão inválida ou operador não autenticado';
    END IF;

    v_clean_reason := pg_catalog.btrim(COALESCE(p_reason, ''));
    IF v_clean_reason = '' THEN
        RAISE EXCEPTION 'REASON_REQUIRED: Informe o motivo da anulação da liquidação';
    END IF;

    -- Lock exclusivo no cabeçalho da liquidação
    SELECT cs.*
    INTO v_settlement
    FROM public.commission_settlements cs
    WHERE cs.id = p_settlement_id
    FOR UPDATE;

    IF v_settlement.id IS NULL THEN
        RAISE EXCEPTION 'SETTLEMENT_NOT_FOUND: Liquidação % não encontrada', p_settlement_id;
    END IF;

    IF v_settlement.status = 'cancelled' THEN
        RAISE EXCEPTION 'SETTLEMENT_ALREADY_CANCELLED: Esta liquidação já foi anulada anteriormente';
    END IF;

    -- Validação de papel + permissão financeira + vínculo na loja (member_stores)
    SELECT ur.role, ur.permissions INTO v_caller_role, v_caller_perms
    FROM public.user_roles ur
    WHERE ur.user_id = v_caller_id
    LIMIT 1;

    v_is_admin := (v_caller_role = 'admin');
    v_has_finance_perm := (v_caller_perms->>'gerenciar_financeiro')::boolean IS TRUE;

    IF NOT (v_is_admin OR (v_caller_role = 'gerente' AND v_has_finance_perm)) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Apenas administradores ou gerentes com permissão gerenciar_financeiro podem anular liquidações';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = v_caller_id AND ms.store_id = v_settlement.store_id
    ) THEN
        RAISE EXCEPTION 'STORE_MISMATCH: Operador não possui vínculo ativo com a loja desta liquidação';
    END IF;

    SELECT COALESCE(display_name, 'Colaborador') INTO v_user_name
    FROM public.profiles
    WHERE user_id = v_settlement.user_id;

    -- Capturar snapshot enriquecido completo dos itens antes de liberar os locks únicos
    SELECT COALESCE(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'id', csi.id,
                'settlement_id', csi.settlement_id,
                'item_type', csi.item_type,
                'sale_id', csi.sale_id,
                'service_order_id', csi.service_order_id,
                'gross_amount', csi.gross_amount,
                'cost_amount', csi.cost_amount,
                'profit_amount', csi.profit_amount,
                'commission_percent', csi.commission_percent,
                'commission_amount', csi.commission_amount,
                'created_at', csi.created_at,
                'order_number', os.order_number,
                'customer_name', COALESCE(os.customer_name, s.customer_name),
                'device_name', CASE
                    WHEN csi.item_type = 'service_order' THEN pg_catalog.btrim(COALESCE(os.device_brand, '') || ' ' || COALESCE(os.device_model, ''))
                    ELSE COALESCE(sp.name, pg_catalog.btrim(COALESCE(sp.brand, '') || ' ' || COALESCE(sp.model, '')))
                END,
                'service_name', os.requested_service,
                'operation_date', COALESCE(os.delivered_at, s.created_at),
                'parts_summary', (
                    SELECT pg_catalog.string_agg(
                        COALESCE(pr.name, 'Peça') || CASE WHEN COALESCE(soi.quantity, 1) > 1 THEN ' (' || soi.quantity || 'x)' ELSE '' END,
                        ', '
                    )
                    FROM public.service_order_items soi
                    LEFT JOIN public.products pr ON pr.id = soi.product_id
                    WHERE soi.service_order_id = csi.service_order_id
                )
            )
            ORDER BY csi.created_at ASC
        ),
        '[]'::pg_catalog.jsonb
    )
    INTO v_snapshot
    FROM public.commission_settlement_items csi
    LEFT JOIN public.service_orders os ON os.id = csi.service_order_id
    LEFT JOIN public.sales s ON s.id = csi.sale_id
    LEFT JOIN public.products sp ON sp.id = s.product_id
    WHERE csi.settlement_id = p_settlement_id;

    -- Liberar itens (remove restrição uq_settlement_sale e uq_settlement_service_order, devolvendo-os para Pendente)
    DELETE FROM public.commission_settlement_items
    WHERE settlement_id = p_settlement_id;
    GET DIAGNOSTICS v_items_released = ROW_COUNT;

    -- Desvincular FKs e marcar cabeçalho como anulado com trilha de auditoria completa
    UPDATE public.commission_settlements
    SET status = 'cancelled',
        cancelled_at = pg_catalog.now(),
        cancelled_by = v_caller_id,
        cancel_reason = v_clean_reason,
        cancelled_items_snapshot = v_snapshot,
        transaction_id = NULL,
        cash_entry_id = NULL
    WHERE id = p_settlement_id;

    -- Reverter despesa no DRE / Conta Bancária sem inflar faturamento
    IF v_settlement.transaction_id IS NOT NULL THEN
        DELETE FROM public.transactions
        WHERE id = v_settlement.transaction_id;
    END IF;

    -- Reverter movimentação de Caixa caso tenha sido pago em Dinheiro
    IF v_settlement.payment_method = 'dinheiro' AND v_settlement.cash_entry_id IS NOT NULL THEN
        IF v_settlement.cash_register_id IS NOT NULL THEN
            SELECT cr.status INTO v_orig_reg_status
            FROM public.cash_registers cr
            WHERE cr.id = v_settlement.cash_register_id;
        END IF;

        IF v_orig_reg_status = 'open' THEN
            DELETE FROM public.cash_entries
            WHERE id = v_settlement.cash_entry_id;
            v_cash_reversal_mode := 'deleted_from_open_register';
        ELSE
            -- Caixa original já encerrado: preserva histórico imutável do caixa fechado
            IF p_refund_to_open_register IS TRUE THEN
                SELECT cr.id INTO v_open_reg_id
                FROM public.cash_registers cr
                WHERE cr.store_id = v_settlement.store_id AND cr.status = 'open'
                ORDER BY cr.opened_at DESC
                LIMIT 1;

                IF v_open_reg_id IS NULL THEN
                    RAISE EXCEPTION 'NO_OPEN_CASH_REGISTER_FOR_REFUND: Não há caixa aberto nesta loja para registrar a devolução física em dinheiro';
                END IF;

                INSERT INTO public.cash_entries (
                    cash_register_id, store_id, type, payment_method, amount,
                    description, confirmed, created_by
                ) VALUES (
                    v_open_reg_id,
                    v_settlement.store_id,
                    'entrada',
                    'dinheiro',
                    v_settlement.total_amount,
                    'Estorno de Liquidação de Comissão Anulada (' || v_user_name || '): ' || v_clean_reason,
                    true,
                    v_caller_id
                );
                v_cash_reversal_mode := 'refunded_to_current_open_register';
            ELSE
                v_cash_reversal_mode := 'closed_register_preserved';
            END IF;
        END IF;
    END IF;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'settlement_id', p_settlement_id,
        'items_released', v_items_released,
        'cash_reversal_mode', v_cash_reversal_mode
    );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_commissions(pg_catalog.jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_commissions(pg_catalog.jsonb) TO authenticated;
ALTER FUNCTION public.settle_commissions(pg_catalog.jsonb) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.cancel_commission_settlement(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_commission_settlement(UUID, TEXT, BOOLEAN) TO authenticated;
ALTER FUNCTION public.cancel_commission_settlement(UUID, TEXT, BOOLEAN) OWNER TO postgres;

COMMIT;
