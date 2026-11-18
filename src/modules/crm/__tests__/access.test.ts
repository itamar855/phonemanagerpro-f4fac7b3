import { describe, it, expect } from "vitest";
import { crmAccess, crmIsAdmin, crmTabVisible } from "../lib/access";

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

describe("abas do CRM só do admin", () => {
  it("Relatórios e Configurações só para o admin", () => {
    expect(crmTabVisible("/crm/relatorios", "admin")).toBe(true);
    expect(crmTabVisible("/crm/config", "admin")).toBe(true);
    for (const role of ["vendedor", "tecnico", "gerente", null]) {
      expect(crmTabVisible("/crm/relatorios", role)).toBe(false);
      expect(crmTabVisible("/crm/config", role)).toBe(false);
    }
  });

  it("as demais abas aparecem para todos", () => {
    for (const path of ["/crm/inbox", "/crm/funil", "/crm/contatos", "/crm/tarefas"]) {
      expect(crmTabVisible(path, "vendedor")).toBe(true);
      expect(crmTabVisible(path, "tecnico")).toBe(true);
    }
  });

  it("crmIsAdmin", () => {
    expect(crmIsAdmin("admin")).toBe(true);
    expect(crmIsAdmin("vendedor")).toBe(false);
    expect(crmIsAdmin(null)).toBe(false);
  });
});
