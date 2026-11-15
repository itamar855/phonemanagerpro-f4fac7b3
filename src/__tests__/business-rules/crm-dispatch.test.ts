import { describe, expect, it } from "vitest";
import { formatPhone, noticeText, type DispatchNotice } from "../../../supabase/functions/_shared/dispatch-core";

const base: DispatchNotice = {
  id: "d1", kind: "offered", store_id: "s1", conversation_id: "c1", staff_phone: "5587988776655", staff_name: "João Pedro",
  minutes: 5, contact_name: "Maria Silva", contact_phone: "5587999112233", deal_title: "Troca de tela A54", summary: "Tela quebrada, quer pra hoje.",
};

describe("distribuição — aviso no WhatsApp da equipe", () => {
  it("formata o telefone do cliente", () => {
    expect(formatPhone("5587999112233")).toBe("(87) 99911-2233");
    expect(formatPhone("558799112233")).toBe("(87) 9911-2233");
    expect(formatPhone(null)).toBe("");
  });

  it("aviso de vez: quem é, o que quer, prazo e link da conversa", () => {
    const t = noticeText(base, "https://app.test/");
    expect(t).toMatch(/^🔔 \*Novo atendimento pra você\*, João!/);
    expect(t).toContain("👤 Maria Silva · (87) 99911-2233");
    expect(t).toContain("📝 Troca de tela A54\nTela quebrada, quer pra hoje.");
    expect(t).toContain("Assuma em até 5 min: https://app.test/crm/inbox/c1");
    expect(t).not.toMatch(/\n{3,}/);
  });

  it("ninguém assumiu: avisa o dono sem prazo", () => {
    const t = noticeText({ ...base, kind: "owner", deal_title: null, summary: null, contact_name: null }, "https://app.test");
    expect(t).toMatch(/^⚠️ \*Ninguém assumiu este atendimento\*, João\. Ficou com você\./);
    expect(t).toContain("👤 Cliente · (87) 99911-2233");
    expect(t).not.toContain("Assuma em até");
    expect(t).not.toMatch(/\n{3,}/);
  });
});
