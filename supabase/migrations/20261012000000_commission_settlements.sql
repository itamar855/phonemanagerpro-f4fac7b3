-- ==============================================================================
-- MIGRATION: 20261012000000_commission_settlements.sql
-- DESCRIÇÃO: Liquidação Atômica de Comissões (Vendas e Ordens de Serviço)
-- REGRAS E SALVAGUARDAS INCORPORADAS:
-- 1. commission_settlements + commission_settlement_items (snapshot imutável).
-- 2. settlement_items com ON DELETE RESTRICT (proíbe exclusão em cascata).
-- 3. Índices parciais UNIQUE garantindo idempotência absoluta contra duplo pagamento.
-- 4. RPC atômica settle_commissions com SECURITY DEFINER e search_path = ''.
-- 5. Caller (seja Admin ou Gerente) SEMPRE deve possuir member_stores na loja indicada.
-- 6. Beneficiário SEMPRE deve possuir member_stores na loja indicada.
-- 7. Conta bancária (Pix/TED) SEMPRE deve pertencer à mesma loja (store_id).
-- 8. Dinheiro exige caixa aberto e gera cash_entry + transaction.
-- 9. Pix/Transferência gera transaction somente (zero cash_entry).
-- 10. RLS SELECT estrito por store scope (sem bypass de Admin entre lojas não vinculadas).
-- 11. Escrita direta via cliente bloqueada (apenas SELECT para authenticated; RPC para escrita).
-- ==============================================================================

-- 0. COLUNA CANÔNICA sale_id EM TRANSACTIONS
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'transactions' AND column_name = 'sale_id'
    ) THEN
        ALTER TABLE public.transactions
        ADD COLUMN sale_id UUID NULL REFERENCES public.sales(id) ON DELETE RESTRICT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_transactions_sale_id ON public.transactions(sale_id);

-- 1. TABELA DE CABEÇALHO DE LIQUIDAÇÕES
CREATE TABLE IF NOT EXISTS public.commission_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    total_sales_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_service_commission NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('dinheiro', 'pix', 'transferencia')),
    source_type TEXT NOT NULL CHECK (source_type IN ('caixa', 'banco')),
    cash_register_id UUID REFERENCES public.cash_registers(id),
    transaction_id UUID REFERENCES public.transactions(id),
    cash_entry_id UUID REFERENCES public.cash_entries(id),
    source_account_id UUID REFERENCES public.store_bank_accounts(id),
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status = 'paid'),
    paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    receipt_url TEXT,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABELA DE ITENS LIQUIDADOS (SNAPSHOT HISTÓRICO IMUTÁVEL)
CREATE TABLE IF NOT EXISTS public.commission_settlement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    settlement_id UUID NOT NULL REFERENCES public.commission_settlements(id) ON DELETE RESTRICT,
    item_type TEXT NOT NULL CHECK (item_type IN ('sale', 'service_order')),
    sale_id UUID REFERENCES public.sales(id),
    service_order_id UUID REFERENCES public.service_orders(id),
    gross_amount NUMERIC(12,2) NOT NULL,
    cost_amount NUMERIC(12,2),
    profit_amount NUMERIC(12,2),
    commission_percent NUMERIC(5,2) NOT NULL,
    commission_amount NUMERIC(12,2) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_item_target CHECK (
        (item_type = 'sale' AND sale_id IS NOT NULL AND service_order_id IS NULL) OR
        (item_type = 'service_order' AND service_order_id IS NOT NULL AND sale_id IS NULL)
    ),
    CONSTRAINT chk_os_costs CHECK (
        item_type != 'service_order' OR (cost_amount IS NOT NULL AND profit_amount IS NOT NULL)
    )
);

-- 3. ÍNDICES DE IDEMPOTÊNCIA CONTRA DUPLO PAGAMENTO (HARDWARE LEVEL LOCK)
CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_sale 
    ON public.commission_settlement_items (sale_id) 
    WHERE sale_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_settlement_service_order 
    ON public.commission_settlement_items (service_order_id) 
    WHERE service_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commission_settlements_user 
    ON public.commission_settlements (user_id);

CREATE INDEX IF NOT EXISTS idx_commission_settlements_store 
    ON public.commission_settlements (store_id);

-- 4. HABILITAR ROW LEVEL SECURITY
ALTER TABLE public.commission_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commission_settlement_items ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS (LEITURA APENAS; ESCRITA EXCLUSIVA PELA RPC SECURITY DEFINER):
-- Gestores visualizam exclusivamente as liquidações de lojas às quais pertencem (member_stores).
-- Não há bypass cross-store para Admin nem para Gerente.
CREATE POLICY "Gestores autorizados visualizam settlements da sua loja" 
ON public.commission_settlements
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.member_stores ms
        JOIN public.user_roles ur ON ur.user_id = auth.uid()
        WHERE ms.user_id = auth.uid()
          AND ms.store_id = commission_settlements.store_id
          AND (
              ur.role = 'admin'
              OR (ur.role = 'gerente' AND (ur.permissions->>'gerenciar_financeiro')::boolean = true)
          )
    )
);

CREATE POLICY "Colaboradores visualizam seus proprios settlements" 
ON public.commission_settlements
FOR SELECT TO authenticated
USING (
    user_id = auth.uid()
);

-- Leitura de itens vinculada ao escopo do cabeçalho
CREATE POLICY "Acesso de leitura aos itens de settlement por gestores e beneficiario" 
ON public.commission_settlement_items
FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.commission_settlements cs
        WHERE cs.id = commission_settlement_items.settlement_id
          AND (
              cs.user_id = auth.uid()
              OR EXISTS (
                  SELECT 1 FROM public.member_stores ms
                  JOIN public.user_roles ur ON ur.user_id = auth.uid()
                  WHERE ms.user_id = auth.uid()
                    AND ms.store_id = cs.store_id
                    AND (
                        ur.role = 'admin'
                        OR (ur.role = 'gerente' AND (ur.permissions->>'gerenciar_financeiro')::boolean = true)
                    )
              )
          )
    )
);

-- ==============================================================================
-- 5. RPC ATÔMICA: public.settle_commissions (SECURITY DEFINER + search_path = '')
-- ==============================================================================
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
    
    -- Record variables para iteração dos loops
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
    
    v_items_count INTEGER := 0;
BEGIN
    -- 1. VALIDAÇÃO DE AUTENTICAÇÃO
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão inválida ou usuário não autenticado';
    END IF;

    -- 2. PARSE E VALIDAÇÃO DOS ARGUMENTOS
    v_store_id := (p_payload->>'store_id')::UUID;
    v_user_id := (p_payload->>'user_id')::UUID;
    v_period_start := (p_payload->>'period_start')::DATE;
    v_period_end := (p_payload->>'period_end')::DATE;
    v_payment_method := p_payload->>'payment_method';
    v_source_type := p_payload->>'source_type';
    v_source_account_id := (p_payload->>'source_account_id')::UUID;
    v_notes := p_payload->>'notes';
    v_receipt_url := p_payload->>'receipt_url';
    v_sales_ids := pg_catalog.coalesce(p_payload->'sale_ids', '[]'::pg_catalog.jsonb);
    v_os_ids := pg_catalog.coalesce(p_payload->'service_order_ids', '[]'::pg_catalog.jsonb);

    IF v_store_id IS NULL OR v_user_id IS NULL OR v_period_start IS NULL OR v_period_end IS NULL THEN
        RAISE EXCEPTION 'INVALID_ARGUMENTS: store_id, user_id, period_start e period_end são obrigatórios';
    END IF;

    IF v_payment_method NOT IN ('dinheiro', 'pix', 'transferencia') THEN
        RAISE EXCEPTION 'INVALID_PAYMENT_METHOD: Método de pagamento % inválido. Métodos aceitos: dinheiro, pix, transferencia', v_payment_method;
    END IF;

    IF v_source_type NOT IN ('caixa', 'banco') THEN
        RAISE EXCEPTION 'INVALID_SOURCE_TYPE: source_type deve ser "caixa" ou "banco"';
    END IF;

    -- 3. VALIDAÇÃO DE AUTORIZAÇÃO (PAPEL + PERMISSÃO CANÔNICA + STORE MEMBERSHIP DO CALLER)
    SELECT ur.role, ur.permissions INTO v_caller_role, v_caller_perms
    FROM public.user_roles ur
    WHERE ur.user_id = v_caller_id
    LIMIT 1;

    v_is_admin := (v_caller_role = 'admin');
    v_has_finance_perm := (v_caller_perms->>'gerenciar_financeiro')::boolean IS TRUE;

    IF NOT (v_is_admin OR (v_caller_role = 'gerente' AND v_has_finance_perm)) THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Apenas administradores ou gerentes com permissão gerenciar_financeiro podem liquidar comissões';
    END IF;

    -- Caller (Admin ou Gerente) DEVE possuir vínculo em member_stores para a loja da operação (sem bypass)
    IF NOT EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = v_caller_id AND ms.store_id = v_store_id
    ) THEN
        RAISE EXCEPTION 'STORE_MISMATCH: O operador solicitante não possui vínculo ativo (member_stores) com a loja indicada';
    END IF;

    -- 4. VALIDAÇÃO DE STORE MEMBERSHIP DO COLABORADOR BENEFICIÁRIO
    -- Beneficiário SEMPRE deve possuir vínculo ativo em member_stores para a loja indicada
    IF NOT EXISTS (
        SELECT 1 FROM public.member_stores WHERE user_id = v_user_id AND store_id = v_store_id
    ) THEN
        RAISE EXCEPTION 'STORE_MISMATCH: O colaborador beneficiário não possui vínculo (member_stores) com a loja indicada';
    END IF;

    -- Obter display_name do colaborador
    SELECT pg_catalog.coalesce(display_name, 'Colaborador') INTO v_user_name
    FROM public.profiles
    WHERE user_id = v_user_id;

    -- 5. VALIDAÇÃO DE MODALIDADE FINANCEIRA
    IF v_payment_method = 'dinheiro' THEN
        IF v_source_type != 'caixa' THEN
            RAISE EXCEPTION 'INVALID_SOURCE: Pagamentos em dinheiro devem ter source_type = "caixa"';
        END IF;

        -- Obter cash_register_id se informado no payload
        v_cash_reg_id := (p_payload->>'cash_register_id')::UUID;

        IF v_cash_reg_id IS NOT NULL THEN
            IF NOT EXISTS (
                SELECT 1 FROM public.cash_registers
                WHERE id = v_cash_reg_id AND store_id = v_store_id AND status = 'open'
            ) THEN
                RAISE EXCEPTION 'INVALID_CASH_REGISTER: Caixa informado % não está aberto ou não pertence à loja indicada', v_cash_reg_id;
            END IF;
        ELSE
            -- Se não informado explicitamente, verifica quantos caixas estão abertos na loja
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
        -- PIX / TRANSFERÊNCIA BANCÁRIA
        IF v_source_type != 'banco' THEN
            RAISE EXCEPTION 'INVALID_SOURCE: Pagamentos via % devem ter source_type = "banco"', v_payment_method;
        END IF;

        IF v_source_account_id IS NULL THEN
            RAISE EXCEPTION 'SOURCE_ACCOUNT_REQUIRED: Conta bancária de origem é obrigatória para pagamento via %', v_payment_method;
        END IF;

        -- Validação estrita: a conta DEVE pertencer à mesma loja indicada na liquidação
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

    -- 6. CRIAR REGISTRO DE CABEÇALHO DA LIQUIDAÇÃO
    INSERT INTO public.commission_settlements (
        store_id, user_id, period_start, period_end,
        total_sales_commission, total_service_commission, total_amount,
        payment_method, source_type, cash_register_id,
        source_account_id, status, paid_at, receipt_url,
        notes, created_by
    ) VALUES (
        v_store_id, v_user_id, v_period_start, v_period_end,
        0, 0, 0, -- Atualizados após o cálculo server-side
        v_payment_method, v_source_type, v_cash_reg_id,
        v_source_account_id, 'paid', pg_catalog.now(), v_receipt_url,
        v_notes, v_caller_id
    ) RETURNING id INTO v_settlement_id;

    -- 7. PROCESSAR E PERSISTIR ITENS DE VENDAS (SNAPSHOT IMUTÁVEL)
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(v_sales_ids)
    LOOP
        v_current_id := (v_elem#>>'{}')::UUID;

        -- Verificação preventiva de idempotência
        IF EXISTS (SELECT 1 FROM public.commission_settlement_items WHERE sale_id = v_current_id) THEN
            RAISE EXCEPTION 'SALE_ALREADY_SETTLED: A venda % já foi liquidada anteriormente', v_current_id;
        END IF;

        -- Bloqueio e leitura canônica da venda (CANONICAL_SALES_COMMISSION_OWNER = created_by)
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

        -- Validação estrita de período contábil server-side no fuso horário canônico (America/Sao_Paulo)
        v_sale_date := (v_sale_rec.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE;
        IF v_sale_date < v_period_start OR v_sale_date > v_period_end THEN
            RAISE EXCEPTION 'SALE_OUTSIDE_PERIOD: A venda % (data Brasília: %) está fora do período de apuração (% a %)', 
                v_current_id, v_sale_date, v_period_start, v_period_end;
        END IF;

        -- Validação estrita de elegibilidade individual da venda
        IF pg_catalog.coalesce(v_sale_rec.commission_value, 0) <= 0 THEN
            RAISE EXCEPTION 'SALE_COMMISSION_ZERO: Venda % não possui comissão positiva elegível (commission_value: %)', 
                v_current_id, pg_catalog.coalesce(v_sale_rec.commission_value, 0);
        END IF;

        -- Inserção do snapshot imutável do item (Venda histórica não fabrica cost_amount/profit_amount: armazena NULL)
        INSERT INTO public.commission_settlement_items (
            settlement_id, item_type, sale_id,
            gross_amount, cost_amount, profit_amount,
            commission_percent, commission_amount
        ) VALUES (
            v_settlement_id, 'sale', v_sale_rec.id,
            pg_catalog.coalesce(v_sale_rec.sale_price, 0),
            NULL,
            NULL,
            pg_catalog.coalesce(v_sale_rec.commission_percent, 0),
            pg_catalog.coalesce(v_sale_rec.commission_value, 0)
        );

        v_total_sales_comm := v_total_sales_comm + pg_catalog.coalesce(v_sale_rec.commission_value, 0);
        v_items_count := v_items_count + 1;
    END LOOP;

    -- 8. PROCESSAR E PERSISTIR ITENS DE ORDENS DE SERVIÇO (SNAPSHOT IMUTÁVEL)
    FOR v_elem IN SELECT * FROM pg_catalog.jsonb_array_elements(v_os_ids)
    LOOP
        v_current_id := (v_elem#>>'{}')::UUID;

        -- Verificação preventiva de idempotência
        IF EXISTS (SELECT 1 FROM public.commission_settlement_items WHERE service_order_id = v_current_id) THEN
            RAISE EXCEPTION 'OS_ALREADY_SETTLED: A OS % já foi liquidada anteriormente', v_current_id;
        END IF;

        -- Bloqueio e leitura canônica da OS
        SELECT os.id, os.store_id, os.technician_id, os.status, 
               os.final_price, os.estimated_price, os.delivered_at
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

        -- Validação estrita de período contábil server-side no fuso horário canônico (America/Sao_Paulo)
        v_os_date := (v_os_rec.delivered_at AT TIME ZONE 'America/Sao_Paulo')::DATE;
        IF v_os_date < v_period_start OR v_os_date > v_period_end THEN
            RAISE EXCEPTION 'OS_OUTSIDE_PERIOD: A OS % (entregue em Brasília: %) está fora do período de apuração (% a %)', 
                v_current_id, v_os_date, v_period_start, v_period_end;
        END IF;

        -- Custo real apurado das peças vinculadas à OS
        SELECT pg_catalog.coalesce(pg_catalog.sum(unit_cost * pg_catalog.coalesce(quantity, 1)), 0) INTO v_os_parts_cost
        FROM public.service_order_items
        WHERE service_order_id = v_os_rec.id;

        -- Validação estrita de habilitação e percentual de comissão de serviços do técnico
        SELECT 
            pg_catalog.coalesce(commission_on_services, false),
            pg_catalog.coalesce(commission_services_percent, 0)
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

        v_os_gross := pg_catalog.coalesce(v_os_rec.final_price, v_os_rec.estimated_price, 0);
        v_os_profit := v_os_gross - v_os_parts_cost;

        -- Validação estrita de margem/lucro individual: deve ser estritamente positiva
        IF v_os_profit <= 0 THEN
            RAISE EXCEPTION 'SERVICE_ORDER_ZERO_PROFIT: OS % possui margem/lucro zero ou negativo (R$ %) após custo de peças, gerando comissão nula', v_current_id, v_os_profit;
        END IF;

        v_os_comm_amt := (v_os_profit * v_os_comm_pct) / 100.0;

        IF v_os_comm_amt <= 0 THEN
            RAISE EXCEPTION 'SERVICE_ORDER_COMMISSION_ZERO: OS % gerou valor de comissão zero ou negativo', v_current_id;
        END IF;

        -- Inserção do snapshot imutável do item da OS
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

    -- 9. MOVIMENTAÇÃO FINANCEIRA CONFORME O MÉTODO DE PAGAMENTO
    IF v_payment_method = 'dinheiro' THEN
        -- DINHEIRO: Insere cash_entry na sessão de caixa + insere transaction
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
        -- PIX / TRANSFERÊNCIA: Cria somente transaction com source_account_id (zero cash_entry)
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

    -- 10. ATUALIZAR CABEÇALHO COM TOTAIS FINAIS E IDs DE VÍNCULO
    UPDATE public.commission_settlements
    SET total_sales_commission = v_total_sales_comm,
        total_service_commission = v_total_service_comm,
        total_amount = v_total_amount,
        transaction_id = v_transaction_id,
        cash_entry_id = v_cash_entry_id
    WHERE id = v_settlement_id;

    -- RETORNO ESTRUTURADO DE SUCESSO
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

-- 6. PERMISSÕES E GRANTS EXPLÍCITOS (PRINCÍPIO DO MENOR PRIVILÉGIO)
REVOKE ALL ON TABLE public.commission_settlements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.commission_settlement_items FROM PUBLIC, anon, authenticated;

GRANT SELECT ON TABLE public.commission_settlements TO authenticated;
GRANT SELECT ON TABLE public.commission_settlement_items TO authenticated;

REVOKE ALL ON FUNCTION public.settle_commissions(pg_catalog.jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_commissions(pg_catalog.jsonb) TO authenticated;

-- ==============================================================================
-- 7. CANCELAMENTO ATÔMICO DE VENDAS COM BLINDAGEM CONTRA LIQUIDAÇÃO (RPC)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.cancel_sale(
    p_sale_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_sale_rec RECORD;
    v_has_settlement BOOLEAN;
    v_caller_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão inválida ou operador não autenticado';
    END IF;

    -- 1. Obter e travar a venda exclusivamente (FOR UPDATE) para serialização atômica contra concorrência
    SELECT s.id, s.store_id, s.product_id, s.trade_in_product_id
    INTO v_sale_rec
    FROM public.sales s
    WHERE s.id = p_sale_id
    FOR UPDATE;

    IF v_sale_rec.id IS NULL THEN
        RAISE EXCEPTION 'SALE_NOT_FOUND: Venda % não encontrada', p_sale_id;
    END IF;

    -- 2. Validar autorização canônica de cancelamento de vendas: admin ou gerente
    SELECT ur.role INTO v_caller_role
    FROM public.user_roles ur
    WHERE ur.user_id = v_caller_id
    LIMIT 1;

    IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'gerente') THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Apenas administradores ou gerentes podem cancelar vendas';
    END IF;

    -- 3. Validar vínculo do operador com a loja da venda (member_stores)
    IF NOT EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = v_caller_id AND ms.store_id = v_sale_rec.store_id
    ) THEN
        RAISE EXCEPTION 'STORE_MISMATCH: Operador não possui vínculo ativo com a loja da venda';
    END IF;

    -- 4. Verificar se a comissão da venda já foi liquidada APÓS obter o lock exclusivo FOR UPDATE
    SELECT EXISTS (
        SELECT 1 FROM public.commission_settlement_items csi
        WHERE csi.sale_id = p_sale_id
    ) INTO v_has_settlement;

    IF v_has_settlement THEN
        RAISE EXCEPTION 'SALE_COMMISSION_ALREADY_SETTLED: Esta venda possui comissão liquidada e não pode ser cancelada';
    END IF;

    -- 5. Executar mutações atômicas na mesma transação:
    -- A. Devolver o aparelho vendido ao estoque
    UPDATE public.products
    SET status = 'in_stock', sale_price = NULL
    WHERE id = v_sale_rec.product_id;

    -- B. Se houver aparelho de trade-in recebido, excluí-lo
    IF v_sale_rec.trade_in_product_id IS NOT NULL THEN
        DELETE FROM public.products WHERE id = v_sale_rec.trade_in_product_id;
    END IF;

    -- C. Validar integridade de transações legadas e excluir transações canônicas vinculadas à venda
    IF EXISTS (
        SELECT 1 FROM public.transactions t
        WHERE t.product_id = v_sale_rec.product_id
          AND t.type = 'sale'
          AND t.sale_id IS NULL
    ) THEN
        RAISE EXCEPTION 'LEGACY_SALE_TRANSACTION_LINK_REQUIRED: Existem transações históricas sem vínculo canônico para este produto';
    END IF;

    DELETE FROM public.transactions
    WHERE sale_id = p_sale_id;

    -- D. Excluir lançamentos de caixa vinculados pelo reference_id
    DELETE FROM public.cash_entries
    WHERE reference_id = p_sale_id;

    -- E. Excluir o registro da venda
    DELETE FROM public.sales
    WHERE id = p_sale_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'sale_id', p_sale_id,
        'product_id', v_sale_rec.product_id,
        'reason', p_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_sale(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_sale(UUID, TEXT) TO authenticated;

-- ==============================================================================
-- 8. CANCELAMENTO / EXCLUSÃO ATÔMICA DE ORDENS DE SERVIÇO COM BLINDAGEM (RPC)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.cancel_service_order(
    p_service_order_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_caller_id UUID;
    v_os_rec RECORD;
    v_has_settlement BOOLEAN;
    v_caller_role TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão inválida ou operador não autenticado';
    END IF;

    -- 1. Obter e travar a OS exclusivamente (FOR UPDATE) para serialização atômica contra concorrência
    SELECT os.id, os.store_id, os.status
    INTO v_os_rec
    FROM public.service_orders os
    WHERE os.id = p_service_order_id
    FOR UPDATE;

    IF v_os_rec.id IS NULL THEN
        RAISE EXCEPTION 'OS_NOT_FOUND: Ordem de serviço % não encontrada', p_service_order_id;
    END IF;

    -- 2. Validar autorização canônica de cancelamento/exclusão de OS: admin
    SELECT ur.role INTO v_caller_role
    FROM public.user_roles ur
    WHERE ur.user_id = v_caller_id
    LIMIT 1;

    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
        RAISE EXCEPTION 'PERMISSION_DENIED: Apenas administradores podem excluir ordens de serviço';
    END IF;

    -- 3. Validar vínculo do operador com a loja da OS (member_stores)
    IF NOT EXISTS (
        SELECT 1 FROM public.member_stores ms
        WHERE ms.user_id = v_caller_id AND ms.store_id = v_os_rec.store_id
    ) THEN
        RAISE EXCEPTION 'STORE_MISMATCH: Operador não possui vínculo ativo com a loja da ordem de serviço';
    END IF;

    -- 4. Verificar se a comissão da OS já foi liquidada APÓS obter o lock exclusivo FOR UPDATE
    SELECT EXISTS (
        SELECT 1 FROM public.commission_settlement_items csi
        WHERE csi.service_order_id = p_service_order_id
    ) INTO v_has_settlement;

    IF v_has_settlement THEN
        RAISE EXCEPTION 'OS_COMMISSION_ALREADY_SETTLED: Esta ordem de serviço possui comissão liquidada e não pode ser cancelada';
    END IF;

    -- 5. Executar mutações atômicas na mesma transação:
    -- A. Reverter peças utilizadas de volta para 'in_stock'
    UPDATE public.products
    SET status = 'in_stock'
    WHERE id IN (
        SELECT soi.product_id
        FROM public.service_order_items soi
        WHERE soi.service_order_id = p_service_order_id
          AND soi.product_id IS NOT NULL
    ) AND status = 'sold';

    -- B. Excluir a ordem de serviço (o banco cascateia para service_order_items e fotos)
    DELETE FROM public.service_orders
    WHERE id = p_service_order_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'service_order_id', p_service_order_id,
        'reason', p_reason
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_service_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_service_order(UUID, TEXT) TO authenticated;

-- ==============================================================================
-- 9. PROPRIEDADE DETERMINÍSTICA DAS FUNÇÕES SECURITY DEFINER
-- ==============================================================================
ALTER FUNCTION public.settle_commissions(pg_catalog.jsonb) OWNER TO postgres;
ALTER FUNCTION public.cancel_sale(UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION public.cancel_service_order(UUID, TEXT) OWNER TO postgres;


