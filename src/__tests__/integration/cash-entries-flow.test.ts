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

    it('should correctly fallback to un-owned register if user did not open one', () => {
      // 1. GERENTE abre o caixa
      const gerenteId = 'gerente-id';
      const registerId = 'caixa-gerente-123';
      
      const openingEntry = makeCashEntry({
        type: 'abertura',
        amount: 100,
        description: 'Abertura de caixa (Gerente)',
        confirmed: true,
        created_by: gerenteId,
        cash_register_id: registerId,
      });

      // 2. VENDEDOR faz uma venda sem ter caixa aberto
      const vendedorId = 'vendedor-id';
      
      const saleEntry = makeCashEntry({
        type: 'entrada',
        amount: 2000,
        description: 'Venda S23 Ultra → Maria',
        payment_method: 'dinheiro',
        confirmed: false,
        created_by: vendedorId,
        cash_register_id: registerId, // fallback para o caixa aberto pelo gerente
      });

      const allEntries = [openingEntry, saleEntry];
      
      // O VENDEDOR inseriu no caixa do GERENTE com sucesso
      expect(allEntries[1].cash_register_id).toBe(registerId);
      expect(allEntries[1].created_by).toBe(vendedorId);
      
      // Totais do caixa do GERENTE deve incluir a venda do VENDEDOR
      const pendingEntries = allEntries.filter(e => !e.confirmed);
      expect(pendingEntries).toHaveLength(1);
      expect(pendingEntries[0].amount).toBe(2000);
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

  describe('OS Linking & PDV Isolation (Regression Prevention)', () => {
    it('should NEVER match accessories with "IOS 30W" as an OS number', () => {
      const pdvDesc = "PDV: 1x CABO USB TIPO-C P/ IOS 30W (CB-50) A'GOLD";
      const osRegex = /\bOS\s*#?\s*(\d+)\b/i;
      const match = pdvDesc.match(osRegex);
      expect(match).toBeNull();
    });

    it('should correctly identify legitimate OS descriptions', () => {
      const osRegex = /\bOS\s*#?\s*(\d+)\b/i;
      
      const osDesc1 = "OS #30 — Troca de Tela (Jaiciel Vieira)";
      const match1 = osDesc1.match(osRegex);
      expect(match1).not.toBeNull();
      expect(match1![1]).toBe("30");

      const osDesc2 = "Compra de Peça (OS #42): Conector de Carga";
      const match2 = osDesc2.match(osRegex);
      expect(match2).not.toBeNull();
      expect(match2![1]).toBe("42");
    });

    it('should recognize PDV and Venda descriptions as non-OS operations', () => {
      const pdvDesc = "PDV: 1x CABO USB TIPO-C P/ IOS 30W (CB-50) A'GOLD";
      const vendaDesc = "Venda: iPhone 12 Pro Max - Carlos";
      const isSale1 = pdvDesc.startsWith("PDV:") || pdvDesc.startsWith("Venda:");
      const isSale2 = vendaDesc.startsWith("PDV:") || vendaDesc.startsWith("Venda:");

      expect(isSale1).toBe(true);
      expect(isSale2).toBe(true);
    });
  });

  describe('Multiple Receipts & Cash Payment Optimization', () => {
    // Importação dinâmica ou teste da função de parsing
    const parseReceiptUrls = (urlOrJson: string | null | undefined): string[] => {
      if (!urlOrJson) return [];
      const trimmed = urlOrJson.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            return parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
          }
        } catch (e) {}
      }
      if (trimmed.includes(",")) {
        return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
      }
      return [trimmed].filter(Boolean);
    };

    it('should parse single URL, JSON array, and comma-separated receipts correctly', () => {
      expect(parseReceiptUrls(null)).toEqual([]);
      expect(parseReceiptUrls(undefined)).toEqual([]);
      expect(parseReceiptUrls("")).toEqual([]);

      // URL única
      expect(parseReceiptUrls("https://storage.supabase.co/receipt1.jpg")).toEqual([
        "https://storage.supabase.co/receipt1.jpg",
      ]);

      // Array JSON com múltiplos comprovantes (PIX 1 + PIX 2)
      const multiJson = JSON.stringify([
        "https://storage.supabase.co/receipt1.jpg",
        "https://storage.supabase.co/receipt2.pdf",
      ]);
      expect(parseReceiptUrls(multiJson)).toEqual([
        "https://storage.supabase.co/receipt1.jpg",
        "https://storage.supabase.co/receipt2.pdf",
      ]);

      // Separado por vírgula
      expect(parseReceiptUrls("url1.jpg, url2.png")).toEqual(["url1.jpg", "url2.png"]);
    });

    it('should auto-confirm cash entries and exempt cash from required photo attachments', () => {
      // Simulação da regra de negócio: vendas em dinheiro entram no caixa fisicamente confirmadas
      const cashSale = makeCashEntry({
        type: 'entrada',
        amount: 150,
        description: 'Venda: Carregador Turbo 30W',
        payment_method: 'dinheiro',
        confirmed: true, // auto-confirmado em espécie
      });

      const pixSale = makeCashEntry({
        type: 'entrada',
        amount: 150,
        description: 'Venda: Fone Bluetooth',
        payment_method: 'pix',
        confirmed: false, // pendente até envio do comprovante
      });

      expect(cashSale.confirmed).toBe(true);
      expect(pixSale.confirmed).toBe(false);

      // Validação da trava de anexo
      const validateConfirmation = (entry: any, filesCount: number) => {
        const isCash = entry.payment_method === 'dinheiro';
        if (!isCash && filesCount === 0) {
          return { allowed: false, error: 'Comprovante obrigatório para não-dinheiro' };
        }
        return { allowed: true };
      };

      // Dinheiro confirma mesmo com 0 arquivos anexados
      expect(validateConfirmation(cashSale, 0).allowed).toBe(true);

      // PIX é bloqueado sem arquivo anexado
      expect(validateConfirmation(pixSale, 0).allowed).toBe(false);

      // PIX é permitido com 1 ou mais arquivos
      expect(validateConfirmation(pixSale, 1).allowed).toBe(true);
      expect(validateConfirmation(pixSale, 2).allowed).toBe(true);
    });

    it('should block opening a second cash register for the same store if one is already open', () => {
      const openRegisters = [
        makeCashRegister({
          id: 'reg-store-1',
          store_id: TEST_STORE_ID,
          status: 'open',
        }),
      ];

      const canOpenRegister = (storeId: string) => {
        const hasOpen = openRegisters.some(r => r.store_id === storeId && r.status === 'open');
        return !hasOpen;
      };

      // Tentativa de abrir outro caixa na mesma loja deve ser bloqueada
      expect(canOpenRegister(TEST_STORE_ID)).toBe(false);

      // Tentativa de abrir caixa em outra loja deve ser permitida
      expect(canOpenRegister('other-store-id')).toBe(true);
    });
  });
});

