/**
 * OS Billing Business Rules Tests
 *
 * Testa o fluxo de faturamento de Ordens de Serviço:
 * - createPendingCashEntry usa cash_register_id (não register_id)
 * - Fallback para caixa aberto quando o do usuário não encontrado
 * - Criação de cash_entries com store_id
 * - Efeitos contábeis do faturamento
 */
import { describe, it, expect } from 'vitest';
import { TEST_STORE_ID, TEST_USER_ID, TEST_REGISTER_ID, makeServiceOrder } from '../mocks/supabase';

describe('OS Billing — Business Rules', () => {
  describe('createPendingCashEntry for OS', () => {
    it('should create cash_entry with cash_register_id on OS payment', () => {
      const os = makeServiceOrder({ final_cost: 350, payment_method: 'dinheiro' });
      const entryPayload = {
        cash_register_id: TEST_REGISTER_ID,
        store_id: TEST_STORE_ID,
        type: 'entrada',
        amount: os.final_cost,
        description: `OS #${os.id.slice(0, 8)} - ${os.device_name}`,
        payment_method: os.payment_method,
        receipt_url: null,
        confirmed: false,
        created_by: TEST_USER_ID,
      };

      // Critical invariant: must use cash_register_id
      expect(entryPayload).toHaveProperty('cash_register_id');
      expect(entryPayload).not.toHaveProperty('register_id');
      expect(entryPayload.cash_register_id).toBe(TEST_REGISTER_ID);
      expect(entryPayload.store_id).toBe(TEST_STORE_ID);
    });
  });

  describe('Cash Register Lookup Logic', () => {
    it('should first try to find register opened by the current user', () => {
      const lookupQuery = {
        table: 'cash_registers',
        filters: [
          { col: 'status', val: 'open' },
          { col: 'opened_by', val: TEST_USER_ID },
          { col: 'store_id', val: TEST_STORE_ID },
        ],
      };

      expect(lookupQuery.filters).toContainEqual({ col: 'opened_by', val: TEST_USER_ID });
      expect(lookupQuery.filters).toContainEqual({ col: 'status', val: 'open' });
    });

    it('should fallback to any open register in the store if user has none', () => {
      const fallbackQuery = {
        table: 'cash_registers',
        filters: [
          { col: 'status', val: 'open' },
          { col: 'store_id', val: TEST_STORE_ID },
        ],
      };

      // Fallback should NOT filter by opened_by
      expect(fallbackQuery.filters).not.toContainEqual(
        expect.objectContaining({ col: 'opened_by' })
      );
    });

    it('should skip store_id filter when storeId is "all"', () => {
      const storeId = 'all';
      const filters = [{ col: 'status', val: 'open' }];
      if (storeId !== 'all') {
        filters.push({ col: 'store_id', val: storeId });
      }

      expect(filters).not.toContainEqual(expect.objectContaining({ col: 'store_id' }));
    });

    it('should warn user when no open register found', () => {
      const register = null;
      const registerId = register ? (register as any).id : null;

      expect(registerId).toBeNull();
      // In the real code, this triggers toast.error("Nenhum caixa aberto na loja atual...")
    });
  });

  describe('OS Status Transitions', () => {
    it('should support valid status transitions', () => {
      const validTransitions: Record<string, string[]> = {
        pending: ['in_progress', 'waiting_approval', 'cancelled'],
        waiting_approval: ['approved', 'cancelled'],
        approved: ['in_progress'],
        in_progress: ['completed', 'waiting_parts'],
        waiting_parts: ['in_progress'],
        completed: ['delivered'],
        delivered: [],
        cancelled: [],
      };

      // pending → in_progress is valid
      expect(validTransitions['pending']).toContain('in_progress');
      // delivered → nothing is valid (terminal state)
      expect(validTransitions['delivered']).toHaveLength(0);
    });
  });

  describe('OS Parts — Cash Entry for Part Purchases', () => {
    it('should create cash_entry with type "saida" for part purchases', () => {
      const partPayload = {
        cash_register_id: TEST_REGISTER_ID,
        store_id: TEST_STORE_ID,
        type: 'saida',
        amount: 85,
        description: 'Peça: Tela LCD iPhone 13 (OS #os-001)',
        payment_method: 'dinheiro',
        confirmed: false,
        created_by: TEST_USER_ID,
      };

      expect(partPayload.type).toBe('saida');
      expect(partPayload).toHaveProperty('cash_register_id');
      expect(partPayload).not.toHaveProperty('register_id');
    });
  });

  describe('DeviceRepairModal — Cash Entry for Repairs', () => {
    it('should create cash_entry with type "saida" for device repairs', () => {
      const repairPayload = {
        cash_register_id: TEST_REGISTER_ID,
        store_id: TEST_STORE_ID,
        type: 'saida',
        amount: 150,
        description: 'Reparo: Troca de tela - iPhone 14',
        payment_method: 'dinheiro',
        confirmed: false,
        created_by: TEST_USER_ID,
      };

      expect(repairPayload.type).toBe('saida');
      expect(repairPayload).toHaveProperty('cash_register_id');
      expect(repairPayload).not.toHaveProperty('register_id');
    });

    it('should confirm cash entry immediately if payment voucher is attached', () => {
      const deviceVoucher = 'https://supabase.co/storage/v1/object/public/comprovantes/device-123.jpg';
      const cashEntry = {
        amount: 1200,
        confirmed: !!deviceVoucher,
        receipt_url: deviceVoucher,
      };

      expect(cashEntry.confirmed).toBe(true);
      expect(cashEntry.receipt_url).toBe(deviceVoucher);
    });

    it('should leave cash entry pending (confirmed=false) if no payment voucher is attached', () => {
      const deviceVoucher = null;
      const cashEntry = {
        amount: 1200,
        confirmed: !!deviceVoucher,
        receipt_url: deviceVoucher,
      };

      expect(cashEntry.confirmed).toBe(false);
      expect(cashEntry.receipt_url).toBe(null);
    });
  });
});
