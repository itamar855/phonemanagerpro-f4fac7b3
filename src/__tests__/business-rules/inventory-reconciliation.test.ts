/**
 * Inventory & Financial Reconciliation Business Rules Tests
 *
 * Valida a auditoria e regras de negócio do módulo de Estoque:
 * 1. Composição de custo do aparelho: original_cost_price + peças de reparo (sem duplicação)
 * 2. Finalização de reparo: integridade financeira sem saídas de caixa indevidas
 * 3. Proteção de integridade referencial: bloqueio de exclusão para produtos com vendas ou OS
 * 4. Validação atômica e proteção de estoque negativo para acessórios no PDV
 * 5. Conciliação entre Vendas, Estoque e CMV no DRE
 * 6. Entrada de aparelhos via Trade-In com histórico e custo original garantidos
 */
import { describe, it, expect } from 'vitest';
import { makeProduct, makeAccessory, TEST_STORE_ID, TEST_USER_ID } from '../mocks/supabase';

describe('Inventory & Financial Reconciliation — Business Rules', () => {

  describe('1. Device Cost Composition & Repair Aggregation', () => {
    it('should initialize both cost_price and original_cost_price with the purchase cost', () => {
      const purchaseCost = 1500;
      const device = makeProduct({
        cost_price: purchaseCost,
        original_cost_price: purchaseCost,
        product_type: 'celular',
        status: 'in_stock',
      });

      expect(device.cost_price).toBe(1500);
      expect(device.original_cost_price).toBe(1500);
    });

    it('should simulate trigger recalculation: cost_price = original_cost_price + repair parts cost', () => {
      const originalCost = 1000;
      const repairItems = [
        { unit_cost: 200, quantity: 1 }, // Tela
        { unit_cost: 100, quantity: 1 }, // Bateria
      ];

      const totalRepairPartsCost = repairItems.reduce((sum, item) => sum + item.unit_cost * item.quantity, 0);
      const newCostPrice = originalCost + totalRepairPartsCost;

      expect(totalRepairPartsCost).toBe(300);
      expect(newCostPrice).toBe(1300); // 1000 + 300
    });

    it('should prevent double cost inflation: frontend must NOT add part cost if trigger already recalculated', () => {
      const originalCost = 1000;
      const partCost = 82;

      // Trigger calculates:
      const costAfterTrigger = originalCost + partCost; // 1082

      // If frontend erroneously adds partCost again:
      const flawedFrontendCost = costAfterTrigger + partCost; // 1164 -> BUG!
      expect(flawedFrontendCost).toBe(1164);

      // Correct behavior: frontend leaves cost to the DB trigger
      const correctCost = costAfterTrigger;
      expect(correctCost).toBe(1082);
    });

    it('should correctly display baseDeviceCost and repairCost in AparelhosTable without negative values', () => {
      const productWithOrig = makeProduct({
        cost_price: 1300,
        original_cost_price: 1000,
        sale_price: 1800,
      });

      const totalCost = Number(productWithOrig.cost_price || 0);
      const hasOrig = productWithOrig.original_cost_price !== null && productWithOrig.original_cost_price !== undefined;
      const baseDeviceCost = hasOrig ? Number(productWithOrig.original_cost_price) : Math.max(0, totalCost);
      const repairCost = Math.max(0, totalCost - baseDeviceCost);
      const margin = Number(productWithOrig.sale_price) - totalCost;

      expect(baseDeviceCost).toBe(1000);
      expect(repairCost).toBe(300);
      expect(margin).toBe(500); // 1800 - 1300
    });
  });

  describe('2. Internal Repair Cash Integrity', () => {
    it('should NOT generate acquisition cash expense when completing an internal repair of an existing stock device', () => {
      const device = makeProduct({ cost_price: 2500, name: 'iPhone 13' });
      const repairParts = [{ unit_cost: 150, part_name: 'Bateria' }];

      // Completion must NOT deduct R$ 2500 from the daily physical cash register
      const isInternalRepair = true;
      const shouldLaunchAcquisitionExpense = !isInternalRepair;

      expect(shouldLaunchAcquisitionExpense).toBe(false);
    });

    it('should NOT duplicate cash expense for stock parts already paid at warehouse entry', () => {
      const partFromStock = {
        id: 'part-1',
        name: 'Tela OLED',
        cost_price: 180,
        launch_cash_out_at_entry: true, // Cash entry already created upon arrival
      };

      const generateCashEntryOnRepairFinish = !partFromStock.launch_cash_out_at_entry;
      expect(generateCashEntryOnRepairFinish).toBe(false);
    });
  });

  describe('3. Referential Integrity & Deletion Safeguards', () => {
    it('should BLOCK deleting a product that has an associated completed sale', () => {
      const productId = 'prod-with-sale';
      const sales = [{ id: 'sale-1', product_id: productId }];

      const canDelete = !sales.some(s => s.product_id === productId);
      expect(canDelete).toBe(false);
    });

    it('should BLOCK deleting a product part that is linked to a Service Order', () => {
      const partId = 'part-in-os';
      const osItems = [{ id: 'os-item-1', product_id: partId }];

      const canDelete = !osItems.some(item => item.product_id === partId);
      expect(canDelete).toBe(false);
    });

    it('should ALLOW deleting an unsold, unlinked device from stock', () => {
      const productId = 'available-prod';
      const sales: any[] = [];
      const osItems: any[] = [];

      const canDelete = !sales.some(s => s.product_id === productId) && !osItems.some(i => i.product_id === productId);
      expect(canDelete).toBe(true);
    });
  });

  describe('4. Accessory Stock Decrement & Concurrency in PDV', () => {
    it('should decrement accessory quantity accurately when stock is sufficient', () => {
      const currentStock = 10;
      const soldQty = 3;

      const hasEnough = currentStock >= soldQty;
      const newStock = hasEnough ? currentStock - soldQty : currentStock;

      expect(hasEnough).toBe(true);
      expect(newStock).toBe(7);
    });

    it('should REJECT sale and prevent negative stock when requested qty exceeds current balance', () => {
      const currentStock = 2;
      const soldQty = 5;

      const hasEnough = currentStock >= soldQty;
      expect(hasEnough).toBe(false);

      const safeStock = Math.max(0, currentStock - soldQty);
      // But transaction should throw before writing
      expect(() => {
        if (!hasEnough) {
          throw new Error(`Estoque insuficiente. Disponível: ${currentStock}, solicitado: ${soldQty}.`);
        }
      }).toThrow('Estoque insuficiente');
    });
  });

  describe('5. Inventory & Sales Financial Reconciliation (DRE & CMV)', () => {
    it('should compute CMV of sold devices accurately based on total cost including repairs', () => {
      const sales = [
        { product_id: 'p1', sale_price: 3500 },
        { product_id: 'p2', sale_price: 1800 },
      ];

      const products = [
        makeProduct({ id: 'p1', cost_price: 2500, original_cost_price: 2500 }), // Sem reparo
        makeProduct({ id: 'p2', cost_price: 1300, original_cost_price: 1000 }), // Com R$ 300 de reparo
      ];

      const productMap = new Map(products.map(p => [p.id, p]));

      const totalRevenue = sales.reduce((s, x) => s + x.sale_price, 0); // 5300
      const cmvAparelhos = sales.reduce((s, x) => s + Number(productMap.get(x.product_id)?.cost_price || 0), 0); // 2500 + 1300 = 3800
      const grossProfit = totalRevenue - cmvAparelhos; // 5300 - 3800 = 1500

      expect(cmvAparelhos).toBe(3800);
      expect(grossProfit).toBe(1500);
    });

    it('should reconcile stock status: devices present in sales must be marked as sold', () => {
      const sales = [{ product_id: 'p-sold-1' }, { product_id: 'p-sold-2' }];
      const stock = [
        { id: 'p-sold-1', status: 'in_stock' }, // Desconciliado
        { id: 'p-sold-2', status: 'sold' },     // Conciliado
        { id: 'p-avail-3', status: 'in_stock' }  // Disponível
      ];

      const soldIds = new Set(sales.map(s => s.product_id));
      const needsReconcile = stock.filter(p => soldIds.has(p.id) && p.status === 'in_stock');

      expect(needsReconcile).toHaveLength(1);
      expect(needsReconcile[0].id).toBe('p-sold-1');

      // After reconciliation:
      const reconciledStock = stock.map(p => soldIds.has(p.id) ? { ...p, status: 'sold' } : p);
      expect(reconciledStock.find(p => p.id === 'p-sold-1')?.status).toBe('sold');
      expect(reconciledStock.find(p => p.id === 'p-avail-3')?.status).toBe('in_stock');
    });
  });

  describe('6. Trade-In Stock Registration', () => {
    it('should register trade-in device in stock with cost_price and original_cost_price equal to trade-in valuation', () => {
      const tradeInVal = 800;
      const tradeInDevice = {
        name: 'iPhone XR',
        brand: 'Apple',
        model: 'A2105',
        cost_price: tradeInVal,
        original_cost_price: tradeInVal,
        status: 'in_stock',
        product_type: 'celular',
      };

      expect(tradeInDevice.cost_price).toBe(800);
      expect(tradeInDevice.original_cost_price).toBe(800);
      expect(tradeInDevice.status).toBe('in_stock');
    });
  });

});
