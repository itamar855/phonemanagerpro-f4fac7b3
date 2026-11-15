import { describe, expect, it } from "vitest";
import { DEFAULT_IG_MESSAGE, extractName, extractPhone, extractUsername, fillTemplate } from "../lib/igLead";

describe("lead do Instagram — texto colado da DM", () => {
  it("acha o WhatsApp em vários formatos", () => {
    expect(extractPhone("pode chamar no 87 99911-2233 por favor")).toBe("87999112233");
    expect(extractPhone("meu zap (81)98877-6655")).toBe("81988776655");
    expect(extractPhone("+55 11 91234-5678")).toBe("11912345678");
    expect(extractPhone("87999112233")).toBe("87999112233");
    expect(extractPhone("tela custa 350 reais, modelo A54")).toBeNull();
  });

  it("acha @ e nome quando a pessoa se apresenta", () => {
    expect(extractUsername("Conversa com @Bruna.Lima ontem")).toBe("bruna.lima");
    expect(extractName("oi, meu nome é ana souza, quero orçamento")).toBe("Ana Souza");
    expect(extractName("aqui é o carlos")).toBe("Carlos");
    expect(extractName("quanto custa?")).toBeNull();
  });
});

describe("lead do Instagram — mensagem modelo", () => {
  it("usa o primeiro nome, a loja e o assunto", () => {
    expect(fillTemplate(DEFAULT_IG_MESSAGE, { name: "Bruna Lima", store: "Restaura Phone", subject: "Troca de tela do iPhone 12" }))
      .toBe("Oi Bruna! Aqui é a Restaura Phone, você falou com a gente no Instagram sobre troca de tela do iPhone 12 😊 Posso te ajudar por aqui?");
  });

  it("sem nome e sem assunto continua natural", () => {
    expect(fillTemplate(DEFAULT_IG_MESSAGE, { name: "+55 81988776655", store: "Restaura Phone", subject: null }))
      .toBe("Oi! Aqui é a Restaura Phone, você falou com a gente no Instagram 😊 Posso te ajudar por aqui?");
  });
});
