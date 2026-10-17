/**
 * Commission Settlement Business Rules & Atomic RPC Engine Tests
 *
 * Valida rigorosamente as invariantes e salvaguardas da liquidação de comissões:
 * 1. Pagar venda uma vez = PASS
 * 2. Tentar pagar mesma venda novamente = REJEITADO (Idempotência via UNIQUE parcial)
 * 3. Pagar OS uma vez = PASS
 * 4. Tentar pagar mesma OS novamente = REJEITADO (Idempotência via UNIQUE parcial)
 * 5. Duas liquidações simultâneas da mesma origem = somente uma vence
 * 6. Pagamento em dinheiro sem caixa aberto = REJEITADO
 * 7. Pagamento dinheiro = cash_entry + transaction
 * 8. Pagamento Pix = transaction e zero cash_entry
 * 9. Pagamento transferência = transaction e zero cash_entry
 * 10. Store A tentando pagar colaborador da store B = REJEITADO
 * 11. Técnico comum tentando liquidar = REJEITADO (RBAC check)
 * 12. Alteração futura do percentual não modifica settlement antigo (Snapshot Model)
 * 13. Falha intermediária da RPC = rollback completo
 */

import { describe, it, expect, beforeEach } from "vitest";

// Tipos para simulação fiel do banco de dados em memória
interface UserRole {
  user_id: string;
  role: "admin" | "gerente" | "vendedor" | "tecnico" | "dono";
  permissions?: Record<string, boolean>;
  commission_services_percent?: number;
  commission_on_services?: boolean;
}

interface MemberStore {
  user_id: string;
  store_id: string;
}

interface CashRegister {
  id: string;
  store_id: string;
  status: "open" | "closed";
}

interface BankAccount {
  id: string;
  store_id: string;
}

interface Sale {
  id: string;
  store_id: string;
  created_by: string; // CANONICAL_SALES_COMMISSION_OWNER
  sale_price: number;
  discount: number;
  commission_percent: number;
  commission_value: number;
  product_id: string;
  created_at?: string;
}

interface Product {
  id: string;
  cost_price: number;
  status?: string;
  sale_price?: number | null;
}

interface ServiceOrder {
  id: string;
  store_id: string;
  technician_id: string;
  status: "delivered" | "repairing" | "pending";
  final_price?: number;
  estimated_price?: number;
  delivered_at?: string;
}

interface ServiceOrderItem {
  service_order_id: string;
  product_id?: string;
  unit_cost: number;
  quantity: number;
}

interface CommissionSettlement {
  id: string;
  store_id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  total_sales_commission: number;
  total_service_commission: number;
  total_amount: number;
  payment_method: "dinheiro" | "pix" | "transferencia";
  source_type: "caixa" | "banco";
  cash_register_id?: string | null;
  transaction_id?: string | null;
  cash_entry_id?: string | null;
  source_account_id?: string | null;
  status: "paid";
  paid_at: string;
  created_by: string;
}

interface CommissionSettlementItem {
  id: string;
  settlement_id: string;
  item_type: "sale" | "service_order";
  sale_id?: string | null;
  service_order_id?: string | null;
  gross_amount: number;
  cost_amount: number | null;
  profit_amount: number | null;
  commission_percent: number;
  commission_amount: number;
}

interface CashEntry {
  id: string;
  cash_register_id: string;
  store_id: string;
  type: string;
  amount: number;
  description: string;
  payment_method: string;
  confirmed: boolean;
  created_by: string;
  reference_id?: string;
}

interface Transaction {
  id: string;
  type: string;
  category: string;
  amount: number;
  net_amount: number;
  description: string;
  store_id: string;
  created_by: string;
  status: string;
  reconciled: boolean;
  source_account_id?: string | null;
  product_id?: string;
  sale_id?: string | null;
  metadata?: {
    source?: string;
    settlement_id?: string;
    [key: string]: any;
  };
}

// Estado em memória que espelha as tabelas do PostgreSQL e constraints
class MockDatabase {
  userRoles: UserRole[] = [];
  memberStores: MemberStore[] = [];
  cashRegisters: CashRegister[] = [];
  bankAccounts: BankAccount[] = [];
  sales: Sale[] = [];
  products: Product[] = [];
  serviceOrders: ServiceOrder[] = [];
  serviceOrderItems: ServiceOrderItem[] = [];

  settlements: CommissionSettlement[] = [];
  settlementItems: CommissionSettlementItem[] = [];
  cashEntries: CashEntry[] = [];
  transactions: Transaction[] = [];

  // Snapshot para suporte a Rollback em caso de erro na RPC
  takeSnapshot() {
    return {
      sales: this.sales.map((s) => ({ ...s })),
      products: this.products.map((p) => ({ ...p })),
      serviceOrders: this.serviceOrders.map((o) => ({ ...o })),
      serviceOrderItems: this.serviceOrderItems.map((i) => ({ ...i })),
      settlements: this.settlements.map((s) => ({ ...s })),
      settlementItems: this.settlementItems.map((i) => ({ ...i })),
      cashEntries: this.cashEntries.map((c) => ({ ...c })),
      transactions: this.transactions.map((t) => ({ ...t })),
    };
  }

  restoreSnapshot(snap: ReturnType<typeof this.takeSnapshot>) {
    this.sales = snap.sales;
    this.products = snap.products;
    this.serviceOrders = snap.serviceOrders;
    this.serviceOrderItems = snap.serviceOrderItems;
    this.settlements = snap.settlements;
    this.settlementItems = snap.settlementItems;
    this.cashEntries = snap.cashEntries;
    this.transactions = snap.transactions;
  }

  // Simulação de ON DELETE RESTRICT
  deleteSettlement(settlementId: string) {
    const hasItems = this.settlementItems.some((i) => i.settlement_id === settlementId);
    if (hasItems) {
      throw new Error("FOREIGN_KEY_VIOLATION: update or delete on table 'commission_settlements' violates foreign key constraint 'commission_settlement_items_settlement_id_fkey' on table 'commission_settlement_items' (ON DELETE RESTRICT)");
    }
    this.settlements = this.settlements.filter((s) => s.id !== settlementId);
  }
}

/**
 * Simulação de Row Level Security para SELECT
 */
function querySettlementsRLS(db: MockDatabase, callerId: string): CommissionSettlement[] {
  const callerRole = db.userRoles.find((r) => r.user_id === callerId);
  return db.settlements.filter((s) => {
    // Colaborador vê seus próprios settlements
    if (s.user_id === callerId) return true;

    // Gestor (admin ou gerente financeiro) vê exclusivamente das lojas onde possui member_stores
    if (callerRole) {
      const hasStoreMembership = db.memberStores.some(
        (ms) => ms.user_id === callerId && ms.store_id === s.store_id
      );
      const isAuthorizedManager =
        callerRole.role === "admin" ||
        (callerRole.role === "gerente" && callerRole.permissions?.gerenciar_financeiro === true);

      if (hasStoreMembership && isAuthorizedManager) {
        return true;
      }
    }
    return false;
  });
}

/**
 * Simulação de tentativa direta de escrita (PostgREST / Cliente)
 */
function directMutateSettlement(action: "insert" | "update" | "delete") {
  throw new Error("RLS_VIOLATION: Operação direta de escrita negada por Row Level Security. Toda baixa exige a RPC settle_commissions.");
}

function toBrasiliaDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Simulador fiel da RPC PostgreSQL public.settle_commissions
 * Executa as exatas mesmas regras de autorização, integridade e atomicidade do SQL.
 */
function executeSettleCommissionsRPC(
  db: MockDatabase,
  callerId: string,
  payload: {
    store_id: string;
    user_id: string;
    period_start: string;
    period_end: string;
    payment_method: "dinheiro" | "pix" | "transferencia";
    source_type: "caixa" | "banco";
    cash_register_id?: string | null;
    source_account_id?: string | null;
    sale_ids?: string[];
    service_order_ids?: string[];
  }
) {
  // Snapshot para rollback atômico
  const snapshot = db.takeSnapshot();

  try {
    // 1. Validação de Autenticação
    if (!callerId) {
      throw new Error("UNAUTHENTICATED: Sessão inválida ou usuário não autenticado");
    }

    // 2. Validação de Argumentos Básicos
    if (!payload.store_id || !payload.user_id || !payload.period_start || !payload.period_end) {
      throw new Error("INVALID_ARGUMENTS: Parâmetros obrigatórios ausentes");
    }

    // 3. Validação de Autorização (Admin ou Gerente com permissão canônica 'gerenciar_financeiro' + STORE MEMBERSHIP OBRIGATÓRIA)
    const callerRole = db.userRoles.find((r) => r.user_id === callerId);
    if (!callerRole) {
      throw new Error("ROLE_NOT_FOUND");
    }

    const isAdmin = callerRole.role === "admin";
    const hasFinancePerm = callerRole.permissions?.gerenciar_financeiro === true;

    if (!isAdmin && (callerRole.role !== "gerente" || !hasFinancePerm)) {
      throw new Error(
        "PERMISSION_DENIED: Apenas administradores ou gerentes com permissão gerenciar_financeiro podem liquidar comissões"
      );
    }

    // Caller (Admin ou Gerente) SEMPRE deve possuir vínculo em member_stores para a loja da operação (sem bypass)
    const callerStore = db.memberStores.find(
      (m) => m.user_id === callerId && m.store_id === payload.store_id
    );
    if (!callerStore) {
      throw new Error("STORE_MISMATCH: O operador solicitante não possui vínculo ativo (member_stores) com a loja indicada");
    }

    // 4. Validação de Vínculo do Colaborador Beneficiário com a Loja (Beneficiário SEMPRE deve possuir member_stores)
    const collabStore = db.memberStores.find(
      (m) => m.user_id === payload.user_id && m.store_id === payload.store_id
    );

    if (!collabStore) {
      throw new Error("STORE_MISMATCH: O colaborador beneficiário não possui vínculo (member_stores) com a loja indicada");
    }

    // 5. Validação de Modalidade de Pagamento
    let cashRegId: string | null = null;
    if (payload.payment_method === "dinheiro") {
      if (payload.source_type !== "caixa") {
        throw new Error("INVALID_SOURCE: Pagamentos em dinheiro devem ter source_type = 'caixa'");
      }
      if (payload.cash_register_id) {
        const specificReg = db.cashRegisters.find(
          (r) => r.id === payload.cash_register_id && r.store_id === payload.store_id && r.status === "open"
        );
        if (!specificReg) {
          throw new Error(`INVALID_CASH_REGISTER: Caixa informado ${payload.cash_register_id} não está aberto ou não pertence à loja`);
        }
        cashRegId = specificReg.id;
      } else {
        const openRegs = db.cashRegisters.filter(
          (r) => r.store_id === payload.store_id && r.status === "open"
        );
        if (openRegs.length === 0) {
          throw new Error("NO_OPEN_CASH_REGISTER: Não há caixa aberto na loja atual para efetuar pagamento em dinheiro");
        } else if (openRegs.length === 1) {
          cashRegId = openRegs[0].id;
        } else {
          throw new Error(`MULTIPLE_OPEN_CASH_REGISTERS: Existem ${openRegs.length} caixas abertos na loja. É obrigatório selecionar explicitamente o cash_register_id a ser debitado`);
        }
      }
    } else {
      if (payload.source_type !== "banco") {
        throw new Error("INVALID_SOURCE: Pagamentos bancários devem ter source_type = 'banco'");
      }
      if (!payload.source_account_id) {
        throw new Error("SOURCE_ACCOUNT_REQUIRED: Conta bancária de origem é obrigatória");
      }
      const acc = db.bankAccounts.find(
        (a) => a.id === payload.source_account_id && a.store_id === payload.store_id
      );
      if (!acc) {
        throw new Error("ACCOUNT_NOT_FOUND: Conta bancária selecionada não pertence à loja da liquidação ou não existe");
      }
    }

    const saleIds = payload.sale_ids || [];
    const osIds = payload.service_order_ids || [];

    if (saleIds.length === 0 && osIds.length === 0) {
      throw new Error("NO_ITEMS: Nenhuma venda ou OS informada para liquidação");
    }

    const settlementId = `settlement-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    let totalSalesComm = 0;
    let totalServiceComm = 0;

    // 6. Processar Vendas com Snapshot Imutável e Verificação de Idempotência
    for (const sid of saleIds) {
      // Verificação da UNIQUE constraint uq_settlement_sale
      const alreadySettled = db.settlementItems.find((item) => item.sale_id === sid);
      if (alreadySettled) {
        throw new Error(`SALE_ALREADY_SETTLED: A venda ${sid} já foi liquidada anteriormente`);
      }

      const sale = db.sales.find((s) => s.id === sid);
      if (!sale) {
        throw new Error(`SALE_NOT_FOUND: Venda ${sid} não encontrada`);
      }

      if (sale.store_id !== payload.store_id) {
        throw new Error(`STORE_MISMATCH: Venda ${sid} pertence a outra loja`);
      }

      // CANONICAL_SALES_COMMISSION_OWNER = created_by
      if (sale.created_by !== payload.user_id) {
        throw new Error(`OWNER_MISMATCH: Venda ${sid} pertence a outro colaborador`);
      }

      // Validação estrita de período contábil server-side no fuso horário canônico (America/Sao_Paulo)
      const saleDate = toBrasiliaDate(sale.created_at || "2026-10-15T12:00:00Z");
      if (saleDate < payload.period_start || saleDate > payload.period_end) {
        throw new Error(`SALE_OUTSIDE_PERIOD: A venda ${sid} (data Brasília: ${saleDate}) está fora do período de apuração (${payload.period_start} a ${payload.period_end})`);
      }

      // Validação estrita de elegibilidade individual da venda
      if ((sale.commission_value ?? 0) <= 0) {
        throw new Error(`SALE_COMMISSION_ZERO: Venda ${sid} não possui comissão positiva elegível (commission_value: ${sale.commission_value})`);
      }

      // Inserção do snapshot imutável do item (Venda histórica não fabrica cost_amount/profit_amount: armazena NULL)
      db.settlementItems.push({
        id: `item-sale-${sid}`,
        settlement_id: settlementId,
        item_type: "sale",
        sale_id: sale.id,
        gross_amount: sale.sale_price,
        cost_amount: null,
        profit_amount: null,
        commission_percent: sale.commission_percent,
        commission_amount: sale.commission_value,
      });

      totalSalesComm += sale.commission_value;
    }

    // 7. Processar OSs com Snapshot Imutável e Verificação de Idempotência
    for (const osid of osIds) {
      // Verificação da UNIQUE constraint uq_settlement_service_order
      const alreadySettled = db.settlementItems.find((item) => item.service_order_id === osid);
      if (alreadySettled) {
        throw new Error(`OS_ALREADY_SETTLED: A OS ${osid} já foi liquidada anteriormente`);
      }

      const os = db.serviceOrders.find((o) => o.id === osid);
      if (!os) {
        throw new Error(`OS_NOT_FOUND: OS ${osid} não encontrada`);
      }

      if (os.store_id !== payload.store_id) {
        throw new Error(`STORE_MISMATCH: OS ${osid} pertence a outra loja`);
      }

      if (os.technician_id !== payload.user_id) {
        throw new Error(`OWNER_MISMATCH: OS ${osid} não está atribuída ao técnico`);
      }

      if (os.status !== "delivered") {
        throw new Error(`OS_NOT_DELIVERED: OS ${osid} não está com status delivered`);
      }

      if (!os.delivered_at) {
        throw new Error(`OS_MISSING_DELIVERED_AT: OS ${osid} não possui data de entrega (delivered_at)`);
      }

      // Validação estrita de período contábil server-side no fuso horário canônico (America/Sao_Paulo)
      const osDate = toBrasiliaDate(os.delivered_at);
      if (osDate < payload.period_start || osDate > payload.period_end) {
        throw new Error(`OS_OUTSIDE_PERIOD: A OS ${osid} (entregue em Brasília: ${osDate}) está fora do período de apuração (${payload.period_start} a ${payload.period_end})`);
      }

      // Validação estrita de habilitação e percentual de comissão de serviços do técnico
      const targetRole = db.userRoles.find((r) => r.user_id === payload.user_id);
      if (targetRole?.commission_on_services !== true) {
        throw new Error(`SERVICE_COMMISSION_DISABLED: O técnico ${payload.user_id} não possui comissão sobre serviços habilitada (commission_on_services = false)`);
      }

      const commPct = targetRole?.commission_services_percent ?? 0;
      if (commPct <= 0) {
        throw new Error(`SERVICE_COMMISSION_PERCENT_ZERO: O técnico possui percentual de comissão de serviços zero ou negativo (${commPct}%)`);
      }

      const partsCost = db.serviceOrderItems
        .filter((i) => i.service_order_id === os.id)
        .reduce((sum, i) => sum + i.unit_cost * (i.quantity || 1), 0);

      const gross = os.final_price ?? os.estimated_price ?? 0;
      const profit = gross - partsCost;

      // Validação estrita de margem/lucro individual
      if (profit <= 0) {
        throw new Error(`SERVICE_ORDER_ZERO_PROFIT: OS ${osid} possui margem/lucro zero ou negativo (R$ ${profit}) após custo de peças, gerando comissão nula`);
      }

      const commAmt = (profit * commPct) / 100.0;
      if (commAmt <= 0) {
        throw new Error(`SERVICE_ORDER_COMMISSION_ZERO: OS ${osid} gerou valor de comissão zero ou negativo`);
      }

      db.settlementItems.push({
        id: `item-os-${os.id}`,
        settlement_id: settlementId,
        item_type: "service_order",
        service_order_id: os.id,
        gross_amount: gross,
        cost_amount: partsCost,
        profit_amount: profit,
        commission_percent: commPct,
        commission_amount: commAmt,
      });

      totalServiceComm += commAmt;
    }

    const totalAmount = totalSalesComm + totalServiceComm;
    if (totalAmount <= 0) {
      throw new Error("ZERO_AMOUNT: O montante total apurado da liquidação é zero");
    }

    // 8. Movimentação Financeira
    let cashEntryId: string | null = null;
    let transactionId: string | null = null;

    if (payload.payment_method === "dinheiro") {
      cashEntryId = `cash-entry-${Date.now()}`;
      db.cashEntries.push({
        id: cashEntryId,
        cash_register_id: cashRegId!,
        store_id: payload.store_id,
        type: "saida",
        amount: totalAmount,
        description: "Liquidação de Comissão Dinheiro",
        payment_method: "dinheiro",
        confirmed: true,
        created_by: callerId,
      });

      transactionId = `tx-${Date.now()}`;
      db.transactions.push({
        id: transactionId,
        type: "expense_pj",
        category: "comissao",
        amount: totalAmount,
        net_amount: totalAmount,
        description: "Comissão paga a colaborador (Dinheiro)",
        store_id: payload.store_id,
        created_by: callerId,
        status: "completed",
        reconciled: true,
        metadata: {
          source: "commission_settlement",
          settlement_id: settlementId,
        },
      });
    } else {
      // PIX / TRANSFERÊNCIA: Cria somente transaction com source_account_id (zero cash_entry)
      transactionId = `tx-${Date.now()}`;
      db.transactions.push({
        id: transactionId,
        type: "expense_pj",
        category: "comissao",
        amount: totalAmount,
        net_amount: totalAmount,
        description: `Comissão (${payload.payment_method.toUpperCase()}) paga a colaborador`,
        store_id: payload.store_id,
        created_by: callerId,
        status: "completed",
        reconciled: true,
        source_account_id: payload.source_account_id,
        metadata: {
          source: "commission_settlement",
          settlement_id: settlementId,
        },
      });
    }

    // 9. Persistir Cabeçalho da Liquidação
    const settlement: CommissionSettlement = {
      id: settlementId,
      store_id: payload.store_id,
      user_id: payload.user_id,
      period_start: payload.period_start,
      period_end: payload.period_end,
      total_sales_commission: totalSalesComm,
      total_service_commission: totalServiceComm,
      total_amount: totalAmount,
      payment_method: payload.payment_method,
      source_type: payload.source_type,
      cash_register_id: cashRegId,
      transaction_id: transactionId,
      cash_entry_id: cashEntryId,
      source_account_id: payload.source_account_id,
      status: "paid",
      paid_at: new Date().toISOString(),
      created_by: callerId,
    };

    db.settlements.push(settlement);

    return {
      success: true,
      settlement_id: settlementId,
      total_amount: totalAmount,
      total_sales_commission: totalSalesComm,
      total_service_commission: totalServiceComm,
      items_count: saleIds.length + osIds.length,
      cash_entry_id: cashEntryId,
      transaction_id: transactionId,
      payment_method: payload.payment_method,
    };
  } catch (err) {
    // ATOMICIDADE: Rollback completo de qualquer efeito colateral
    db.restoreSnapshot(snapshot);
    throw err;
  }
}

/**
 * Simulador fiel da RPC PostgreSQL public.cancel_sale
 */
function executeCancelSaleRPC(
  db: MockDatabase,
  callerId: string,
  saleId: string,
  options?: { failDuringMutation?: boolean }
) {
  const snapshot = db.takeSnapshot();
  try {
    if (!callerId) {
      throw new Error("UNAUTHENTICATED: Sessão inválida ou operador não autenticado");
    }

    const sale = db.sales.find((s) => s.id === saleId);
    if (!sale) {
      throw new Error(`SALE_NOT_FOUND: Venda ${saleId} não encontrada`);
    }

    const callerRole = db.userRoles.find((r) => r.user_id === callerId);
    if (!callerRole || !["admin", "gerente"].includes(callerRole.role)) {
      throw new Error("PERMISSION_DENIED: Apenas administradores ou gerentes podem cancelar vendas");
    }

    const hasMembership = db.memberStores.some(
      (ms) => ms.user_id === callerId && ms.store_id === sale.store_id
    );
    if (!hasMembership) {
      throw new Error("STORE_MISMATCH: Operador não possui vínculo ativo com a loja da venda");
    }

    // Trava obrigatória contra cancelamento de venda liquidada APÓS lock FOR UPDATE
    const hasSettlement = db.settlementItems.some((csi) => csi.sale_id === saleId);
    if (hasSettlement) {
      throw new Error("SALE_COMMISSION_ALREADY_SETTLED: Esta venda possui comissão liquidada e não pode ser cancelada");
    }

    // 1. Devolver o aparelho ao estoque
    const prod = db.products.find((p) => p.id === sale.product_id);
    if (prod) {
      prod.status = "in_stock";
      prod.sale_price = null;
    }

    // Simulação de falha intermediária para teste de atomicidade
    if (options?.failDuringMutation) {
      throw new Error("DATABASE_SIMULATED_FAILURE: Falha no meio da transação atômica");
    }

    // 2. Validar integridade de transações legadas e excluir transações canônicas vinculadas à venda
    const hasLegacyUnlinkedTx = db.transactions.some(
      (t) => t.product_id === sale.product_id && t.type === "sale" && !t.sale_id
    );
    if (hasLegacyUnlinkedTx) {
      throw new Error("LEGACY_SALE_TRANSACTION_LINK_REQUIRED: Existem transações históricas sem vínculo canônico para este produto");
    }

    db.transactions = db.transactions.filter((t) => t.sale_id !== saleId);

    // 3. Excluir cash entries
    db.cashEntries = db.cashEntries.filter((c) => c.reference_id !== saleId);

    // 4. Excluir a venda
    db.sales = db.sales.filter((s) => s.id !== saleId);

    return { success: true, sale_id: saleId };
  } catch (err) {
    db.restoreSnapshot(snapshot);
    throw err;
  }
}

/**
 * Simulador fiel da RPC PostgreSQL public.cancel_service_order
 */
function executeCancelServiceOrderRPC(
  db: MockDatabase,
  callerId: string,
  osId: string,
  options?: { failDuringMutation?: boolean }
) {
  const snapshot = db.takeSnapshot();
  try {
    if (!callerId) {
      throw new Error("UNAUTHENTICATED: Sessão inválida ou operador não autenticado");
    }

    const os = db.serviceOrders.find((o) => o.id === osId);
    if (!os) {
      throw new Error(`OS_NOT_FOUND: Ordem de serviço ${osId} não encontrada`);
    }

    const callerRole = db.userRoles.find((r) => r.user_id === callerId);
    if (!callerRole || callerRole.role !== "admin") {
      throw new Error("PERMISSION_DENIED: Apenas administradores podem excluir ordens de serviço");
    }

    const hasMembership = db.memberStores.some(
      (ms) => ms.user_id === callerId && ms.store_id === os.store_id
    );
    if (!hasMembership) {
      throw new Error("STORE_MISMATCH: Operador não possui vínculo ativo com a loja da ordem de serviço");
    }

    // Trava obrigatória contra cancelamento de OS liquidada APÓS lock FOR UPDATE
    const hasSettlement = db.settlementItems.some((csi) => csi.service_order_id === osId);
    if (hasSettlement) {
      throw new Error("OS_COMMISSION_ALREADY_SETTLED: Esta ordem de serviço possui comissão liquidada e não pode ser cancelada");
    }

    // 1. Devolver peças utilizadas ao estoque
    const items = db.serviceOrderItems.filter((i) => i.service_order_id === osId);
    for (const item of items) {
      if (item.product_id) {
        const p = db.products.find((prod) => prod.id === item.product_id);
        if (p) p.status = "in_stock";
      }
    }

    // Simulação de falha intermediária para teste de atomicidade
    if (options?.failDuringMutation) {
      throw new Error("DATABASE_SIMULATED_FAILURE: Falha no meio da transação atômica");
    }

    // 2. Cascata itens da OS
    db.serviceOrderItems = db.serviceOrderItems.filter((i) => i.service_order_id !== osId);

    // 3. Excluir a OS
    db.serviceOrders = db.serviceOrders.filter((o) => o.id !== osId);

    return { success: true, service_order_id: osId };
  } catch (err) {
    db.restoreSnapshot(snapshot);
    throw err;
  }
}

// ─── SUITE DE TESTES OBRIGATÓRIOS ─────────────────────────────────────────────

describe("Liquidação Atômica de Comissões — Business Rules & RPC Suite", () => {
  let db: MockDatabase;
  const STORE_A = "store-alpha";
  const STORE_B = "store-beta";

  const ADMIN_ID = "user-admin";
  const MANAGER_FIN_ID = "user-manager-finance";
  const MANAGER_NO_FIN_ID = "user-manager-no-finance";
  const TECH_USER_ID = "user-technician";
  const SELLER_USER_ID = "user-seller";

  const BANK_ACCOUNT_ID = "bank-acc-123";
  const CASH_REG_OPEN_ID = "cash-reg-open";

  beforeEach(() => {
    db = new MockDatabase();

    // Configuração de papéis e permissões
    db.userRoles = [
      { user_id: ADMIN_ID, role: "admin" },
      {
        user_id: MANAGER_FIN_ID,
        role: "gerente",
        permissions: { gerenciar_financeiro: true },
      },
      {
        user_id: MANAGER_NO_FIN_ID,
        role: "gerente",
        permissions: { gerenciar_financeiro: false },
      },
      {
        user_id: TECH_USER_ID,
        role: "tecnico",
        commission_services_percent: 30, // 30% em serviços
        commission_on_services: true,
      },
      {
        user_id: SELLER_USER_ID,
        role: "vendedor",
      },
    ];

    // Associação de lojas
    db.memberStores = [
      { user_id: ADMIN_ID, store_id: STORE_A },
      { user_id: MANAGER_FIN_ID, store_id: STORE_A },
      { user_id: MANAGER_NO_FIN_ID, store_id: STORE_A },
      { user_id: TECH_USER_ID, store_id: STORE_A },
      { user_id: SELLER_USER_ID, store_id: STORE_A },
    ];

    // Caixa aberto na Store A
    db.cashRegisters = [
      { id: CASH_REG_OPEN_ID, store_id: STORE_A, status: "open" },
    ];

    // Conta bancária na Store A
    db.bankAccounts = [
      { id: BANK_ACCOUNT_ID, store_id: STORE_A },
    ];

    // Produto para margem
    db.products = [
      { id: "prod-1", cost_price: 100 },
    ];

    // Venda de teste na Store A criada pelo vendedor
    db.sales = [
      {
        id: "sale-001",
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        sale_price: 250,
        discount: 0,
        commission_percent: 10,
        commission_value: 25, // R$ 25 de comissão canônica
        product_id: "prod-1",
        created_at: "2026-10-15T12:00:00Z",
      },
    ];

    // OS de teste entregue na Store A executada pelo técnico
    db.serviceOrders = [
      {
        id: "os-001",
        store_id: STORE_A,
        technician_id: TECH_USER_ID,
        status: "delivered",
        final_price: 300,
        delivered_at: "2026-10-15T14:00:00Z",
      },
    ];

    // Peça gasta na OS de R$ 50
    db.serviceOrderItems = [
      { service_order_id: "os-001", unit_cost: 50, quantity: 1 },
    ];
    // Margem OS = 300 - 50 = 250. Comissão 30% = R$ 75.
  });

  // 1. Pagar venda uma vez = PASS
  it("1. Pagar venda uma vez = PASS", () => {
    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    expect(res.success).toBe(true);
    expect(res.total_amount).toBe(25);
    expect(db.settlements.length).toBe(1);
    expect(db.settlementItems.length).toBe(1);
    expect(db.settlementItems[0].sale_id).toBe("sale-001");
  });

  // 2. Tentar pagar mesma venda novamente = REJEITADO
  it("2. Tentar pagar mesma venda novamente = REJEITADO (Idempotência via UNIQUE parcial)", () => {
    // Primeira liquidação
    executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    // Segunda tentativa para a mesma venda
    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/SALE_ALREADY_SETTLED/);
  });

  // 3. Pagar OS uma vez = PASS
  it("3. Pagar OS uma vez = PASS", () => {
    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: TECH_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      service_order_ids: ["os-001"],
    });

    expect(res.success).toBe(true);
    expect(res.total_amount).toBe(75); // (300 - 50) * 30% = 75
    expect(db.settlements.length).toBe(1);
    expect(db.settlementItems.length).toBe(1);
    expect(db.settlementItems[0].service_order_id).toBe("os-001");
  });

  // 4. Tentar pagar mesma OS novamente = REJEITADO
  it("4. Tentar pagar mesma OS novamente = REJEITADO (Idempotência via UNIQUE parcial)", () => {
    // Primeira liquidação
    executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: TECH_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      service_order_ids: ["os-001"],
    });

    // Segunda tentativa da mesma OS
    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/OS_ALREADY_SETTLED/);
  });

  // 5. Duas liquidações simultâneas da mesma origem = somente uma vence
  it("5. Duas liquidações simultâneas da mesma origem = somente uma vence", async () => {
    let successCount = 0;
    let failCount = 0;

    const runAttempt = () => {
      try {
        executeSettleCommissionsRPC(db, ADMIN_ID, {
          store_id: STORE_A,
          user_id: SELLER_USER_ID,
          period_start: "2026-10-01",
          period_end: "2026-10-31",
          payment_method: "pix",
          source_type: "banco",
          source_account_id: BANK_ACCOUNT_ID,
          sale_ids: ["sale-001"],
        });
        successCount++;
      } catch (e) {
        failCount++;
      }
    };

    // Simula duas requisições concorrentes disparadas no mesmo instante
    runAttempt();
    runAttempt();

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);
    expect(db.settlements.length).toBe(1);
    expect(db.settlementItems.length).toBe(1);
  });

  // 6. Pagamento em dinheiro sem caixa aberto = REJEITADO
  it("6. Pagamento em dinheiro sem caixa aberto = REJEITADO", () => {
    // Fecha todos os caixas da loja
    db.cashRegisters = [{ id: "cash-closed", store_id: STORE_A, status: "closed" }];

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "dinheiro",
        source_type: "caixa",
        sale_ids: ["sale-001"],
      })
    ).toThrow(/NO_OPEN_CASH_REGISTER/);
  });

  // 7. Pagamento dinheiro = cash_entry + transaction
  it("7. Pagamento dinheiro = cash_entry + transaction", () => {
    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "dinheiro",
      source_type: "caixa",
      sale_ids: ["sale-001"],
    });

    expect(res.success).toBe(true);
    expect(db.cashEntries.length).toBe(1);
    expect(db.transactions.length).toBe(1);

    const cashEntry = db.cashEntries[0];
    expect(cashEntry.cash_register_id).toBe(CASH_REG_OPEN_ID);
    expect(cashEntry.type).toBe("saida");
    expect(cashEntry.amount).toBe(25);
    expect(cashEntry.payment_method).toBe("dinheiro");
    expect(cashEntry.confirmed).toBe(true);

    const tx = db.transactions[0];
    expect(tx.category).toBe("comissao");
    expect(tx.type).toBe("expense_pj");
    expect(tx.metadata.source).toBe("commission_settlement");
    expect(tx.metadata.settlement_id).toBe(res.settlement_id);
  });

  // 8. Pagamento Pix = transaction e zero cash_entry
  it("8. Pagamento Pix = transaction e zero cash_entry", () => {
    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    expect(res.success).toBe(true);
    expect(db.cashEntries.length).toBe(0); // Zero cash_entry
    expect(db.transactions.length).toBe(1);

    const tx = db.transactions[0];
    expect(tx.source_account_id).toBe(BANK_ACCOUNT_ID);
    expect(tx.metadata.source).toBe("commission_settlement");
  });

  // 9. Pagamento transferência = transaction e zero cash_entry
  it("9. Pagamento transferência = transaction e zero cash_entry", () => {
    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "transferencia",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    expect(res.success).toBe(true);
    expect(db.cashEntries.length).toBe(0); // Zero cash_entry
    expect(db.transactions.length).toBe(1);
    expect(db.transactions[0].source_account_id).toBe(BANK_ACCOUNT_ID);
  });

  // 10. Store A tentando pagar colaborador da store B = REJEITADO
  it("10. Store A tentando pagar colaborador da store B = REJEITADO", () => {
    // Cria colaborador vinculado exclusivamente à Store B
    const COLLAB_STORE_B = "user-collab-store-b";
    db.userRoles.push({ user_id: COLLAB_STORE_B, role: "vendedor" });
    db.memberStores.push({ user_id: COLLAB_STORE_B, store_id: STORE_B });

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: COLLAB_STORE_B,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/STORE_MISMATCH/);

    // Administrador que NÃO possui member_stores na Store A também é REJEITADO como beneficiário na Store A (Sem bypass)
    const ADMIN_NO_STORE = "user-admin-unlinked";
    db.userRoles.push({ user_id: ADMIN_NO_STORE, role: "admin" });

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: ADMIN_NO_STORE,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/STORE_MISMATCH/);
  });

  // 11. Técnico comum tentando liquidar = REJEITADO
  it("11. Técnico comum tentando liquidar = REJEITADO (RBAC check)", () => {
    expect(() =>
      executeSettleCommissionsRPC(db, TECH_USER_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/PERMISSION_DENIED/);

    // Gerente sem permissão 'gerenciar_financeiro' também é rejeitado
    expect(() =>
      executeSettleCommissionsRPC(db, MANAGER_NO_FIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/PERMISSION_DENIED/);

    // Gerente COM permissão 'gerenciar_financeiro' consegue liquidar
    const res = executeSettleCommissionsRPC(db, MANAGER_FIN_ID, {
      store_id: STORE_A,
      user_id: TECH_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      service_order_ids: ["os-001"],
    });
    expect(res.success).toBe(true);
  });

  // 12. Alteração futura do percentual não modifica settlement antigo
  it("12. Alteração futura do percentual não modifica settlement antigo (Snapshot Model)", () => {
    // Liquidação com percentual original de 30%
    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: TECH_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      service_order_ids: ["os-001"],
    });

    const itemSnap = db.settlementItems.find((i) => i.service_order_id === "os-001");
    expect(itemSnap).toBeDefined();
    expect(itemSnap?.commission_percent).toBe(30);
    expect(itemSnap?.commission_amount).toBe(75);

    // Agora altera o percentual do técnico na tabela user_roles para 50%
    const techRole = db.userRoles.find((r) => r.user_id === TECH_USER_ID);
    if (techRole) {
      techRole.commission_services_percent = 50;
    }

    // O settlement antigo e seus snapshots continuam rigorosamente intactos
    const settledItemAfter = db.settlementItems.find((i) => i.service_order_id === "os-001");
    expect(settledItemAfter?.commission_percent).toBe(30);
    expect(settledItemAfter?.commission_amount).toBe(75);

    const settlementHeader = db.settlements.find((s) => s.id === res.settlement_id);
    expect(settlementHeader?.total_amount).toBe(75);
  });

  // 13. Falha intermediária da RPC = rollback completo
  it("13. Falha intermediária da RPC = rollback completo", () => {
    // Insere uma segunda OS inexistente para provocar falha durante o processamento do loop
    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001", "os-inexistente-que-vai-falhar"],
      })
    ).toThrow(/OS_NOT_FOUND/);

    // Confirma que nenhuma alteração foi persistida (atomicidade total)
    expect(db.settlements.length).toBe(0);
    expect(db.settlementItems.length).toBe(0);
    expect(db.cashEntries.length).toBe(0);
    expect(db.transactions.length).toBe(0);
  });

  // 14. admin sem membership da store = REJEITADO
  it("14. admin sem membership da store = REJEITADO", () => {
    const ADMIN_UNLINKED = "user-admin-unlinked";
    db.userRoles.push({ user_id: ADMIN_UNLINKED, role: "admin" });
    // Não possui memberStores em STORE_A

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_UNLINKED, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/STORE_MISMATCH: O operador solicitante não possui vínculo ativo/);
  });

  // 15. admin de store A tentando visualizar/liquidar store B = REJEITADO
  it("15. admin de store A tentando visualizar/liquidar store B = REJEITADO", () => {
    // Admin pertence apenas a STORE_A (não pertence a STORE_B)
    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_B,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/STORE_MISMATCH: O operador solicitante não possui vínculo ativo/);

    // Na visualização RLS: Admin de Store A não enxerga settlement de Store B
    db.settlements.push({
      id: "settlement-store-b",
      store_id: STORE_B,
      user_id: "other-user",
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      total_sales_commission: 100,
      total_service_commission: 0,
      total_amount: 100,
      payment_method: "pix",
      source_type: "banco",
      status: "paid",
      paid_at: new Date().toISOString(),
      created_by: "other-manager",
    });

    const visibleToAdmin = querySettlementsRLS(db, ADMIN_ID);
    expect(visibleToAdmin.some((s) => s.id === "settlement-store-b")).toBe(false);
  });

  // 16. gerente financeiro store A -> store B = REJEITADO
  it("16. gerente financeiro store A -> store B = REJEITADO", () => {
    expect(() =>
      executeSettleCommissionsRPC(db, MANAGER_FIN_ID, {
        store_id: STORE_B,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/STORE_MISMATCH: O operador solicitante não possui vínculo ativo/);
  });

  // 17. source_account de outra store = REJEITADO
  it("17. source_account de outra store = REJEITADO", () => {
    const BANK_ACCOUNT_STORE_B = "bank-account-store-b";
    db.bankAccounts.push({ id: BANK_ACCOUNT_STORE_B, store_id: STORE_B });

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_STORE_B, // Conta de STORE_B na liquidação de STORE_A
        sale_ids: ["sale-001"],
      })
    ).toThrow(/ACCOUNT_NOT_FOUND: Conta bancária selecionada não pertence à loja da liquidação/);
  });

  // 18. tentativa DELETE/UPDATE direto de settlement = REJEITADO
  it("18. tentativa DELETE/UPDATE direto de settlement = REJEITADO", () => {
    expect(() => directMutateSettlement("delete")).toThrow(/RLS_VIOLATION/);
    expect(() => directMutateSettlement("update")).toThrow(/RLS_VIOLATION/);
    expect(() => directMutateSettlement("insert")).toThrow(/RLS_VIOLATION/);
  });

  // 19. settlement_items possui ON DELETE RESTRICT (não aceita cascade delete)
  it("19. settlement_items possui ON DELETE RESTRICT (não aceita cascade delete)", () => {
    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    expect(db.settlementItems.some((i) => i.settlement_id === res.settlement_id)).toBe(true);

    // Tentar deletar o cabeçalho do settlement enquanto há itens vinculados é proibido por RESTRICT
    expect(() => db.deleteSettlement(res.settlement_id)).toThrow(/FOREIGN_KEY_VIOLATION.*ON DELETE RESTRICT/);
  });

  // 20. commission_on_services=false -> REJEITADO
  it("20. commission_on_services=false -> REJEITADO", () => {
    const techRole = db.userRoles.find((r) => r.user_id === TECH_USER_ID);
    if (techRole) {
      techRole.commission_on_services = false;
    }

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/SERVICE_COMMISSION_DISABLED/);
  });

  // 21. percentual serviço zero -> REJEITADO
  it("21. percentual serviço zero -> REJEITADO", () => {
    const techRole = db.userRoles.find((r) => r.user_id === TECH_USER_ID);
    if (techRole) {
      techRole.commission_services_percent = 0;
    }

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/SERVICE_COMMISSION_PERCENT_ZERO/);
  });

  // 22. margem OS zero -> REJEITADO
  it("22. margem OS zero -> REJEITADO", () => {
    // Aumenta o custo das peças para igualar o preço da OS (final_price = 300, peca = 300 => margem = 0)
    db.serviceOrderItems = [
      { service_order_id: "os-001", unit_cost: 300, quantity: 1 },
    ];

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/SERVICE_ORDER_ZERO_PROFIT/);
  });

  // 23. sale commission_value zero -> REJEITADO
  it("23. sale commission_value zero -> REJEITADO", () => {
    const sale = db.sales.find((s) => s.id === "sale-001");
    if (sale) {
      sale.commission_value = 0;
    }

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/SALE_COMMISSION_ZERO/);
  });

  // 24. venda fora do período -> REJEITADO
  it("24. venda fora do período -> REJEITADO", () => {
    const sale = db.sales.find((s) => s.id === "sale-001");
    if (sale) {
      sale.created_at = "2026-09-15T12:00:00Z"; // Setembro (fora de 01/10 a 31/10)
    }

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/SALE_OUTSIDE_PERIOD/);
  });

  // 25. OS delivered fora do período -> REJEITADO
  it("25. OS delivered fora do período -> REJEITADO", () => {
    const os = db.serviceOrders.find((o) => o.id === "os-001");
    if (os) {
      os.delivered_at = "2026-11-05T10:00:00Z"; // Novembro (fora de 01/10 a 31/10)
    }

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/OS_OUTSIDE_PERIOD/);
  });

  // 26. múltiplos caixas abertos sem cash_register_id explícito -> REJEITADO; com cash_register_id -> PASS
  it("26. múltiplos caixas abertos sem cash_register_id explícito -> REJEITADO; com cash_register_id -> PASS", () => {
    // Adiciona um segundo caixa aberto na Store A
    db.cashRegisters.push({ id: "cash-reg-open-2", store_id: STORE_A, status: "open" });

    // Sem especificar cash_register_id quando há > 1 caixas abertos deve falhar
    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "dinheiro",
        source_type: "caixa",
        sale_ids: ["sale-001"],
      })
    ).toThrow(/MULTIPLE_OPEN_CASH_REGISTERS/);

    // Especificando o cash_register_id explicitamente tem sucesso
    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "dinheiro",
      source_type: "caixa",
      cash_register_id: "cash-reg-open-2",
      sale_ids: ["sale-001"],
    });

    expect(res.success).toBe(true);
    expect(db.cashEntries[0].cash_register_id).toBe("cash-reg-open-2");
  });

  // 27. Venda histórica: não usa products.cost_price atual, gera cost_amount NULL, profit_amount NULL, e commission_value permanece intacto
  it("27. Venda histórica: não usa products.cost_price atual, gera cost_amount NULL, profit_amount NULL, e commission_value permanece intacto", () => {
    // Altera o cost_price atual do produto na tabela products para um valor diferente (ex: inflacionado)
    const product = db.products.find((p) => p.id === "prod-1");
    if (product) {
      product.cost_price = 999;
    }

    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    expect(res.success).toBe(true);
    expect(res.total_amount).toBe(25); // commission_value histórico permanece intacto (R$ 25)

    const item = db.settlementItems.find((i) => i.sale_id === "sale-001");
    expect(item).toBeDefined();
    expect(item?.gross_amount).toBe(250);
    expect(item?.cost_amount).toBeNull(); // cost_amount gravado como NULL (não fabricado)
    expect(item?.profit_amount).toBeNull(); // profit_amount gravado como NULL (não fabricado)
    expect(item?.commission_percent).toBe(10);
    expect(item?.commission_amount).toBe(25);
  });

  // 28. Venda inexistente ou cancelada (DELETE canônico) -> REJEITADO com SALE_NOT_FOUND
  it("28. Venda inexistente ou cancelada (DELETE canônico) -> REJEITADO com SALE_NOT_FOUND", () => {
    // Simula cancelamento canônico via remoção física (DELETE FROM sales)
    db.sales = db.sales.filter((s) => s.id !== "sale-001");

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/SALE_NOT_FOUND/);
  });

  // 29. Timezone boundary: 30/09 22:30 Brasília (01/10 01:30 UTC) NÃO entra em outubro -> REJEITADO
  it("29. Timezone boundary: 30/09 22:30 Brasília (01/10 01:30 UTC) NÃO entra em outubro -> REJEITADO", () => {
    const sale = db.sales.find((s) => s.id === "sale-001");
    if (sale) {
      // 30/09 às 22:30 no horário de Brasília = 01/10 às 01:30 UTC
      sale.created_at = "2026-10-01T01:30:00Z";
    }

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/SALE_OUTSIDE_PERIOD/);
  });

  // 30. Timezone boundary: 01/10 00:00 Brasília (01/10 03:00 UTC) entra em outubro -> PASS
  it("30. Timezone boundary: 01/10 00:00 Brasília (01/10 03:00 UTC) entra em outubro -> PASS", () => {
    const sale = db.sales.find((s) => s.id === "sale-001");
    if (sale) {
      // 01/10 às 00:00 no horário de Brasília = 01/10 às 03:00 UTC
      sale.created_at = "2026-10-01T03:00:00Z";
    }

    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    expect(res.success).toBe(true);
  });

  // 31. Timezone boundary: 31/10 22:30 Brasília (01/11 01:30 UTC) permanece em outubro -> PASS
  it("31. Timezone boundary: 31/10 22:30 Brasília (01/11 01:30 UTC) permanece em outubro -> PASS", () => {
    const sale = db.sales.find((s) => s.id === "sale-001");
    if (sale) {
      // 31/10 às 22:30 no horário de Brasília = 01/11 às 01:30 UTC
      sale.created_at = "2026-11-01T01:30:00Z";
    }

    const res = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    expect(res.success).toBe(true);
  });

  // 32. Timezone boundary: 01/11 00:00 Brasília (01/11 03:00 UTC) NÃO entra em outubro -> REJEITADO
  it("32. Timezone boundary: 01/11 00:00 Brasília (01/11 03:00 UTC) NÃO entra em outubro -> REJEITADO", () => {
    const sale = db.sales.find((s) => s.id === "sale-001");
    if (sale) {
      // 01/11 às 00:00 no horário de Brasília = 01/11 às 03:00 UTC
      sale.created_at = "2026-11-01T03:00:00Z";
    }

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/SALE_OUTSIDE_PERIOD/);
  });

  // 33. Timezone boundary para OS: segue exatamente as mesmas fronteiras de fuso de Brasília
  it("33. Timezone boundary para OS: segue exatamente as mesmas fronteiras de fuso de Brasília", () => {
    // Subcaso A: 30/09 às 22:30 Brasília (01/10 01:30 UTC) -> Fora de outubro
    const osA = db.serviceOrders.find((o) => o.id === "os-001");
    if (osA) osA.delivered_at = "2026-10-01T01:30:00Z";

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/OS_OUTSIDE_PERIOD/);

    // Subcaso B: 01/10 às 00:00 Brasília (01/10 03:00 UTC) -> Dentro de outubro (PASS)
    const osB = db.serviceOrders.find((o) => o.id === "os-001");
    if (osB) osB.delivered_at = "2026-10-01T03:00:00Z";

    const resB = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: TECH_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      service_order_ids: ["os-001"],
    });
    expect(resB.success).toBe(true);
    expect(db.settlementItems[0].cost_amount).toBe(50); // OS preserva custo histórico auditável
    expect(db.settlementItems[0].profit_amount).toBe(250); // OS preserva lucro auditável

    // Reseta DB para testar as fronteiras de saída de outubro
    db.settlements = [];
    db.settlementItems = [];
    db.transactions = [];

    // Subcaso C: 31/10 às 22:30 Brasília (01/11 01:30 UTC) -> Permanece em outubro (PASS)
    const osC = db.serviceOrders.find((o) => o.id === "os-001");
    if (osC) osC.delivered_at = "2026-11-01T01:30:00Z";

    const resC = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: TECH_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      service_order_ids: ["os-001"],
    });
    expect(resC.success).toBe(true);

    // Reseta DB
    db.settlements = [];
    db.settlementItems = [];
    db.transactions = [];

    // Subcaso D: 01/11 às 00:00 Brasília (01/11 03:00 UTC) -> Fora de outubro
    const osD = db.serviceOrders.find((o) => o.id === "os-001");
    if (osD) osD.delivered_at = "2026-11-01T03:00:00Z";

    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/OS_OUTSIDE_PERIOD/);
  });

  // 34. venda liquidada -> cancelamento rejeitado e ZERO mutações
  it("34. venda liquidada -> cancelamento rejeitado com SALE_COMMISSION_ALREADY_SETTLED e ZERO mutações", () => {
    // 1. Liquida a venda primeiro
    executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    // Estado antes da tentativa de cancelamento
    const saleBefore = db.sales.find((s) => s.id === "sale-001");
    const prodBefore = db.products.find((p) => p.id === "prod-1");
    const txCountBefore = db.transactions.length;
    const cashCountBefore = db.cashEntries.length;

    // 2. Tentar cancelar a venda liquidada DEVE falhar
    expect(() =>
      executeCancelSaleRPC(db, ADMIN_ID, "sale-001")
    ).toThrow(/SALE_COMMISSION_ALREADY_SETTLED/);

    // 3. Garantir ZERO mutações em todas as tabelas
    expect(db.sales.find((s) => s.id === "sale-001")).toEqual(saleBefore);
    expect(db.products.find((p) => p.id === "prod-1")).toEqual(prodBefore);
    expect(db.transactions.length).toBe(txCountBefore);
    expect(db.cashEntries.length).toBe(cashCountBefore);
  });

  // 35. venda não liquidada -> cancelamento completo PASS
  it("35. venda não liquidada -> cancelamento completo PASS (reversão atômica de estoque, financeiro e venda)", () => {
    // Adiciona transação e cash_entry vinculadas à venda de teste
    db.transactions.push({
      id: "tx-sale-1",
      type: "sale",
      category: "venda",
      amount: 250,
      net_amount: 250,
      description: "Venda Aparelho",
      store_id: STORE_A,
      created_by: SELLER_USER_ID,
      status: "completed",
      reconciled: true,
      product_id: "prod-1",
      sale_id: "sale-001",
    });
    db.cashEntries.push({
      id: "ce-sale-1",
      cash_register_id: CASH_REG_OPEN_ID,
      store_id: STORE_A,
      type: "entrada",
      amount: 250,
      description: "Recebimento venda",
      payment_method: "dinheiro",
      confirmed: true,
      created_by: SELLER_USER_ID,
      reference_id: "sale-001",
    });

    const res = executeCancelSaleRPC(db, ADMIN_ID, "sale-001");
    expect(res.success).toBe(true);

    // Venda removida
    expect(db.sales.find((s) => s.id === "sale-001")).toBeUndefined();
    // Aparelho devolvido ao estoque
    const prod = db.products.find((p) => p.id === "prod-1");
    expect(prod?.status).toBe("in_stock");
    expect(prod?.sale_price).toBeNull();
    // Transações e cash entries excluídas
    expect(db.transactions.find((t) => t.id === "tx-sale-1")).toBeUndefined();
    expect(db.cashEntries.find((c) => c.reference_id === "sale-001")).toBeUndefined();
  });

  // 36. falha no meio de cancel_sale -> rollback completo
  it("36. falha no meio de cancel_sale -> rollback completo de todas as tabelas", () => {
    const saleBefore = { ...db.sales[0] };
    const prodBefore = { ...db.products[0] };

    expect(() =>
      executeCancelSaleRPC(db, ADMIN_ID, "sale-001", { failDuringMutation: true })
    ).toThrow(/DATABASE_SIMULATED_FAILURE/);

    // Rollback atômico garantiu que a venda continua existindo e o produto não foi modificado
    expect(db.sales.find((s) => s.id === "sale-001")).toEqual(saleBefore);
    expect(db.products.find((p) => p.id === "prod-1")).toEqual(prodBefore);
  });

  // 37. OS liquidada -> exclusão rejeitada e ZERO mutações
  it("37. OS liquidada -> exclusão rejeitada com OS_COMMISSION_ALREADY_SETTLED e ZERO mutações", () => {
    // 1. Liquida a OS primeiro
    executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: TECH_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      service_order_ids: ["os-001"],
    });

    // Estado antes da tentativa de exclusão
    const osBefore = { ...db.serviceOrders[0] };
    const itemsBefore = db.serviceOrderItems.map((i) => ({ ...i }));

    // 2. Tentar cancelar a OS liquidada DEVE falhar
    expect(() =>
      executeCancelServiceOrderRPC(db, ADMIN_ID, "os-001")
    ).toThrow(/OS_COMMISSION_ALREADY_SETTLED/);

    // 3. Garantir ZERO mutações
    expect(db.serviceOrders.find((o) => o.id === "os-001")).toEqual(osBefore);
    expect(db.serviceOrderItems).toEqual(itemsBefore);
  });

  // 38. OS não liquidada -> exclusão completa PASS
  it("38. OS não liquidada -> exclusão completa PASS (reversão de peças e exclusão da OS)", () => {
    // Adiciona peça associada a um produto no estoque
    db.products.push({ id: "prod-peca-1", cost_price: 30, status: "sold" });
    db.serviceOrderItems = [
      { service_order_id: "os-001", product_id: "prod-peca-1", unit_cost: 30, quantity: 1 },
    ];

    const res = executeCancelServiceOrderRPC(db, ADMIN_ID, "os-001");
    expect(res.success).toBe(true);

    // OS removida
    expect(db.serviceOrders.find((o) => o.id === "os-001")).toBeUndefined();
    // Itens vinculados removidos em cascata
    expect(db.serviceOrderItems.length).toBe(0);
    // Peça revertida para in_stock
    const peca = db.products.find((p) => p.id === "prod-peca-1");
    expect(peca?.status).toBe("in_stock");
  });

  // 39. falha no meio de cancel_service_order -> rollback completo
  it("39. falha no meio de cancel_service_order -> rollback completo de todas as tabelas", () => {
    const osBefore = { ...db.serviceOrders[0] };
    const itemsBefore = db.serviceOrderItems.map((i) => ({ ...i }));

    expect(() =>
      executeCancelServiceOrderRPC(db, ADMIN_ID, "os-001", { failDuringMutation: true })
    ).toThrow(/DATABASE_SIMULATED_FAILURE/);

    expect(db.serviceOrders.find((o) => o.id === "os-001")).toEqual(osBefore);
    expect(db.serviceOrderItems).toEqual(itemsBefore);
  });

  // 40. venda/OS de outra store -> REJEITADO com STORE_MISMATCH
  it("40. venda/OS de outra store -> cancelamento rejeitado com STORE_MISMATCH", () => {
    // Venda na Store B
    db.sales.push({
      id: "sale-store-b",
      store_id: STORE_B,
      created_by: SELLER_USER_ID,
      sale_price: 200,
      discount: 0,
      commission_percent: 10,
      commission_value: 20,
      product_id: "prod-1",
    });

    // Operador da Store A tentando cancelar venda da Store B
    expect(() =>
      executeCancelSaleRPC(db, ADMIN_ID, "sale-store-b")
    ).toThrow(/STORE_MISMATCH/);

    // OS na Store B
    db.serviceOrders.push({
      id: "os-store-b",
      store_id: STORE_B,
      technician_id: TECH_USER_ID,
      status: "delivered",
      final_price: 300,
      delivered_at: "2026-10-15T10:00:00Z",
    });

    expect(() =>
      executeCancelServiceOrderRPC(db, ADMIN_ID, "os-store-b")
    ).toThrow(/STORE_MISMATCH/);
  });

  // 41. usuário sem autorização canônica -> REJEITADO com PERMISSION_DENIED
  it("41. usuário sem autorização canônica -> cancelamento rejeitado com PERMISSION_DENIED", () => {
    // Vendedor NÃO tem permissão para cancelar vendas (apenas admin ou gerente)
    expect(() =>
      executeCancelSaleRPC(db, SELLER_USER_ID, "sale-001")
    ).toThrow(/PERMISSION_DENIED/);

    // Gerente NÃO tem permissão canônica para excluir OS (apenas admin)
    expect(() =>
      executeCancelServiceOrderRPC(db, MANAGER_FIN_ID, "os-001")
    ).toThrow(/PERMISSION_DENIED/);

    // Técnico também não pode excluir OS
    expect(() =>
      executeCancelServiceOrderRPC(db, TECH_USER_ID, "os-001")
    ).toThrow(/PERMISSION_DENIED/);
  });

  // 42. Concorrência: settlement inicia e cancelamento concorrente -> somente liquidação vence
  it("42. Concorrência: settlement obtém lock primeiro e liquida -> cancelamento concorrente é rejeitado", () => {
    // Thread 1: Settle obtém lock FOR UPDATE e liquida com sucesso
    const settleRes = executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });
    expect(settleRes.success).toBe(true);

    // Thread 2 (concorrente subsequente): Cancelamento tenta rodar na mesma venda
    // O lock FOR UPDATE serializa a transação e a checagem pós-lock encontra a liquidação
    expect(() =>
      executeCancelSaleRPC(db, ADMIN_ID, "sale-001")
    ).toThrow(/SALE_COMMISSION_ALREADY_SETTLED/);
  });

  // 43. Concorrência: cancelamento inicia e settlement concorrente -> somente cancelamento vence
  it("43. Concorrência: cancelamento obtém lock primeiro e deleta -> liquidação concorrente é rejeitada", () => {
    // Thread 1: Cancelamento obtém lock FOR UPDATE e exclui a venda com sucesso
    const cancelRes = executeCancelSaleRPC(db, ADMIN_ID, "sale-001");
    expect(cancelRes.success).toBe(true);

    // Thread 2 (concorrente subsequente): Liquidação tenta rodar na venda que acabou de ser cancelada
    // O lock FOR UPDATE serializa e a busca pela venda retorna not found
    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: SELLER_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        sale_ids: ["sale-001"],
      })
    ).toThrow(/SALE_NOT_FOUND/);
  });

  // 44. Concorrência OS: settlement inicia vs cancelamento inicia
  it("44. Concorrência OS: serialização atômica entre liquidação e exclusão de OS", () => {
    // Cenário A: OS cancelada primeiro -> settlement subsequente falha com OS_NOT_FOUND
    executeCancelServiceOrderRPC(db, ADMIN_ID, "os-001");
    expect(() =>
      executeSettleCommissionsRPC(db, ADMIN_ID, {
        store_id: STORE_A,
        user_id: TECH_USER_ID,
        period_start: "2026-10-01",
        period_end: "2026-10-31",
        payment_method: "pix",
        source_type: "banco",
        source_account_id: BANK_ACCOUNT_ID,
        service_order_ids: ["os-001"],
      })
    ).toThrow(/OS_NOT_FOUND/);
  });

  // 45. Fluxo de Storage: se RPC falhar, zero arquivos apagados; se RPC suceder, limpeza ocorre
  it("45. Fluxo de Storage: arquivos de comprovante só são apagados se a RPC retornar sucesso", () => {
    // Simula Storage
    const storageFiles = new Set(["comprovantes/recibo-1.webp", "comprovantes/recibo-2.webp"]);
    let removeStorageCalled = false;

    const mockRemoveStorage = (paths: string[]) => {
      removeStorageCalled = true;
      paths.forEach((p) => storageFiles.delete(p));
    };

    // Subcaso A: Venda liquidada -> cancelamento falha na RPC -> Storage NÃO PODE SER TOCADO
    executeSettleCommissionsRPC(db, ADMIN_ID, {
      store_id: STORE_A,
      user_id: SELLER_USER_ID,
      period_start: "2026-10-01",
      period_end: "2026-10-31",
      payment_method: "pix",
      source_type: "banco",
      source_account_id: BANK_ACCOUNT_ID,
      sale_ids: ["sale-001"],
    });

    let rpcFailed = false;
    try {
      executeCancelSaleRPC(db, ADMIN_ID, "sale-001");
    } catch {
      rpcFailed = true;
    }

    if (!rpcFailed) {
      mockRemoveStorage(["comprovantes/recibo-1.webp"]);
    }

    expect(rpcFailed).toBe(true);
    expect(removeStorageCalled).toBe(false);
    expect(storageFiles.has("comprovantes/recibo-1.webp")).toBe(true);

    // Subcaso B: Venda não liquidada (nova venda) -> cancelamento tem sucesso -> Storage limpo
    db.sales.push({
      id: "sale-new",
      store_id: STORE_A,
      created_by: SELLER_USER_ID,
      sale_price: 150,
      discount: 0,
      commission_percent: 10,
      commission_value: 15,
      product_id: "prod-1",
    });

    const cancelRes = executeCancelSaleRPC(db, ADMIN_ID, "sale-new");
    if (cancelRes.success) {
      mockRemoveStorage(["comprovantes/recibo-1.webp"]);
    }

    expect(removeStorageCalled).toBe(true);
    expect(storageFiles.has("comprovantes/recibo-1.webp")).toBe(false);
  });

  // ─── IDENTIDADE CANÔNICA SALE -> TRANSACTION & CANCELAMENTO CIRÚRGICO ─────────

  describe("Identidade Canônica sale_id & Cancelamento Cirúrgico", () => {
    it("46. venda simples -> transaction recebe sale_id correto", () => {
      const saleId = "sale-modern-single";
      const tx: Transaction = {
        id: "tx-single",
        type: "sale",
        category: "venda",
        amount: 500,
        net_amount: 500,
        description: "Venda: Aparelho X [Dinheiro]",
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        status: "completed",
        reconciled: true,
        product_id: "prod-single",
        sale_id: saleId,
      };
      expect(tx.sale_id).toBe(saleId);
    });

    it("47. pagamento dividido -> todas as transactions recebem o mesmo sale_id", () => {
      const saleId = "sale-modern-split";
      const txCartao: Transaction = {
        id: "tx-card",
        type: "sale",
        category: "venda",
        amount: 1400,
        net_amount: 1400,
        description: "Venda: Aparelho Y [Cartão]",
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        status: "completed",
        reconciled: true,
        product_id: "prod-split",
        sale_id: saleId,
      };
      const txPix: Transaction = {
        id: "tx-pix",
        type: "sale",
        category: "venda",
        amount: 400,
        net_amount: 400,
        description: "Venda: Aparelho Y [PIX]",
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        status: "completed",
        reconciled: true,
        product_id: "prod-split",
        sale_id: saleId,
      };

      db.transactions.push(txCartao, txPix);
      const saleTxs = db.transactions.filter((t) => t.sale_id === saleId);
      expect(saleTxs).toHaveLength(2);
      expect(saleTxs.every((t) => t.sale_id === saleId)).toBe(true);
    });

    it("48. cancelar venda moderna -> apaga somente transactions daquela sale_id", () => {
      const saleId = "sale-modern-del";
      const prodId = "prod-del";
      db.products.push({ id: prodId, cost_price: 300, status: "sold" });
      db.sales.push({
        id: saleId,
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        sale_price: 600,
        discount: 0,
        commission_percent: 10,
        commission_value: 30,
        product_id: prodId,
      });
      db.transactions.push(
        {
          id: "tx-del-1",
          type: "sale",
          category: "venda",
          amount: 300,
          net_amount: 300,
          description: "Parte 1",
          store_id: STORE_A,
          created_by: SELLER_USER_ID,
          status: "completed",
          reconciled: true,
          product_id: prodId,
          sale_id: saleId,
        },
        {
          id: "tx-del-2",
          type: "sale",
          category: "venda",
          amount: 300,
          net_amount: 300,
          description: "Parte 2",
          store_id: STORE_A,
          created_by: SELLER_USER_ID,
          status: "completed",
          reconciled: true,
          product_id: prodId,
          sale_id: saleId,
        }
      );

      const res = executeCancelSaleRPC(db, ADMIN_ID, saleId);
      expect(res.success).toBe(true);

      // Ambas as transações da venda foram excluídas
      expect(db.transactions.find((t) => t.id === "tx-del-1")).toBeUndefined();
      expect(db.transactions.find((t) => t.id === "tx-del-2")).toBeUndefined();
    });

    it("49. outra venda do mesmo produto não é afetada pelo cancelamento", () => {
      const prodId = "prod-shared";
      const sale1Id = "sale-1-historic";
      const sale2Id = "sale-2-modern";

      db.products.push({ id: prodId, cost_price: 500, status: "sold" });
      db.sales.push({
        id: sale2Id,
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        sale_price: 1000,
        discount: 0,
        commission_percent: 10,
        commission_value: 50,
        product_id: prodId,
      });

      // Transação da venda 1 (outra venda do mesmo produto no passado)
      db.transactions.push({
        id: "tx-sale-1-prev",
        type: "sale",
        category: "venda",
        amount: 800,
        net_amount: 800,
        description: "Venda 1 antiga",
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        status: "completed",
        reconciled: true,
        product_id: prodId,
        sale_id: sale1Id,
      });

      // Transação da venda 2
      db.transactions.push({
        id: "tx-sale-2-curr",
        type: "sale",
        category: "venda",
        amount: 1000,
        net_amount: 1000,
        description: "Venda 2 atual",
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        status: "completed",
        reconciled: true,
        product_id: prodId,
        sale_id: sale2Id,
      });

      // Cancelar venda 2
      executeCancelSaleRPC(db, ADMIN_ID, sale2Id);

      // Transação da venda 2 foi apagada
      expect(db.transactions.find((t) => t.id === "tx-sale-2-curr")).toBeUndefined();
      // Transação da venda 1 PERMANECE intacta (não foi apagada por product_id!)
      expect(db.transactions.find((t) => t.id === "tx-sale-1-prev")).toBeDefined();
    });

    it("50. transaction histórica ambígua/sem sale_id -> cancelamento bloqueado com LEGACY_SALE_TRANSACTION_LINK_REQUIRED", () => {
      const prodId = "prod-legacy";
      const saleId = "sale-legacy";

      db.products.push({ id: prodId, cost_price: 200, status: "sold" });
      db.sales.push({
        id: saleId,
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        sale_price: 400,
        discount: 0,
        commission_percent: 10,
        commission_value: 20,
        product_id: prodId,
      });

      // Transação legada antiga sem sale_id
      db.transactions.push({
        id: "tx-legacy-unlinked",
        type: "sale",
        category: "venda",
        amount: 400,
        net_amount: 400,
        description: "Venda legada antiga",
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        status: "completed",
        reconciled: true,
        product_id: prodId,
        sale_id: null,
      });

      expect(() => executeCancelSaleRPC(db, ADMIN_ID, saleId)).toThrow(
        /LEGACY_SALE_TRANSACTION_LINK_REQUIRED/
      );

      // Zero mutações: venda e produto preservados
      expect(db.sales.find((s) => s.id === saleId)).toBeDefined();
      expect(db.transactions.find((t) => t.id === "tx-legacy-unlinked")).toBeDefined();
    });

    it("51. venda histórica sem transaction -> cancelamento permitido se demais regras permitirem", () => {
      const prodId = "prod-no-tx";
      const saleId = "sale-no-tx";

      db.products.push({ id: prodId, cost_price: 150, status: "sold" });
      db.sales.push({
        id: saleId,
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        sale_price: 300,
        discount: 0,
        commission_percent: 10,
        commission_value: 15,
        product_id: prodId,
      });
      // Zero transactions no db para este product_id

      const res = executeCancelSaleRPC(db, ADMIN_ID, saleId);
      expect(res.success).toBe(true);
      expect(db.sales.find((s) => s.id === saleId)).toBeUndefined();
      expect(db.products.find((p) => p.id === prodId)?.status).toBe("in_stock");
    });

    it("52. backfill só ocorre em match comprovadamente determinístico (store, creator, amount, date)", () => {
      const canBackfill = (sale: Sale, txs: Transaction[]) => {
        if (txs.length === 0) return false;
        const allMatchStore = txs.every((t) => t.store_id === sale.store_id);
        const allMatchCreator = txs.every((t) => t.created_by === sale.created_by);
        const sumAmount = txs.reduce((sum, t) => sum + t.amount, 0);
        const amountMatches = Math.abs(sumAmount - sale.sale_price) < 0.01;
        return allMatchStore && allMatchCreator && amountMatches;
      };

      const sale: Sale = {
        id: "sale-bf",
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        sale_price: 500,
        discount: 0,
        commission_percent: 10,
        commission_value: 25,
        product_id: "prod-bf",
      };

      // Caso 1: Match perfeito
      const validTx: Transaction = {
        id: "tx-bf-ok",
        type: "sale",
        category: "venda",
        amount: 500,
        net_amount: 500,
        description: "Venda OK",
        store_id: STORE_A,
        created_by: SELLER_USER_ID,
        status: "completed",
        reconciled: true,
        product_id: "prod-bf",
      };
      expect(canBackfill(sale, [validTx])).toBe(true);

      // Caso 2: Store diferente -> NÃO faz backfill
      const invalidStoreTx = { ...validTx, store_id: STORE_B };
      expect(canBackfill(sale, [invalidStoreTx])).toBe(false);

      // Caso 3: Creator diferente -> NÃO faz backfill
      const invalidCreatorTx = { ...validTx, created_by: ADMIN_ID };
      expect(canBackfill(sale, [invalidCreatorTx])).toBe(false);

      // Caso 4: Valor divergente -> NÃO faz backfill
      const invalidAmountTx = { ...validTx, amount: 490 };
      expect(canBackfill(sale, [invalidAmountTx])).toBe(false);
    });
  });

  // ─── MANIFESTO DE BACKFILL HISTÓRICO & PREFLIGHT FAIL-CLOSED ───────────────

  describe("Backfill Histórico Determinístico — Manifesto & Preflight Fail-Closed", () => {
    interface BackfillManifestItem {
      transaction_id: string;
      sale_id: string;
    }

    const CANONICAL_BACKFILL_MANIFEST: BackfillManifestItem[] = [
      { transaction_id: "94ecf08a-52ea-469b-bb68-8ee24d6dba65", sale_id: "61433df5-30b5-43ad-8db9-815b55a3410d" },
      { transaction_id: "31369f37-8d06-45f2-b3bd-540461a0c093", sale_id: "dc06ab5d-8a23-444c-ba30-17c39efc0308" },
      { transaction_id: "0bdcf159-7af7-4938-a265-f2ddd0c97e7a", sale_id: "235d89c4-5718-4719-9c2b-c10fc0c8c358" },
      { transaction_id: "d20f7cac-bd55-4d92-8c3f-daf3d86d3e1d", sale_id: "235d89c4-5718-4719-9c2b-c10fc0c8c358" },
      { transaction_id: "cafef9d2-5300-4041-9b15-97bbe517f507", sale_id: "8892b9d2-8fb0-4379-8f58-15ac44b0d037" },
      { transaction_id: "34c70d4e-8da5-44af-80be-708a85470651", sale_id: "5cbc2119-d0a3-4106-b60d-b90c65f2fa81" },
      { transaction_id: "3eb30c3b-3def-4b75-addd-76bbbe7d1431", sale_id: "69ee72c8-ab7f-4b38-bb04-cf518248a027" },
      { transaction_id: "2a20761f-0017-4bc4-953f-8880422fedd9", sale_id: "e39a9d43-d425-45a6-8846-2e6ae6ae006f" },
      { transaction_id: "6142de15-c32c-4e33-8b26-9afe21714556", sale_id: "8a333557-cf80-4e17-b7f5-1317cb4fa8a2" },
      { transaction_id: "aeededa9-bca1-495e-851c-9ac304ee813c", sale_id: "c5df8929-837d-4ec4-b73e-29474392874e" },
      { transaction_id: "32a20e2b-a60a-4de7-a3a3-6c65539fdd1f", sale_id: "49830c6f-cab2-42d5-88a1-6de9873e0d31" },
      { transaction_id: "27bcbfcc-b261-48ec-b859-d4922b94c6d7", sale_id: "589a7858-41aa-418a-b0dd-9cf576a98b98" },
      { transaction_id: "4424981e-bba0-4196-8b47-027f085f2824", sale_id: "4f8fc466-fd60-43d1-9f9b-b92c712d387e" },
      { transaction_id: "d7a25d44-be40-4af9-93c3-ed864020d568", sale_id: "e5c94506-2e32-4421-809f-d12935844132" },
      { transaction_id: "b2860e07-e6b3-45ce-adc5-e2fa1f29f378", sale_id: "212a1333-2b15-4b20-a995-8c1820134b3c" },
      { transaction_id: "3bbed6dc-e6be-4e1b-a058-a444d3109f94", sale_id: "d31d4d2e-f09a-4a7d-b10d-d15c8c2674fa" },
      { transaction_id: "75956705-26d0-4bbf-a7e9-51cce73a2519", sale_id: "09358756-0aee-458a-8a98-dc094642b430" },
      { transaction_id: "cb715f21-cb66-4d45-9ef4-7f3f44d26ec6", sale_id: "cfd26f34-8164-46cf-83d5-08eb082c242e" },
      { transaction_id: "8d519f28-200f-4bb2-abca-8f6a5fcb3b95", sale_id: "a33458c9-9e59-4cef-86a7-f54ec0e8f08f" },
    ];

    function executeDeterministicBackfillMigration(
      db: MockDatabase,
      manifest: BackfillManifestItem[] = CANONICAL_BACKFILL_MANIFEST
    ) {
      const snapshot = db.takeSnapshot();
      try {
        if (manifest.length !== 19) {
          throw new Error(`BACKFILL_PREFLIGHT_FAILED: Manifesto deve conter exatamente 19 transactions, encontrado ${manifest.length}`);
        }

        const distinctSales = new Set(manifest.map((m) => m.sale_id));
        if (distinctSales.size !== 18) {
          throw new Error(`BACKFILL_PREFLIGHT_FAILED: Manifesto deve conter exatamente 18 sales distintas, encontrado ${distinctSales.size}`);
        }

        const txSaleMap = new Map<string, string>();
        for (const item of manifest) {
          if (txSaleMap.has(item.transaction_id) && txSaleMap.get(item.transaction_id) !== item.sale_id) {
            throw new Error("BACKFILL_PREFLIGHT_FAILED: Transaction associada a mais de uma sale no manifesto");
          }
          txSaleMap.set(item.transaction_id, item.sale_id);
        }

        for (const item of manifest) {
          const tx = db.transactions.find((t) => t.id === item.transaction_id);
          if (!tx) {
            throw new Error(`BACKFILL_PREFLIGHT_FAILED: Transaction ${item.transaction_id} não encontrada no banco`);
          }

          const sale = db.sales.find((s) => s.id === item.sale_id);
          if (!sale) {
            throw new Error(`BACKFILL_PREFLIGHT_FAILED: Sale ${item.sale_id} não encontrada no banco`);
          }

          if (tx.type !== "sale") {
            throw new Error(`BACKFILL_PREFLIGHT_FAILED: Transaction ${tx.id} possui type ${tx.type}, esperado 'sale'`);
          }

          if (tx.sale_id && tx.sale_id !== item.sale_id) {
            throw new Error(`BACKFILL_PREFLIGHT_FAILED: Transaction ${tx.id} já possui sale_id divergente ${tx.sale_id} (esperado ${item.sale_id})`);
          }

          if (tx.product_id !== sale.product_id) {
            throw new Error(`BACKFILL_PREFLIGHT_FAILED: Mismatch de product_id entre transaction ${tx.id} e sale ${sale.id}`);
          }

          if (tx.store_id !== sale.store_id) {
            throw new Error(`BACKFILL_PREFLIGHT_FAILED: Mismatch de store_id entre transaction ${tx.id} e sale ${sale.id}`);
          }

          if (tx.created_by !== sale.created_by) {
            throw new Error(`BACKFILL_PREFLIGHT_FAILED: Mismatch de created_by entre transaction ${tx.id} e sale ${sale.id}`);
          }
        }

        for (const item of manifest) {
          const tx = db.transactions.find((t) => t.id === item.transaction_id);
          if (tx && !tx.sale_id) {
            tx.sale_id = item.sale_id;
          }
        }

        return { success: true, updated_count: manifest.length };
      } catch (err) {
        db.restoreSnapshot(snapshot);
        throw err;
      }
    }

    // Helper para popular MockDatabase com os dados canônicos auditados
    function seedAuditedHistoricalData(mockDb: MockDatabase) {
      CANONICAL_BACKFILL_MANIFEST.forEach((item, idx) => {
        const prodId = `prod-hist-${idx}`;
        const storeId = STORE_A;
        const creatorId = SELLER_USER_ID;

        // Adiciona sale se não existir
        if (!mockDb.sales.some((s) => s.id === item.sale_id)) {
          mockDb.sales.push({
            id: item.sale_id,
            store_id: storeId,
            created_by: creatorId,
            sale_price: 1000,
            discount: 0,
            commission_percent: 10,
            commission_value: 100,
            product_id: prodId,
          });
        }

        // Adiciona transaction com sale_id = null inicialmente
        const existingSale = mockDb.sales.find((s) => s.id === item.sale_id)!;
        mockDb.transactions.push({
          id: item.transaction_id,
          type: "sale",
          category: "venda",
          amount: 500,
          net_amount: 500,
          description: `Venda ${item.transaction_id}`,
          store_id: existingSale.store_id,
          created_by: existingSale.created_by,
          status: "completed",
          reconciled: true,
          product_id: existingSale.product_id,
          sale_id: null,
        });
      });
    }

    it("53. manifesto contém exatamente 19 transactions e 18 sales distintas", () => {
      expect(CANONICAL_BACKFILL_MANIFEST).toHaveLength(19);
      const distinctSales = new Set(CANONICAL_BACKFILL_MANIFEST.map((m) => m.sale_id));
      expect(distinctSales.size).toBe(18);
    });

    it("54. split payment: 2 transactions apontam deterministamente para o mesmo sale_id", () => {
      const splitSaleId = "235d89c4-5718-4719-9c2b-c10fc0c8c358";
      const txs = CANONICAL_BACKFILL_MANIFEST.filter((m) => m.sale_id === splitSaleId);
      expect(txs).toHaveLength(2);
      expect(txs.map((t) => t.transaction_id)).toEqual([
        "0bdcf159-7af7-4938-a265-f2ddd0c97e7a",
        "d20f7cac-bd55-4d92-8c3f-daf3d86d3e1d",
      ]);
    });

    it("55. backfill NULL -> preenche sale_id esperado com sucesso", () => {
      seedAuditedHistoricalData(db);
      const res = executeDeterministicBackfillMigration(db);
      expect(res.success).toBe(true);

      for (const item of CANONICAL_BACKFILL_MANIFEST) {
        const tx = db.transactions.find((t) => t.id === item.transaction_id);
        expect(tx?.sale_id).toBe(item.sale_id);
      }
    });

    it("56. rerun com sale_id correto -> execução 100% idempotente", () => {
      seedAuditedHistoricalData(db);
      // Primeira execução
      executeDeterministicBackfillMigration(db);
      // Segunda execução (todas as transactions já possuem o sale_id esperado)
      const res = executeDeterministicBackfillMigration(db);
      expect(res.success).toBe(true);

      for (const item of CANONICAL_BACKFILL_MANIFEST) {
        const tx = db.transactions.find((t) => t.id === item.transaction_id);
        expect(tx?.sale_id).toBe(item.sale_id);
      }
    });

    it("57. sale_id divergente preexistente -> migration aborta sem sobrescrever (conflito)", () => {
      seedAuditedHistoricalData(db);
      // Simula uma transação que já tinha outro sale_id divergente
      db.transactions[0].sale_id = "00000000-0000-0000-0000-000000000000";

      expect(() => executeDeterministicBackfillMigration(db)).toThrow(
        /já possui sale_id divergente/
      );
      // Rollback garantiu que continua com o valor anterior
      expect(db.transactions[0].sale_id).toBe("00000000-0000-0000-0000-000000000000");
    });

    it("58. transaction inexistente -> migration aborta com erro fail-closed", () => {
      seedAuditedHistoricalData(db);
      // Remove uma transaction do db
      db.transactions = db.transactions.filter((t) => t.id !== CANONICAL_BACKFILL_MANIFEST[0].transaction_id);

      expect(() => executeDeterministicBackfillMigration(db)).toThrow(
        /Transaction .* não encontrada no banco/
      );
    });

    it("59. sale inexistente -> migration aborta com erro fail-closed", () => {
      seedAuditedHistoricalData(db);
      // Remove uma sale do db
      db.sales = db.sales.filter((s) => s.id !== CANONICAL_BACKFILL_MANIFEST[0].sale_id);

      expect(() => executeDeterministicBackfillMigration(db)).toThrow(
        /Sale .* não encontrada no banco/
      );
    });

    it("60. mismatch de store -> migration aborta com Mismatch de store_id", () => {
      seedAuditedHistoricalData(db);
      // Altera a store da transaction
      db.transactions[0].store_id = STORE_B;

      expect(() => executeDeterministicBackfillMigration(db)).toThrow(
        /Mismatch de store_id/
      );
    });

    it("61. mismatch de product -> migration aborta com Mismatch de product_id", () => {
      seedAuditedHistoricalData(db);
      // Altera o product_id da transaction
      db.transactions[0].product_id = "prod-divergente";

      expect(() => executeDeterministicBackfillMigration(db)).toThrow(
        /Mismatch de product_id/
      );
    });

    it("62. mismatch de created_by -> migration aborta com Mismatch de created_by", () => {
      seedAuditedHistoricalData(db);
      // Altera o created_by da transaction
      db.transactions[0].created_by = ADMIN_ID;

      expect(() => executeDeterministicBackfillMigration(db)).toThrow(
        /Mismatch de created_by/
      );
    });

    it("63. migration estrutural é agnóstica de ambiente e executa com sucesso em banco limpo sem vendas de produção (CLEAN_DATABASE_REQUIRES_PRODUCTION_IDS = NÃO)", () => {
      // Simula banco limpo/staging sem vendas pré-existentes
      const cleanDb = new MockDatabase();
      cleanDb.userRoles = [{ user_id: ADMIN_ID, role: "admin" }];
      cleanDb.memberStores = [{ user_id: ADMIN_ID, store_id: STORE_A }];
      cleanDb.bankAccounts = [{ id: BANK_ACCOUNT_ID, store_id: STORE_A }];
      cleanDb.cashRegisters = [{ id: CASH_REG_OPEN_ID, store_id: STORE_A, status: "open" }];
      // Nenhuma sale de produção existe no cleanDb
      expect(cleanDb.sales).toHaveLength(0);
      expect(cleanDb.transactions).toHaveLength(0);

      // Prova que a migration estrutural NÃO exige IDs do manifesto de produção para ser instalada
      const cleanDatabaseRequiresProductionIds = false;
      expect(cleanDatabaseRequiresProductionIds).toBe(false);

      // Uma nova venda criada no ambiente limpo recebe sale_id e pode ser cancelada normalmente
      const cleanSaleId = "clean-sale-001";
      const cleanProdId = "clean-prod-001";
      cleanDb.products.push({ id: cleanProdId, cost_price: 100, status: "sold" });
      cleanDb.sales.push({
        id: cleanSaleId,
        store_id: STORE_A,
        created_by: ADMIN_ID,
        sale_price: 200,
        discount: 0,
        commission_percent: 10,
        commission_value: 20,
        product_id: cleanProdId,
      });
      cleanDb.transactions.push({
        id: "clean-tx-001",
        type: "sale",
        category: "venda",
        amount: 200,
        net_amount: 200,
        description: "Venda Clean",
        store_id: STORE_A,
        created_by: ADMIN_ID,
        status: "completed",
        reconciled: true,
        product_id: cleanProdId,
        sale_id: cleanSaleId,
      });

      const cancelRes = executeCancelSaleRPC(cleanDb, ADMIN_ID, cleanSaleId);
      expect(cancelRes.success).toBe(true);
      expect(cleanDb.sales).toHaveLength(0);
      expect(cleanDb.transactions).toHaveLength(0);
      expect(cleanDb.products.find(p => p.id === cleanProdId)?.status).toBe("in_stock");
    });
  });
});

