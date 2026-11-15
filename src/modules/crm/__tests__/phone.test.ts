import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, phoneKey, waMeLink } from "../lib/phone";

// Mesmos casos de crm_normalize_phone / crm_phone_key (src/__tests__/crm/crm-migrations.test.ts)
describe("telefone (gêmeo do SQL)", () => {
  it("normaliza formatos comuns", () => {
    expect(normalizePhone("5587999112233")).toBe("87999112233");
    expect(normalizePhone("(87) 99911-2233")).toBe("87999112233");
    expect(normalizePhone("087999112233")).toBe("87999112233");
    expect(normalizePhone("558799112233")).toBe("8799112233");
  });

  it("rejeita o que não é telefone", () => {
    expect(normalizePhone("120363012345678901")).toBeNull();
    expect(normalizePhone("558791234567-1600000000")).toBeNull();
    expect(normalizePhone("12345678")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("com e sem o 9º dígito geram a mesma chave", () => {
    expect(phoneKey("558799112233")).toBe(phoneKey("5587999112233"));
    expect(phoneKey("5587999112233")).toBe("8799112233");
  });

  it("formata para exibição e gera link do WhatsApp", () => {
    expect(formatPhone("5587999112233")).toBe("(87) 99911-2233");
    expect(formatPhone("558799112233")).toBe("(87) 9911-2233");
    expect(waMeLink("(87) 99911-2233", "Olá! ref IG-AB12")).toBe("https://wa.me/5587999112233?text=Ol%C3%A1!%20ref%20IG-AB12");
  });
});
