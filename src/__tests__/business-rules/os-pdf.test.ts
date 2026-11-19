import { describe, expect, it } from "vitest";
import { checklistSummary, formatDay, hasChecklist, serviceBreakdown } from "@/components/features/os/osPdfRules";
import { generateOSPdf, generateThermalPdf } from "@/components/features/os/osPdf";

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

  it("sem peças: o serviço inteiro é uma linha com o valor final", () => {
    expect(serviceBreakdown({ final_price: 700, requested_service: "Outro" }, [])).toEqual({
      lines: [{ label: "Serviço", quantity: 1, total: 700 }], total: 700,
    });
  });

  it("peça com o valor cobrado; a diferença para o valor final vira mão de obra", () => {
    const r = serviceBreakdown({ final_price: 500, requested_service: "Troca de Tela" }, [tela]);
    expect(r.lines).toEqual([
      { label: "Tela Samsung A15 OLED", quantity: 1, total: 450 },
      { label: "Mão de obra - Troca de Tela", quantity: 1, total: 50 },
    ]);
    expect(r.total).toBe(500);
  });

  it("peça já com tudo incluído: sem linha de mão de obra", () => {
    expect(serviceBreakdown({ final_price: 450 }, [tela]).lines).toHaveLength(1);
  });

  it("valor final menor que as peças: mostra o desconto e o total é o valor final", () => {
    const r = serviceBreakdown({ final_price: 400 }, [tela]);
    expect(r.lines.at(-1)).toEqual({ label: "Desconto", quantity: 1, total: -50 });
    expect(r.total).toBe(400);
  });

  it("sem valor final: total é a soma das peças (quantidade conta)", () => {
    expect(serviceBreakdown({ final_price: null }, [{ ...tela, quantity: 2 }]).total).toBe(900);
    expect(serviceBreakdown({ final_price: 0 }, []).lines).toEqual([]);
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
    service_performed: "Limpeza da placa e troca do conector de carga",
    entry_checklist: { "Display / LCD": "defeito", "Wi-Fi": "na", "Botão Power": "ok" },
    exit_checklist: { "Display / LCD": "ok" },
    payment_pix: 700,
  };
  const textOf = (doc: any) => {
    const pages: string[] = doc.internal.pages.slice(1).map((p: string[]) => p.join("\n"));
    return pages.join("\n");
  };

  it("A4 traz observações de entrada, checklist, serviço executado, valor cobrado e garantia", async () => {
    const doc = await generateOSPdf(order, { name: "Loja" }, "Rafael", "https://x/os/1", [{ name: "Conector de carga", quantity: 1, unit_price: 150 }]);
    const t = textOf(doc);
    for (const s of ["SERVIÇO EXECUTADO", "Limpeza da placa", "Conector de carga", "150,00", "550,00", "Display / LCD", "Tela trincada", "19/12/2026", "TOTAL DO SERVIÇO", "Com defeito:"]) {
      expect(t, s).toContain(s);
    }
  });

  it("cupom 80mm traz as peças e o total", async () => {
    const doc = await generateThermalPdf(order, { name: "Loja" }, "Rafael", "https://x/os/1", [{ name: "Conector de carga", quantity: 1, unit_price: 150 }]);
    const t = textOf(doc);
    expect(t).toContain("Conector de carga");
    expect(t).toContain("TOTAL");
  });
});
