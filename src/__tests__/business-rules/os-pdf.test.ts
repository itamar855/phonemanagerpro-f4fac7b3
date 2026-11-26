import { describe, expect, it } from "vitest";
import { checklistCount, checklistRows, checklistSummary, cleanServiceRows, formatDay, hasChecklist, performedServices, recalcFinalPrice, serviceBreakdown } from "@/components/features/os/osPdfRules";
import { generateOSPdf, generateThermalPdf } from "@/components/features/os/osPdf";
import type { jsPDF } from "jspdf";

describe("PDF da OS: checklist", () => {
  it("separa defeito, não testado e funcionando, na ordem da tela", () => {
    const s = checklistSummary({ "Wi-Fi": "na", "Display / LCD": "defeito", "Câmera Frontal": "ok", "Botão Power": "ok", "Extra": "defeito" });
    expect(s.defects).toEqual(["Display / LCD", "Extra"]);
    expect(s.untested).toEqual(["Wi-Fi"]);
    expect(s.ok).toEqual(["Câmera Frontal", "Botão Power"]);
    expect(hasChecklist(s)).toBe(true);
  });

  it("checklist vazio ou inválido não aparece", () => {
    expect(hasChecklist(checklistSummary(null))).toBe(false);
    expect(hasChecklist(checklistSummary({}))).toBe(false);
    expect(hasChecklist(checklistSummary([1, 2]))).toBe(false);
  });
});

describe("PDF da OS: serviço executado e valor cobrado", () => {
  const tela = { name: "Tela Samsung A15 OLED", quantity: 1, unit_price: 450 };

  const L = (label: string, total: number | null, kind: string, quantity: number | null = null) => ({ label, quantity, total, kind });

  it("sem peças nem serviços: uma linha com o valor final", () => {
    expect(serviceBreakdown({ final_price: 700, requested_service: "Outro" }, [])).toEqual({
      lines: [L("Serviço", 700, "labor")], total: 700, discount: 0,
    });
  });

  it("peça com o valor cobrado; a diferença para o valor final vira mão de obra", () => {
    const r = serviceBreakdown({ final_price: 500, requested_service: "Troca de Tela" }, [tela]);
    expect(r.lines).toEqual([L("Tela Samsung A15 OLED", 450, "part", 1), L("Mão de obra - Troca de Tela", 50, "labor")]);
    expect(r.total).toBe(500);
  });

  it("peça já com tudo incluído: sem linha de mão de obra", () => {
    expect(serviceBreakdown({ final_price: 450 }, [tela]).lines).toHaveLength(1);
  });

  it("valor final menor que as peças: a diferença aparece como desconto", () => {
    const r = serviceBreakdown({ final_price: 400 }, [tela]);
    expect(r.lines.at(-1)).toEqual(L("Desconto", -50, "discount"));
    expect(r.total).toBe(400);
  });

  it("vários serviços com valor e desconto: total = soma − desconto = valor final", () => {
    const r = serviceBreakdown({
      final_price: 650, discount_amount: 50,
      services_performed: [{ description: "Troca do módulo frontal", price: 500 }, { description: "Desoxidação", price: 200 }],
    }, []);
    expect(r.lines).toEqual([L("Troca do módulo frontal", 500, "service"), L("Desoxidação", 200, "service"), L("Desconto", -50, "discount")]);
    expect(r.total).toBe(650);
  });

  it("serviços só descritos (sem valor): o valor final entra como 'Valor dos serviços', antes do desconto", () => {
    const r = serviceBreakdown({
      final_price: 650, discount_amount: 50,
      services_performed: [{ description: "Troca do módulo", price: null }, { description: "Desoxidação", price: null }],
    }, []);
    expect(r.lines).toEqual([L("Troca do módulo", null, "service"), L("Desoxidação", null, "service"), L("Valor dos serviços", 700, "labor"), L("Desconto", -50, "discount")]);
    expect(r.total).toBe(650);
  });

  it("OS antiga com só o texto livre: cada linha vira um serviço", () => {
    expect(performedServices({ service_performed: "Troca do módulo\r\n\nDesoxidação " })).toEqual([
      { description: "Troca do módulo", price: null }, { description: "Desoxidação", price: null },
    ]);
    expect(performedServices({ services_performed: [{ description: " A ", price: "10" }, { description: "", price: 5 }], service_performed: "X" }))
      .toEqual([{ description: "A", price: 10 }]);
  });

  it("sem valor final: total é a soma das peças (quantidade conta) menos o desconto", () => {
    expect(serviceBreakdown({ final_price: null }, [{ ...tela, quantity: 2 }]).total).toBe(900);
    expect(serviceBreakdown({ final_price: null, discount_amount: 100 }, [{ ...tela, quantity: 2 }]).total).toBe(800);
    expect(serviceBreakdown({ final_price: 0 }, []).lines).toEqual([]);
  });

  it("formulário: linhas vazias somem e valor vazio vira null", () => {
    expect(cleanServiceRows([{ description: " Troca ", price: "" }, { description: "", price: "50" }, { description: "B", price: "12.345" }]))
      .toEqual([{ description: "Troca", price: null }, { description: "B", price: 12.35 }]);
  });

  it("valor final na tela: serviços com valor somam com as peças e tiram o desconto", () => {
    const prev = { final_price: "", discount_amount: "", services: [] as { price: string }[] };
    expect(recalcFinalPrice(prev, { discount_amount: "50", services: [{ price: "500" }, { price: "200" }] }, 100)).toBe("750.00");
  });

  it("valor final na tela: só descrições — mudar o desconto ajusta o valor final", () => {
    const prev = { final_price: "700", discount_amount: "", services: [{ price: "" }] };
    expect(recalcFinalPrice(prev, { discount_amount: "50", services: [{ price: "" }] }, 0)).toBe("650.00");
    expect(recalcFinalPrice({ ...prev, final_price: "650", discount_amount: "50" }, { discount_amount: "", services: [{ price: "" }] }, 0)).toBe("700.00");
    expect(recalcFinalPrice(prev, { discount_amount: "", services: [{ price: "" }, { price: "" }] }, 0)).toBe("700");
  });

  it("data da garantia não volta um dia pelo fuso", () => {
    expect(formatDay("2026-11-19T00:00:00+00:00")).toBe("19/11/2026");
    expect(formatDay("2026-02-01")).toBe("01/02/2026");
    expect(formatDay(null)).toBe("");
  });
});

describe("PDF da OS: gera o documento com as seções novas", () => {
  const order = {
    order_number: 123, status: "delivered", created_at: "2026-11-19T14:23:18Z",
    customer_name: "Cliente Teste", device_brand: "iPhone", device_model: "14",
    reported_defect: "Caiu na água", requested_service: "Outro",
    estimated_price: 740, final_price: 700, warranty_end_date: "2026-12-19T00:00:00+00:00",
    device_condition: "Tela trincada no canto",
    services_performed: [{ description: "Limpeza da placa e troca do conector de carga", price: null as number | null }], discount_amount: 20,
    entry_checklist: { "Display / LCD": "defeito", "Wi-Fi": "na", "Botão Power": "ok" },
    exit_checklist: { "Display / LCD": "ok" },
    payment_pix: 700,
  };
  const textOf = (doc: jsPDF) => {
    const pages: string[] = (doc.internal as unknown as { pages: string[][] }).pages.slice(1).map((p) => p.join("\n"));
    return pages.join("\n");
  };

  it("A4 traz observações de entrada, checklist, serviço executado, valor cobrado e garantia", async () => {
    const doc = await generateOSPdf(order, { name: "Loja" }, "Rafael", "https://x/os/1", [{ name: "Conector de carga", quantity: 1, unit_price: 150 }]);
    const t = textOf(doc);
    for (const s of ["SERVIÇO EXECUTADO", "Limpeza da placa", "Conector de carga", "150,00", "570,00", "Demais servi", "Display / LCD", "Tela trincada", "19/12/2026", "TOTAL DO SERVIÇO", "Desconto", "20,00",
      "CHECKLIST DE TESTES", "ITEM TESTADO", "ENTRADA", "SAÍDA", "Wi-Fi", "Botão Power", "Na entrada:", "Na entrega:", "1 de 1 itens funcionando", "Orçamento inicial"]) {
      expect(t, s).toContain(s);
    }
    expect(t).not.toContain("ORÇAMENTO / VALORES"); // com serviço lançado, o total já está no Serviço executado
  });

  it("cupom 80mm traz as peças, o total e os testes, no tamanho do conteúdo", async () => {
    const doc = await generateThermalPdf(order, { name: "Loja" }, "Rafael", "https://x/os/1", [{ name: "Conector de carga", quantity: 1, unit_price: 150 }]);
    const t = textOf(doc);
    expect(t).toContain("Conector de carga");
    expect(t).toContain("TOTAL");
    expect(t).toContain("Testes na entrega");
    expect(doc.getNumberOfPages()).toBe(1);
  });
});

describe("PDF da OS: tabela do checklist", () => {
  it("junta entrada e saída por item, na ordem da tela, e ignora os não preenchidos", () => {
    const rows = checklistRows(
      { "Wi-Fi": "na", "Display / LCD": "defeito", "Câmera Frontal": "ok", "Lixo": 3 },
      { "Display / LCD": "ok", "Wi-Fi": "nao_testado", "Extra": "ok" },
    );
    expect(rows).toEqual([
      { item: "Câmera Frontal", entry: "ok", exit: null },
      { item: "Wi-Fi", entry: "na", exit: "na" },
      { item: "Display / LCD", entry: "defeito", exit: "ok" },
      { item: "Extra", entry: null, exit: "ok" },
    ]);
    expect(checklistCount(rows, "exit")).toEqual({ total: 3, ok: 2, defects: 0, untested: 1 });
    expect(checklistCount(rows, "entry")).toEqual({ total: 3, ok: 1, defects: 1, untested: 1 });
    expect(checklistRows(null, [1])).toEqual([]);
  });
});
