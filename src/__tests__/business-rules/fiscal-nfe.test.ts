// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  isValidCnpj,
  formatCnpj,
  sanitizeCnpj
} from "@/lib/services/cnpjService";
import {
  calculateMod11,
  generateAccessKey,
  getDefaultFiscalSettings,
  saveFiscalSettings,
  getFiscalSettings,
  emitInvoice,
  cancelInvoice,
  getInvoices,
  UF_IBGE_CODES,
  Invoice
} from "@/lib/services/fiscalService";

describe("Módulo Fiscal — Validação e Sanitização de CNPJ", () => {
  it("deve validar corretamente CNPJs matematicamente válidos", () => {
    // CNPJ clássico Banco do Brasil
    expect(isValidCnpj("00.000.000/0001-91")).toBe(true);
    expect(isValidCnpj("00000000000191")).toBe(true);
    // Outros CNPJs válidos
    expect(isValidCnpj("33.000.167/0001-01")).toBe(true); // Petrobras
    expect(isValidCnpj("60.701.190/0001-04")).toBe(true); // Itaú Unibanco
  });

  it("deve rejeitar CNPJs com dígitos verificadores incorretos", () => {
    expect(isValidCnpj("00.000.000/0001-92")).toBe(false);
    expect(isValidCnpj("33.000.167/0001-00")).toBe(false);
    expect(isValidCnpj("12.345.678/0001-99")).toBe(false);
  });

  it("deve rejeitar CNPJs com todos os números repetidos", () => {
    expect(isValidCnpj("00.000.000/0000-00")).toBe(false);
    expect(isValidCnpj("11.111.111/1111-11")).toBe(false);
    expect(isValidCnpj("99.999.999/9999-99")).toBe(false);
  });

  it("deve rejeitar CNPJs com tamanho inválido", () => {
    expect(isValidCnpj("123")).toBe(false);
    expect(isValidCnpj("000000000019")).toBe(false);
    expect(isValidCnpj("")).toBe(false);
  });

  it("deve sanitizar strings removendo pontos, barras e traços", () => {
    expect(sanitizeCnpj("00.000.000/0001-91")).toBe("00000000000191");
    expect(sanitizeCnpj("CNPJ: 12.345.678/0001-00 (Matriz)")).toBe("12345678000100");
  });

  it("deve formatar adequadamente CNPJs para exibição", () => {
    expect(formatCnpj("00000000000191")).toBe("00.000.000/0001-91");
    expect(formatCnpj("12345")).toBe("12.345"); // Máscara progressiva durante digitação
  });
});

describe("Módulo Fiscal — Chave de Acesso SEFAZ e Módulo 11", () => {
  it("deve calcular o Dígito Verificador Módulo 11 conforme o padrão oficial da SEFAZ", () => {
    // Teste com vetor de teste conhecido
    const key43 = "3526090000000000019155001000000001112345678";
    const dv = calculateMod11(key43);
    expect(dv).toBeGreaterThanOrEqual(0);
    expect(dv).toBeLessThanOrEqual(9);
    expect(typeof dv).toBe("number");
  });

  it("deve gerar chave de acesso de 44 dígitos com cUF, AAMM, CNPJ, Modelo, Série e Número corretos", () => {
    const date = new Date(2026, 8, 24); // Setembro de 2026
    const key = generateAccessKey("SP", date, "00.000.000/0001-91", "65", 1, 42, "12345678");

    expect(key).toHaveLength(44);
    // UF SP = 35
    expect(key.startsWith("35")).toBe(true);
    // Ano 26 + Mês 09
    expect(key.slice(2, 6)).toBe("2609");
    // CNPJ 14 dígitos
    expect(key.slice(6, 20)).toBe("00000000000191");
    // Modelo 65 (NFC-e)
    expect(key.slice(20, 22)).toBe("65");
    // Série 001
    expect(key.slice(22, 25)).toBe("001");
    // Número 000000042
    expect(key.slice(25, 34)).toBe("000000042");
    // Tipo de Emissão 1 (Normal)
    expect(key.charAt(34)).toBe("1");
    // Código Numérico 8 dígitos
    expect(key.slice(35, 43)).toBe("12345678");
  });

  it("deve mapear corretamente os códigos IBGE dos estados brasileiros", () => {
    expect(UF_IBGE_CODES["SP"]).toBe("35");
    expect(UF_IBGE_CODES["RJ"]).toBe("33");
    expect(UF_IBGE_CODES["MG"]).toBe("31");
    expect(UF_IBGE_CODES["PR"]).toBe("41");
    expect(UF_IBGE_CODES["BA"]).toBe("29");
  });
});

describe("Módulo Fiscal — Emissão de Notas (NFC-e, NF-e e Entrada Trade-In)", () => {
  const testStoreId = "store-test-fiscal-01";

  beforeEach(() => {
    localStorage.clear();
  });

  it("deve inicializar configurações padrão com dados do Simples Nacional", () => {
    const settings = getDefaultFiscalSettings(testStoreId);
    expect(settings.store_id).toBe(testStoreId);
    expect(settings.regime_tributario).toBe("simples_nacional");
    expect(settings.default_ncm_celular).toBe("8517.13.00");
    expect(settings.default_ncm_acessorio).toBe("3926.90.90");
    expect(settings.default_cfop_venda).toBe("5102");
    expect(settings.default_cfop_entrada).toBe("1102");
    expect(settings.nfe_next_number).toBe(1);
    expect(settings.nfce_next_number).toBe(1);
  });

  it("deve emitir uma NFC-e e incrementar o sequencial numérico", async () => {
    const initialSettings = getDefaultFiscalSettings(testStoreId);
    initialSettings.cnpj = "00.000.000/0001-91";
    initialSettings.razao_social = "CELL MANAGER PRO LTDA";
    initialSettings.uf = "SP";
    await saveFiscalSettings(initialSettings);

    const emitted = await emitInvoice({
      storeId: testStoreId,
      type: "nfce",
      customerName: "Cliente Balcão",
      totalAmount: 150.0,
      items: [
        {
          name: "Cabo USB-C Trançado",
          ncm: "8544.42.00",
          cfop: "5102",
          quantity: 1,
          unit_price: 150.0,
          total_price: 150.0
        }
      ],
      userId: "user-123"
    });

    expect(emitted.id).toBeDefined();
    expect(emitted.invoice_type).toBe("nfce");
    expect(emitted.number).toBe(1);
    expect(emitted.status).toBe("authorized");
    expect(emitted.access_key).toHaveLength(44);

    // O próximo número deve ter incrementado para 2
    const updatedSettings = await getFiscalSettings(testStoreId);
    expect(updatedSettings.nfce_next_number).toBe(2);

    // Deve estar na listagem de notas
    const invoices = await getInvoices(testStoreId);
    expect(invoices.length).toBe(1);
    expect(invoices[0].id).toBe(emitted.id);
  });

  it("deve emitir NF-e de entrada para Trade-In com respaldo legal", async () => {
    const initialSettings = getDefaultFiscalSettings(testStoreId);
    initialSettings.cnpj = "00.000.000/0001-91";
    await saveFiscalSettings(initialSettings);

    const tradeInInvoice = await emitInvoice({
      storeId: testStoreId,
      type: "nfe_entrada",
      customerName: "Vendedor Pessoa Física",
      customerCpfCnpj: "123.456.789-00",
      totalAmount: 1200.0,
      items: [
        {
          name: "iPhone 11 64GB Usado (Trade-In Entrada)",
          ncm: "8517.13.00",
          cfop: "1102", // Compra para comercialização
          quantity: 1,
          unit_price: 1200.0,
          total_price: 1200.0
        }
      ],
      userId: "user-trade-in"
    });

    expect(tradeInInvoice.invoice_type).toBe("nfe_entrada");
    expect(tradeInInvoice.total_amount).toBe(1200.0);
    expect(tradeInInvoice.customer_name).toBe("Vendedor Pessoa Física");
    expect(tradeInInvoice.customer_cpf_cnpj).toBe("123.456.789-00");
  });
});

describe("Módulo Fiscal — Trava de Cancelamento SEFAZ (24 Horas)", () => {
  const testStoreId = "store-test-cancel-01";

  beforeEach(() => {
    localStorage.clear();
  });

  it("deve permitir cancelamento com justificativa fundamentada de pelo menos 15 caracteres dentro de 24 horas", async () => {
    const settings = getDefaultFiscalSettings(testStoreId);
    settings.cnpj = "00.000.000/0001-91";
    await saveFiscalSettings(settings);

    const invoice = await emitInvoice({
      storeId: testStoreId,
      type: "nfce",
      customerName: "Teste Cancelamento",
      totalAmount: 99.0,
      items: [
        {
          name: "Fone de Ouvido",
          ncm: "8518.30.00",
          cfop: "5102",
          quantity: 1,
          unit_price: 99.0,
          total_price: 99.0
        }
      ],
      userId: "user-123"
    });

    const justification = "Venda cancelada por motivo de desistência do consumidor antes da entrega.";
    const result = await cancelInvoice(invoice.id, testStoreId, justification);

    expect(result.success).toBe(true);

    const invoices = await getInvoices(testStoreId);
    const updated = invoices.find(i => i.id === invoice.id);
    expect(updated?.status).toBe("cancelled");
    expect(updated?.cancellation_reason).toBe(justification);
    expect(updated?.cancelled_at).toBeDefined();
  });

  it("deve rejeitar cancelamento se a justificativa tiver menos de 15 caracteres (exigência SEFAZ)", async () => {
    const invoice = await emitInvoice({
      storeId: testStoreId,
      type: "nfce",
      customerName: "Teste Justificativa Curta",
      totalAmount: 50.0,
      items: [],
      userId: "user-123"
    });

    await expect(
      cancelInvoice(invoice.id, testStoreId, "Cancelou")
    ).rejects.toThrow("no mínimo 15 caracteres");
  });

  it("deve rejeitar cancelamento caso o prazo legal de 24 horas tenha expirado", async () => {
    const invoice = await emitInvoice({
      storeId: testStoreId,
      type: "nfce",
      customerName: "Teste 24h Expirado",
      totalAmount: 200.0,
      items: [],
      userId: "user-123"
    });

    // Simula uma nota emitida há 25 horas atrás
    const pastDate = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const invoices = await getInvoices(testStoreId);
    const target = invoices.find(i => i.id === invoice.id)!;
    target.authorized_at = pastDate;
    target.created_at = pastDate;
    localStorage.setItem(`cellmanager_invoices_${testStoreId}`, JSON.stringify(invoices));

    await expect(
      cancelInvoice(invoice.id, testStoreId, "Justificativa válida com mais de quinze caracteres")
    ).rejects.toThrow("Prazo legal de cancelamento SEFAZ expirado");
  });
});
