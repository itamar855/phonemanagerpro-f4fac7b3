import { describe, it, expect } from "vitest";
import { crmAccess } from "../lib/access";

describe("acesso ao CRM", () => {
  it("admin sempre entra", () => {
    expect(crmAccess("admin", { leads: false })).toBe("allowed");
    expect(crmAccess("admin", null)).toBe("allowed");
  });

  it("demais papéis só com a permissão CRM (chave leads) ligada", () => {
    expect(crmAccess("vendedor", { leads: true })).toBe("allowed");
    expect(crmAccess("gerente", { leads: true })).toBe("allowed");
    expect(crmAccess("vendedor", { leads: false })).toBe("denied");
    expect(crmAccess("tecnico", {})).toBe("denied");
    expect(crmAccess("tecnico", null)).toBe("denied");
  });

  it("perfil ainda carregando não nega acesso", () => {
    expect(crmAccess(null, null)).toBe("loading");
  });
});
