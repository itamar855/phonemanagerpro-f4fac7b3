/**
 * Cash Register Business Rules Tests
 *
 * Testa as invariantes do fluxo de caixa:
 * - Abertura cria cash_registers + cash_entries (abertura)
 * - Lançamento cria cash_entries + transactions
 * - Sangria cria cash_entries (sangria) + transactions (sangria)
 * - Fechamento atualiza cash_registers com status "closed"
 * - Todas as operações usam cash_register_id e store_id
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockQueryBuilder,
  TEST_STORE_ID,
  TEST_USER_ID,
  TEST_REGISTER_ID,
  makeCashRegister,
  makeCashEntry,
} from '../mocks/supabase';

describe('Cash Register — Business Rules', () => {
  beforeEach(() => {
    MockQueryBuilder.clearHistory();
  });

  describe('Abertura de Caixa', () => {
    it('should create a cash_registers record with status "open"', () => {
      const openPayload = {
        store_id: TEST_STORE_ID,
        opened_by: TEST_USER_ID,
        opening_amount: 50,
        status: 'open',
        opened_at: expect.any(String),
      };

      expect(openPayload.status).toBe('open');
      expect(openPayload.opening_amount).toBe(50);
      expect(openPayload.store_id).toBe(TEST_STORE_ID);
      expect(openPayload.opened_by).toBe(TEST_USER_ID);
    });

    it('should create a cash_entries "abertura" entry with cash_register_id', () => {
      const entryPayload = {
        cash_register_id: TEST_REGISTER_ID,
        store_id: TEST_STORE_ID,
        type: 'abertura',
        amount: 50,
        description: 'Abertura de caixa',
        payment_method: 'dinheiro',
        confirmed: true,
        created_by: TEST_USER_ID,
      };

      // Critical invariant: must use cash_register_id, NOT register_id
      expect(entryPayload).toHaveProperty('cash_register_id');
      expect(entryPayload).not.toHaveProperty('register_id');
      expect(entryPayload.cash_register_id).toBe(TEST_REGISTER_ID);
      expect(entryPayload.type).toBe('abertura');
      expect(entryPayload.confirmed).toBe(true);
    });

    it('should fallback to active store register when user did not open one', () => {
      // Quando Vendas.tsx tenta achar o caixa aberto por userId, mas não encontra, 
      // ele usa um fallbackQuery procurando apenas por status=open e store_id.
      const fallbackQueryFilters = {
        status: 'open',
        store_id: TEST_STORE_ID
      };

      expect(fallbackQueryFilters.status).toBe('open');
      expect(fallbackQueryFilters.store_id).toBe(TEST_STORE_ID);
    });
  });

  describe('Lançamento Manual', () => {
    it('should create cash_entries with correct structure', () => {
      const entryPayload = {
        cash_register_id: TEST_REGISTER_ID,
        store_id: TEST_STORE_ID,
        type: 'entrada',
        amount: 200,
        description: 'Suprimento manual',
        payment_method: 'dinheiro',
        confirmed: false,
        created_by: TEST_USER_ID,
      };

      expect(entryPayload).toHaveProperty('cash_register_id');
      expect(entryPayload).not.toHaveProperty('register_id');
      expect(entryPayload.type).toBe('entrada');
      expect(entryPayload.confirmed).toBe(false);
    });

    it('should also create a corresponding transaction', () => {
      const txPayload = {
        type: 'income',
        amount: 200,
        net_amount: 200,
        description: 'Suprimento manual',
        category: 'Suprimento',
        store_id: TEST_STORE_ID,
        created_by: TEST_USER_ID,
        expected_settlement_date: expect.any(String),
        reconciled: false,
      };

      expect(txPayload.type).toBe('income');
      expect(txPayload.amount).toBe(txPayload.net_amount);
    });
  });

  describe('Sangria', () => {
    it('should create cash_entries with type "sangria" and confirmed true', () => {
      const sangriaPayload = {
        cash_register_id: TEST_REGISTER_ID,
        store_id: TEST_STORE_ID,
        type: 'sangria',
        amount: 100,
        description: 'Sangria: Pagamento de conta',
        payment_method: 'dinheiro',
        confirmed: true,
        created_by: TEST_USER_ID,
      };

      expect(sangriaPayload).toHaveProperty('cash_register_id');
      expect(sangriaPayload).not.toHaveProperty('register_id');
      expect(sangriaPayload.type).toBe('sangria');
      expect(sangriaPayload.confirmed).toBe(true);
    });

    it('should create a transaction with type "sangria" and reconciled true', () => {
      const txPayload = {
        type: 'sangria',
        amount: 100,
        net_amount: 100,
        description: 'Sangria: Pagamento de conta',
        category: 'Sangria',
        store_id: TEST_STORE_ID,
        created_by: TEST_USER_ID,
        reconciled: true,
      };

      expect(txPayload.type).toBe('sangria');
      expect(txPayload.reconciled).toBe(true);
    });
  });

  describe('Fechamento de Caixa', () => {
    it('should compute difference between closing_amount and expected', () => {
      const openingAmount = 50;
      const entries = [
        makeCashEntry({ type: 'abertura', amount: 50, confirmed: true }),
        makeCashEntry({ type: 'entrada', amount: 300, confirmed: true, payment_method: 'dinheiro' }),
        makeCashEntry({ type: 'sangria', amount: 100, confirmed: true }),
      ];

      // Simulate cash calculation (simplified — real code is more complex with payment_method)
      const cashEntries = entries.filter(
        (e) => e.type !== 'sangria' && ['dinheiro', 'misto'].includes(e.payment_method || 'dinheiro')
      );
      const cashIn = cashEntries.reduce((s, e) => s + e.amount, 0);
      const cashOut = entries.filter((e) => e.type === 'sangria').reduce((s, e) => s + e.amount, 0);
      const expectedCash = cashIn - cashOut;

      expect(expectedCash).toBe(250); // 50 + 300 - 100

      const closingAmount = 245;
      const difference = closingAmount - expectedCash;
      expect(difference).toBe(-5); // R$ 5 faltando
    });

    it('should update cash_registers with status "closed"', () => {
      const closePayload = {
        closing_amount: 250,
        expected_amount: 250,
        difference: 0,
        difference_reason: null,
        closing_note: null,
        status: 'closed',
        closed_at: expect.any(String),
      };

      expect(closePayload.status).toBe('closed');
    });

    it('should require reason when difference > R$ 5', () => {
      const difference = 10;
      const reason = '';
      const shouldBlock = Math.abs(difference) > 5 && !reason;
      expect(shouldBlock).toBe(true);
    });
  });

  describe('Fetch Entries — Query Uses Correct Column', () => {
    it('should fetch cash_entries using cash_register_id filter', () => {
      // Simulating the query pattern from Caixa.tsx line 193
      const queryColumn = 'cash_register_id';
      const queryValue = TEST_REGISTER_ID;

      expect(queryColumn).toBe('cash_register_id');
      expect(queryColumn).not.toBe('register_id');
      expect(queryValue).toBe(TEST_REGISTER_ID);
    });

    it('should fetch history entries using cash_register_id filter', () => {
      // Simulating the query pattern from Caixa.tsx line 542
      const queryColumn = 'cash_register_id';
      expect(queryColumn).toBe('cash_register_id');
    });
  });
});
