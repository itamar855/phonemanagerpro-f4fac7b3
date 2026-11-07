-- Corrige cancel_service_order para estornar lançamentos de caixa (cash_entries) e
-- transações associadas à OS antes de excluí-la. Antes desta migration, excluir uma
-- OS via "Excluir Ordem de Serviço" (admin) removia a ordem mas deixava o lançamento
-- financeiro correspondente órfão no caixa — a lógica de estorno existia apenas no
-- fluxo de "Cancelar" (mudança de status), nunca no de exclusão definitiva.
--
-- Mesma política de caixa aberto/fechado já usada em updateStatus (OrdensServico.tsx):
--   - Lançamentos em caixa ABERTO: removidos diretamente (estorno na origem).
--   - Lançamentos em caixa JÁ FECHADO: preservados intactos (auditoria), com um
--     lançamento contábil de estorno ("Estorno OS") registrado no financeiro.
--     Não lança saída física automática na gaveta aberta (decisão que, no fluxo de
--     UI, depende de confirmação humana sobre devolução física do valor).

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
    v_entry RECORD;
    v_open_entry_ids UUID[] := ARRAY[]::UUID[];
    v_closed_total NUMERIC := 0;
    v_has_closed BOOLEAN := false;
    v_estorno_desc TEXT;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão inválida ou operador não autenticado';
    END IF;

    -- 1. Obter e travar a OS exclusivamente (FOR UPDATE) para serialização atômica contra concorrência
    SELECT os.id, os.store_id, os.status, os.order_number
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

    -- 5. Estornar lançamentos de caixa e transações vinculados à OS antes de excluí-la
    FOR v_entry IN
        SELECT ce.id, ce.cash_register_id, ce.amount, cr.status AS register_status
        FROM public.cash_entries ce
        LEFT JOIN public.cash_registers cr ON cr.id = ce.cash_register_id
        WHERE ce.type = 'entrada'
          AND (
                ce.reference_id = p_service_order_id
                OR (
                    ce.reference_id IS NULL
                    AND ce.description LIKE 'OS #' || v_os_rec.order_number || ' %'
                )
              )
    LOOP
        IF v_entry.register_status = 'open' THEN
            v_open_entry_ids := array_append(v_open_entry_ids, v_entry.id);
        ELSE
            v_has_closed := true;
            v_closed_total := v_closed_total + COALESCE(v_entry.amount, 0);
        END IF;
    END LOOP;

    IF array_length(v_open_entry_ids, 1) > 0 THEN
        DELETE FROM public.cash_entries WHERE id = ANY(v_open_entry_ids);
    END IF;

    IF v_has_closed AND v_closed_total > 0 THEN
        v_estorno_desc := 'Estorno OS #' || v_os_rec.order_number || ' (Excluída): ' || COALESCE(p_reason, 'Exclusão administrativa');
        INSERT INTO public.transactions (
            type, category, amount, net_amount, description, store_id, created_by, expected_settlement_date, reconciled
        ) VALUES (
            'expense_pj', 'Estorno OS', v_closed_total, v_closed_total,
            v_estorno_desc, v_os_rec.store_id, v_caller_id, now(), true
        );
    END IF;

    -- Transações de receita vinculadas à OS (ex: PDV/relatório) só são removidas quando
    -- não há lançamento preservado em caixa fechado (nesse caso o estorno contábil acima
    -- já cobre a reversão, preservando o rastro original para auditoria).
    IF NOT v_has_closed THEN
        DELETE FROM public.transactions
        WHERE type = 'income'
          AND store_id = v_os_rec.store_id
          AND description LIKE 'OS #' || v_os_rec.order_number || ' %';
    END IF;

    -- 6. Executar mutações atômicas restantes na mesma transação:
    -- A. Reverter peças utilizadas de volta para 'in_stock'
    UPDATE public.products
    SET status = 'in_stock'
    WHERE id IN (
        SELECT soi.product_id
        FROM public.service_order_items soi
        WHERE soi.service_order_id = p_service_order_id
          AND soi.product_id IS NOT NULL
    ) AND status = 'sold';

    -- B. Excluir a ordem de serviço (o banco cascateia para service_order_items, histórico e fotos)
    DELETE FROM public.service_orders
    WHERE id = p_service_order_id;

    RETURN pg_catalog.jsonb_build_object(
        'success', true,
        'service_order_id', p_service_order_id,
        'reason', p_reason,
        'cash_entries_reversed_open', COALESCE(array_length(v_open_entry_ids, 1), 0),
        'cash_entries_preserved_closed_total', v_closed_total
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_service_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_service_order(UUID, TEXT) TO authenticated;
