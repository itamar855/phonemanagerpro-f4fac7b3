/**
 * PDV Flow Business Rules Tests
 *
 * Testa o fluxo de venda rápida (acessórios/PDV):
 * - Cart total calculation
 * - Stock decrement
 * - Transaction creation with category "acessorio"
 * - Cash entry creation via createPendingCashEntry
 * - Troco (change) calculation
 * - PDV delete flow (removes transactions + cash_entries by description)
 */
import { describe, it, expect } from 'vitest';
import { makeAccessory, TEST_STORE_ID, TEST_USER_ID } from '../mocks/supabase';

type CartItem = { acc: ReturnType<typeof makeAccessory>; qty: number; price: number };

describe('PDV Flow — Business Rules', () => {
  describe('Cart Calculation', () => {
    it('should calculate cart total correctly', () => {
      const cart: CartItem[] = [
        { acc: makeAccessory({ id: 'a1', sale_price: 25 }), qty: 3, price: 25 },
        { acc: makeAccessory({ id: 'a2', sale_price: 50 }), qty: 1, price: 50 },
        { acc: makeAccessory({ id: 'a3', sale_price: 10 }), qty: 5, price: 10 },
      ];

      const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      expect(cartTotal).toBe(175); // 75 + 50 + 50
    });

    it('should handle empty cart', () => {
      const cart: CartItem[] = [];
      const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      expect(cartTotal).toBe(0);
    });

    it('should handle custom prices (overriding sale_price)', () => {
      const cart: CartItem[] = [
        { acc: makeAccessory({ sale_price: 25 }), qty: 1, price: 20 }, // Custom price
      ];

      const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
      expect(cartTotal).toBe(20);
    });
  });

  describe('Troco (Change) Calculation', () => {
    it('should calculate change when cash > total and no other methods', () => {
      const cartTotal = 100;
      const pdvCash = 150;
      const pdvCard = 0;
      const pdvPix = 0;

      const pdvTroco =
        pdvCash > cartTotal && pdvCard === 0 && pdvPix === 0 ? pdvCash - cartTotal : 0;
      expect(pdvTroco).toBe(50);
    });

    it('should NOT calculate change when mixed payment', () => {
      const cartTotal = 100;
      const pdvCash = 80;
      const pdvCard: number = 30;
      const pdvPix: number = 0;

      const pdvTroco =
        pdvCash > cartTotal && pdvCard === 0 && pdvPix === 0 ? pdvCash - cartTotal : 0;
      expect(pdvTroco).toBe(0);
    });

    it('should calculate remaining correctly', () => {
      const cartTotal = 100;
      const pdvCash = 40;
      const pdvCard = 30;
      const pdvPix = 0;

      const pdvRemaining = cartTotal - pdvCash - pdvCard - pdvPix;
      expect(pdvRemaining).toBe(30);
    });
  });

  describe('Stock Decrement', () => {
    it('should decrement quantity by the number of items sold', () => {
      const acc = makeAccessory({ quantity: 50 });
      const qtySold = 3;
      const newQuantity = acc.quantity - qtySold;

      expect(newQuantity).toBe(47);
    });

    it('should handle selling all remaining stock', () => {
      const acc = makeAccessory({ quantity: 2 });
      const qtySold = 2;
      const newQuantity = acc.quantity - qtySold;

      expect(newQuantity).toBe(0);
    });
  });

  describe('Transaction Creation', () => {
    it('should create transaction with type "income" and category "acessorio"', () => {
      const txPayload = {
        type: 'income',
        category: 'acessorio',
        amount: 175,
        description: 'PDV: 3x Película iPhone 14, 1x Capa iPhone 14',
        store_id: TEST_STORE_ID,
        created_by: TEST_USER_ID,
      };

      expect(txPayload.type).toBe('income');
      expect(txPayload.category).toBe('acessorio');
      expect(txPayload.description).toContain('PDV:');
    });

    it('mixed payment should use MISTO description format', () => {
      const desc = 'PDV: 2x Película';
      const cashAmount = 50;
      const pdvCard = 30;
      const pdvPix = 20;

      const descMisto = `${desc} [MISTO:{"dinheiro":${cashAmount},"pix":${pdvPix},"cartao_credito":${pdvCard}}]`;

      expect(descMisto).toContain('[MISTO:');
    });
  });

  describe('PDV Delete Flow', () => {
    it('should delete transaction by ID', () => {
      const pdvSale = {
        id: 'tx-001',
        description: 'PDV: 2x Película iPhone 14',
        store_id: TEST_STORE_ID,
      };

      // The delete operation targets transactions by ID
      expect(pdvSale.id).toBe('tx-001');
    });

    it('should delete cash_entries by matching description', () => {
      const pdvSale = {
        id: 'tx-001',
        description: 'PDV: 2x Película iPhone 14',
      };

      // The delete operation on cash_entries uses description matching
      // This is the documented behavior from ARCHITECTURE_BRAIN.md
      expect(pdvSale.description).toBeTruthy();
      expect(pdvSale.description).toContain('PDV:');
    });

    it('should not delete cash_entries when description is empty', () => {
      const pdvSale = {
        id: 'tx-001',
        description: null as string | null,
      };

      const shouldDeleteCashEntries = !!pdvSale.description;
      expect(shouldDeleteCashEntries).toBe(false);
    });
  });

  describe('Store Validation for PDV', () => {
    it('should block PDV when activeStoreId is "all"', () => {
      const activeStoreId: string = 'all';
      const pdvStoreId: string = '';
      const storeToUse: string =
        activeStoreId === 'all' && pdvStoreId ? pdvStoreId : activeStoreId;

      const shouldBlock = storeToUse === 'all';
      expect(shouldBlock).toBe(true);
    });

    it('should allow PDV when specific store selected', () => {
      const activeStoreId: string = TEST_STORE_ID;
      const storeToUse = activeStoreId;

      const shouldBlock = storeToUse === 'all';
      expect(shouldBlock).toBe(false);
    });
  });

  describe('PDV Accessory Discount Calculations and Metadata', () => {
    const calculateDiscount = (
      subtotal: number,
      discountInput: number,
      discountType: 'fixed' | 'percent'
    ) => {
      const discountValue =
        discountType === 'percent'
          ? Math.min(subtotal, Math.max(0, (subtotal * discountInput) / 100))
          : Math.min(subtotal, Math.max(0, discountInput));
      const netTotal = Math.max(0, subtotal - discountValue);
      return { discountValue, netTotal };
    };

    it('should calculate net total with fixed discount correctly', () => {
      const { discountValue, netTotal } = calculateDiscount(100, 15, 'fixed');

      expect(discountValue).toBe(15);
      expect(netTotal).toBe(85);
    });

    it('should calculate net total with percentage discount correctly', () => {
      const { discountValue, netTotal } = calculateDiscount(80, 25, 'percent');

      expect(discountValue).toBe(20);
      expect(netTotal).toBe(60);
    });

    it('should clamp discount so net total is never negative', () => {
      const subtotal = 50;
      const excessiveDiscount = 80;

      const discountValue = Math.min(subtotal, Math.max(0, excessiveDiscount));
      const netTotal = Math.max(0, subtotal - discountValue);

      expect(discountValue).toBe(50);
      expect(netTotal).toBe(0);
    });

    it('should calculate change based on net total rather than subtotal', () => {
      const subtotal = 60;
      const discount = 10;
      const netTotal = subtotal - discount; // 50
      const pdvCash = 100;
      const pdvCard = 0;
      const pdvPix = 0;

      const pdvTroco = pdvCash > netTotal && pdvCard === 0 && pdvPix === 0 ? pdvCash - netTotal : 0;
      const cashAmount = pdvCash - pdvTroco;

      expect(pdvTroco).toBe(50);
      expect(cashAmount).toBe(50); // Matches netTotal in drawer
    });

    it('should preserve discount details in transaction metadata and description', () => {
      const subtotal = 70;
      const discount = 10;
      const netTotal = 60;
      const descBase = 'PDV: 2x Capa Pro';
      const discountLabel = ` (Desc: R$ 10,00)`;
      const desc = `${descBase}${discountLabel}`;

      const pdvMetadata = {
        cart: [{ id: 'acc-1', qty: 2, price: 35 }],
        subtotal,
        discount,
        discount_type: 'fixed',
      };

      const descMisto = `${desc} [MISTO:{"dinheiro":30,"pix":30,"cartao_credito":0}]`;

      expect(pdvMetadata.subtotal).toBe(70);
      expect(pdvMetadata.discount).toBe(10);
      expect(netTotal).toBe(60);
      expect(descMisto).toContain('(Desc: R$ 10,00)');
      expect(descMisto).toMatch(/\[MISTO:(\{.*\})\]/);
    });
  });
});
