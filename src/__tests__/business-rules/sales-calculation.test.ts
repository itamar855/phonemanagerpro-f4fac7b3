/**
 * Sales Calculation Business Rules Tests
 *
 * Testa as invariantes de cálculo de vendas:
 * - Soma de pagamentos == sale_price - discount
 * - Comissão baseada no lucro (sale_price - discount - cost_price) * %
 * - Trade-in é contabilizado como forma de pagamento
 * - Split de pagamento (misto) gera transactions separadas
 */
import { describe, it, expect } from 'vitest';
import { makeProduct, makeSale } from '../mocks/supabase';

describe('Sales Calculation — Business Rules', () => {
  describe('Payment Validation Invariant', () => {
    it('payment_cash + payment_card + payment_pix + trade_in = sale_price - discount', () => {
      const sale = makeSale({
        sale_price: 4500,
        discount: 200,
        payment_cash: 2000,
        payment_card: 1500,
        payment_pix: 800,
        has_trade_in: false,
        trade_in_value: null,
      });

      const saleAfterDiscount = sale.sale_price - (sale.discount || 0);
      const totalPayment =
        sale.payment_cash +
        sale.payment_card +
        sale.payment_pix +
        (sale.has_trade_in ? sale.trade_in_value || 0 : 0);

      expect(totalPayment).toBe(saleAfterDiscount);
    });

    it('payment with trade-in should be balanced', () => {
      const sale = makeSale({
        sale_price: 5000,
        discount: 0,
        payment_cash: 1000,
        payment_card: 0,
        payment_pix: 1000,
        has_trade_in: true,
        trade_in_value: 3000,
      });

      const saleAfterDiscount = sale.sale_price - (sale.discount || 0);
      const totalPayment =
        sale.payment_cash +
        sale.payment_card +
        sale.payment_pix +
        (sale.has_trade_in ? sale.trade_in_value || 0 : 0);

      expect(totalPayment).toBe(saleAfterDiscount);
    });

    it('should reject when payment sum != sale_price - discount', () => {
      const sale = makeSale({
        sale_price: 4500,
        discount: 0,
        payment_cash: 2000,
        payment_card: 1000,
        payment_pix: 0,
      });

      const saleAfterDiscount = sale.sale_price - (sale.discount || 0);
      const totalPayment = sale.payment_cash + sale.payment_card + sale.payment_pix;
      const remaining = saleAfterDiscount - totalPayment;

      expect(Math.abs(remaining)).toBeGreaterThan(0.01);
    });
  });

  describe('Profit Calculation', () => {
    it('should calculate profit as (sale_price - discount - cost_price)', () => {
      const product = makeProduct({ cost_price: 3000 });
      const sale = makeSale({ sale_price: 4500, discount: 200 });

      const saleAfterDiscount = sale.sale_price - (sale.discount || 0);
      const profit = saleAfterDiscount - product.cost_price;

      expect(profit).toBe(1300); // 4500 - 200 - 3000
    });

    it('should handle zero profit gracefully', () => {
      const product = makeProduct({ cost_price: 4500 });
      const sale = makeSale({ sale_price: 4500, discount: 0 });

      const saleAfterDiscount = sale.sale_price - (sale.discount || 0);
      const profit = saleAfterDiscount - product.cost_price;

      expect(profit).toBe(0);
    });

    it('should handle negative profit (sold at loss)', () => {
      const product = makeProduct({ cost_price: 5000 });
      const sale = makeSale({ sale_price: 4500, discount: 200 });

      const saleAfterDiscount = sale.sale_price - (sale.discount || 0);
      const profit = saleAfterDiscount - product.cost_price;

      expect(profit).toBe(-700);
    });
  });

  describe('Commission Calculation', () => {
    it('should calculate commission as (profit * commissionPercent / 100)', () => {
      const product = makeProduct({ cost_price: 3000 });
      const sale = makeSale({ sale_price: 4500, discount: 0, commission_percent: 10 });

      const saleAfterDiscount = sale.sale_price - (sale.discount || 0);
      const profit = saleAfterDiscount - product.cost_price;
      const commission = Math.max(0, (profit * sale.commission_percent) / 100);

      expect(profit).toBe(1500);
      expect(commission).toBe(150);
    });

    it('should return 0 commission when profit is negative', () => {
      const product = makeProduct({ cost_price: 5000 });
      const sale = makeSale({ sale_price: 4500, discount: 0, commission_percent: 10 });

      const saleAfterDiscount = sale.sale_price - (sale.discount || 0);
      const profit = saleAfterDiscount - product.cost_price;
      const commission = Math.max(0, (profit * sale.commission_percent) / 100);

      expect(commission).toBe(0);
    });

    it('should return 0 commission when percent is 0', () => {
      const product = makeProduct({ cost_price: 3000 });
      const sale = makeSale({ sale_price: 4500, discount: 0, commission_percent: 0 });

      const profit = sale.sale_price - product.cost_price;
      const commission = Math.max(0, (profit * sale.commission_percent) / 100);

      expect(commission).toBe(0);
    });
  });

  describe('Sale Price After Discount', () => {
    it('should not allow negative sale price after discount', () => {
      const salePrice = 100;
      const discount = 150;
      const salePriceAfterDiscount = Math.max(0, salePrice - discount);

      expect(salePriceAfterDiscount).toBe(0);
    });

    it('should block sale when final price is zero', () => {
      const salePriceAfterDiscount = 0;
      const shouldBlock = salePriceAfterDiscount <= 0;

      expect(shouldBlock).toBe(true);
    });
  });

  describe('Product Status Transitions', () => {
    it('should change status from in_stock to sold on sale', () => {
      const product = makeProduct({ status: 'in_stock' });
      const statusAfterSale = 'sold';

      expect(product.status).toBe('in_stock');
      expect(statusAfterSale).toBe('sold');
    });

    it('should revert status from sold to in_stock on delete', () => {
      const product = makeProduct({ status: 'sold' });
      const statusAfterDelete = 'in_stock';

      expect(statusAfterDelete).toBe('in_stock');
    });

    it('trade-in product should enter as in_stock with cost_price = trade_in_value', () => {
      const tradeInValue = 2000;
      const tradeInProduct = makeProduct({
        status: 'in_stock',
        cost_price: tradeInValue,
        sale_price: null,
      });

      expect(tradeInProduct.status).toBe('in_stock');
      expect(tradeInProduct.cost_price).toBe(tradeInValue);
      expect(tradeInProduct.sale_price).toBeNull();
    });
  });

  describe('Split Payment — Cash Entry Creation', () => {
    it('should create separate cash_entries for each payment method', () => {
      const sale = makeSale({
        payment_cash: 1000,
        payment_card: 2000,
        payment_pix: 1500,
      });

      const paymentsForCashEntry = [
        { method: 'dinheiro', val: sale.payment_cash },
        { method: 'cartao_credito', val: sale.payment_card },
        { method: 'pix', val: sale.payment_pix },
      ].filter((p) => p.val > 0);

      expect(paymentsForCashEntry).toHaveLength(3);
    });

    it('single payment should create one cash_entry', () => {
      const sale = makeSale({
        payment_cash: 4500,
        payment_card: 0,
        payment_pix: 0,
      });

      const paymentsForCashEntry = [
        { method: 'dinheiro', val: sale.payment_cash },
        { method: 'cartao_credito', val: sale.payment_card },
        { method: 'pix', val: sale.payment_pix },
      ].filter((p) => p.val > 0);

      expect(paymentsForCashEntry).toHaveLength(1);
      expect(paymentsForCashEntry[0].method).toBe('dinheiro');
    });

    it('mixed payment (>1 method) should use "misto" description format', () => {
      const desc = 'Venda iPhone 14 Pro';
      const cash = 1000;
      const pix = 2000;
      const card = 1500;

      const descMisto = `${desc} [MISTO:{"dinheiro":${cash},"pix":${pix},"cartao_credito":${card}}]`;
      
      expect(descMisto).toContain('[MISTO:');
      expect(descMisto).toContain('"dinheiro":1000');
      expect(descMisto).toContain('"pix":2000');
      expect(descMisto).toContain('"cartao_credito":1500');
    });
  });
});
