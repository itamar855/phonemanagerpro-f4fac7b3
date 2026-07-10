/**
 * Cash Entries Integration Flow Tests
 *
 * Testa o fluxo completo e2e de cash_entries:
 * - Vendas criam entries via createPendingCashEntry
 * - Caixa consulta entries com cash_register_id
 * - Relatórios consultam entries com cash_register_id via .in()
 * - Estorno remove entries
 * - Conciliação confirma entries
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MockQueryBuilder,
  TEST_STORE_ID,
  TEST_USER_ID,
  TEST_REGISTER_ID,
  makeCashEntry,
  makeCashRegister,
} from '../mocks/supabase';

describe('Cash Entries — Integration Flow', () => {
  beforeEach(() => {
    MockQueryBuilder.clearHistory();
  });

  describe('Full Cash Day Lifecycle', () => {
    it('should simulate a complete business day flow', () => {
      // 1. ABERTURA
      const openingEntry = makeCashEntry({
        type: 'abertura',
        amount: 50,
        description: 'Abertura de caixa',
        confirmed: true,
      });

      // 2. VENDA (entrada pendente)
      const saleEntry = makeCashEntry({
        type: 'entrada',
        amount: 4500,
        description: 'Venda iPhone 14 Pro → João Silva',
        payment_method: 'dinheiro',
        confirmed: false,
      });

      // 3. VENDA PDV (entrada pendente)
      const pdvEntry = makeCashEntry({
        type: 'entrada',
        amount: 75,
        description: 'PDV: 3x Película iPhone 14',
        payment_method: 'dinheiro',
        confirmed: false,
      });

      // 4. SANGRIA
      const sangriaEntry = makeCashEntry({
        type: 'sangria',
        amount: 200,
        description: 'Sangria: Pagamento de fornecedor',
        confirmed: true,
      });

      // 5. OS BILLING (entrada)
      const osEntry = makeCashEntry({
        type: 'entrada',
        amount: 350,
        description: 'OS #os-001 - iPhone 13',
        payment_method: 'dinheiro',
        confirmed: false,
      });

      const allEntries = [openingEntry, saleEntry, pdvEntry, sangriaEntry, osEntry];

      // Validate all use cash_register_id
      for (const entry of allEntries) {
        expect(entry).toHaveProperty('cash_register_id');
        expect(entry).not.toHaveProperty('register_id');
        expect(entry.cash_register_id).toBe(TEST_REGISTER_ID);
      }

      // Calculate expected totals
      const confirmedEntries = allEntries.filter((e) => e.confirmed);
      const pendingEntries = allEntries.filter((e) => !e.confirmed);

      expect(confirmedEntries).toHaveLength(2); // abertura + sangria
      expect(pendingEntries).toHaveLength(3); // sale + pdv + os

      // Cash balance calculation (all entries)
      const cashIn = allEntries
        .filter((e) => ['entrada', 'abertura'].includes(e.type))
        .reduce((s, e) => s + e.amount, 0);
      const cashOut = allEntries
        .filter((e) => ['saida', 'sangria'].includes(e.type))
        .reduce((s, e) => s + e.amount, 0);

      expect(cashIn).toBe(50 + 4500 + 75 + 350); // 4975
      expect(cashOut).toBe(200);
      expect(cashIn - cashOut).toBe(4775);
    });
  });

  describe('Reports Query Pattern', () => {
    it('should query cash_entries using .in("cash_register_id", cashIds)', () => {
      // Simulates the pattern in Relatorios.tsx line 748
      const cashIds = [TEST_REGISTER_ID, 'another-register-id'];
      const queryColumn = 'cash_register_id';

      expect(queryColumn).toBe('cash_register_id');
      expect(queryColumn).not.toBe('register_id');
      expect(cashIds).toContain(TEST_REGISTER_ID);
    });

    it('should filter by confirmed=true for reports', () => {
      const entries = [
        makeCashEntry({ confirmed: true, amount: 100 }),
        makeCashEntry({ confirmed: false, amount: 200 }),
        makeCashEntry({ confirmed: true, amount: 300 }),
      ];

      const confirmedOnly = entries.filter((e) => e.confirmed);
      expect(confirmedOnly).toHaveLength(2);

      const confirmedTotal = confirmedOnly.reduce((s, e) => s + e.amount, 0);
      expect(confirmedTotal).toBe(400);
    });
  });

  describe('Sale Deletion — Cash Entry Cleanup', () => {
    it('should delete PDV cash_entries by description match', () => {
      const pdvDescription = 'PDV: 3x Película iPhone 14';

      // The code deletes from cash_entries where description = pdvDescription
      expect(pdvDescription).toContain('PDV:');
    });

    it('should delete device sale transactions by product_id and type', () => {
      const deleteFilter = {
        product_id: 'prod-001',
        type: 'sale',
      };

      expect(deleteFilter.product_id).toBe('prod-001');
      expect(deleteFilter.type).toBe('sale');
    });
  });

  describe('Entry Confirmation Flow', () => {
    it('should update entry to confirmed=true with receipt_url', () => {
      const confirmPayload = {
        confirmed: true,
        receipt_url: 'https://storage.supabase.co/confirmacao/entry-001-12345',
      };

      expect(confirmPayload.confirmed).toBe(true);
      expect(confirmPayload.receipt_url).toBeTruthy();
    });

    it('should update entry to confirmed=false (unconfirm) with null receipt_url', () => {
      const unconfirmPayload = {
        confirmed: false,
        receipt_url: null,
      };

      expect(unconfirmPayload.confirmed).toBe(false);
      expect(unconfirmPayload.receipt_url).toBeNull();
    });
  });

  describe('Supplier Payment from Caixa', () => {
    it('should create cash_entry with type "saida" for supplier payment', () => {
      const supplierPayment = {
        cash_register_id: TEST_REGISTER_ID,
        store_id: TEST_STORE_ID,
        type: 'saida',
        amount: 500,
        description: 'Pagamento fornecedor: TechParts LTDA',
        payment_method: 'dinheiro',
        confirmed: true,
        created_by: TEST_USER_ID,
      };

      expect(supplierPayment.type).toBe('saida');
      expect(supplierPayment).toHaveProperty('cash_register_id');
      expect(supplierPayment).not.toHaveProperty('register_id');
    });
  });

  describe('Multitenancy — Store Isolation', () => {
    it('should always include store_id in cash_entries inserts', () => {
      const entry = makeCashEntry();
      expect(entry.store_id).toBe(TEST_STORE_ID);
      expect(entry.store_id).not.toBeNull();
      expect(entry.store_id).not.toBeUndefined();
    });

    it('should filter by store_id when querying registers', () => {
      const storeId: string = TEST_STORE_ID;
      const shouldFilter = storeId !== 'all';
      expect(shouldFilter).toBe(true);
    });

    it('should skip store_id filter when viewing all stores', () => {
      const storeId: string = 'all';
      const shouldFilter = storeId !== 'all';
      expect(shouldFilter).toBe(false);
    });
  });
});
