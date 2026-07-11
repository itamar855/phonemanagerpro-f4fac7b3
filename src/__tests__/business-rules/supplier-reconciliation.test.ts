import { describe, it, expect } from 'vitest';

interface Supplier {
  id: string;
  name: string;
  credit_balance: number;
}

interface Product {
  id: string;
  name: string;
  cost_price: number;
  supplier_id: string | null;
  status: string;
}

// Lógica pura de negócio simulada para teste de conciliação de fornecedor
function makeSupplier(init: Partial<Supplier> = {}): Supplier {
  return {
    id: 'sup-1',
    name: 'Distribuidora Premium',
    credit_balance: 0,
    ...init,
  };
}

function makePart(init: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Tela iPhone 14 Pro',
    cost_price: 150,
    supplier_id: 'sup-1',
    status: 'in_stock',
    ...init,
  };
}

// 1. Lógica de registro de pagamento/depósito ao fornecedor
function paySupplier(supplier: Supplier, amount: number, creditAdjust: number = 0): Supplier {
  const newBalance = Number(supplier.credit_balance) + amount + creditAdjust;
  return {
    ...supplier,
    credit_balance: newBalance,
  };
}

// 2. Lógica de cadastro de peça com abatimento de crédito
interface AbatementResult {
  supplier: Supplier;
  part: Product;
  creditUsed: number;
  remainingAmount: number;
}

function purchasePartWithCredit(supplier: Supplier, part: Product, useCredit: boolean): AbatementResult {
  let creditUsed = 0;
  let remainingAmount = part.cost_price;
  let updatedSupplier = { ...supplier };

  if (useCredit && part.supplier_id === supplier.id) {
    if (supplier.credit_balance > 0) {
      creditUsed = Math.min(remainingAmount, supplier.credit_balance);
      remainingAmount -= creditUsed;
      updatedSupplier.credit_balance -= creditUsed;
    }
  }

  return {
    supplier: updatedSupplier,
    part,
    creditUsed,
    remainingAmount,
  };
}

// 3. Lógica de devolução de peça
function returnPartToSupplier(supplier: Supplier, part: Product): { supplier: Supplier; part: Product } {
  if (part.supplier_id !== supplier.id) {
    throw new Error('Fornecedor incompatível');
  }

  const updatedPart = {
    ...part,
    status: 'returned',
  };

  const updatedSupplier = {
    ...supplier,
    credit_balance: Number(supplier.credit_balance) + Number(part.cost_price),
  };

  return {
    supplier: updatedSupplier,
    part: updatedPart,
  };
}

describe('Supplier Reconciliation — Business Rules', () => {
  describe('Deposits and Payments (Sign correctness)', () => {
    it('paying a debt of -100 with 100 should make balance 0', () => {
      const supplier = makeSupplier({ credit_balance: -100 });
      const updated = paySupplier(supplier, 100);
      expect(updated.credit_balance).toBe(0);
    });

    it('paying a debt of -100 with 300 should result in a positive credit of 200', () => {
      const supplier = makeSupplier({ credit_balance: -100 });
      const updated = paySupplier(supplier, 300);
      expect(updated.credit_balance).toBe(200);
    });

    it('adding a deposit of 200 to a clean balance of 0 should make credit 200', () => {
      const supplier = makeSupplier({ credit_balance: 0 });
      const updated = paySupplier(supplier, 200);
      expect(updated.credit_balance).toBe(200);
    });
  });

  describe('Part Registration Abatement (Credit usage)', () => {
    it('abating a 150 cost part with 200 supplier credit should result in 0 remaining to pay and 50 remaining credit', () => {
      const supplier = makeSupplier({ credit_balance: 200 });
      const part = makePart({ cost_price: 150 });

      const result = purchasePartWithCredit(supplier, part, true);

      expect(result.remainingAmount).toBe(0);
      expect(result.creditUsed).toBe(150);
      expect(result.supplier.credit_balance).toBe(50);
    });

    it('abating a 150 cost part with 100 supplier credit should result in 50 remaining to pay and 0 remaining credit', () => {
      const supplier = makeSupplier({ credit_balance: 100 });
      const part = makePart({ cost_price: 150 });

      const result = purchasePartWithCredit(supplier, part, true);

      expect(result.remainingAmount).toBe(50);
      expect(result.creditUsed).toBe(100);
      expect(result.supplier.credit_balance).toBe(0);
    });

    it('should not abate if useCredit is false even if credit exists', () => {
      const supplier = makeSupplier({ credit_balance: 200 });
      const part = makePart({ cost_price: 150 });

      const result = purchasePartWithCredit(supplier, part, false);

      expect(result.remainingAmount).toBe(150);
      expect(result.creditUsed).toBe(0);
      expect(result.supplier.credit_balance).toBe(200);
    });
  });

  describe('Part Returns to Supplier', () => {
    it('returning a 150 cost part should set product status to returned and add 150 to supplier balance', () => {
      const supplier = makeSupplier({ credit_balance: 50 });
      const part = makePart({ cost_price: 150 });

      const result = returnPartToSupplier(supplier, part);

      expect(result.part.status).toBe('returned');
      expect(result.supplier.credit_balance).toBe(200);
    });

    it('returning a 150 cost part when owing -150 to supplier should clear the debt to 0', () => {
      const supplier = makeSupplier({ credit_balance: -150 });
      const part = makePart({ cost_price: 150 });

      const result = returnPartToSupplier(supplier, part);

      expect(result.part.status).toBe('returned');
      expect(result.supplier.credit_balance).toBe(0);
    });
  });
});
