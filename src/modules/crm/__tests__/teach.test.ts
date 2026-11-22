import { describe, expect, it } from "vitest";
import { appendRule, teachQuestion } from "../lib/teach";

const m = (id: string, direction: "in" | "out", body: string, extra: Partial<{ kind: string; sender_kind: string; transcript: string }> = {}) =>
  ({ id, direction, body, kind: extra.kind ?? "text", sender_kind: extra.sender_kind ?? (direction === "in" ? "contact" : "ai"), transcript: extra.transcript ?? null }) as never;

describe("Ensinar a IA", () => {
  it("pega o que o cliente disse logo antes da resposta da IA", () => {
    const msgs = [
      m("1", "in", "Oi"),
      m("2", "out", "Opa, tudo bem?"),
      m("3", "in", "Meu Poco X6 Pro entrou líquido"),
      m("4", "in", "[Imagem]", { kind: "image" }),
      m("5", "in", "[Áudio]", { kind: "audio", transcript: "a tela parou" }),
      m("6", "out", "Beleza! Já deixei avisado"),
    ];
    expect(teachQuestion(msgs, "6")).toBe("Meu Poco X6 Pro entrou líquido\na tela parou");
    expect(teachQuestion(msgs, "2")).toBe("Oi");
    expect(teachQuestion(msgs, "1")).toBe("");
    expect(teachQuestion(msgs, "x")).toBe("");
  });

  it("nota interna no meio não corta o que o cliente disse", () => {
    const msgs = [m("1", "in", "Quanto a tela?"), m("2", "out", "anotação", { kind: "note", sender_kind: "user" }), m("3", "out", "Vou ver")];
    expect(teachQuestion(msgs, "3")).toBe("Quanto a tela?");
  });

  it("acrescenta a regra no fim do conhecimento, sem repetir", () => {
    expect(appendRule(null, "Não trocamos bateria de Apple Watch")).toBe("- Não trocamos bateria de Apple Watch");
    expect(appendRule("Endereço: Rua A\n", " - Não trocamos  bateria de Apple Watch ")).toBe("Endereço: Rua A\n- Não trocamos bateria de Apple Watch");
    expect(appendRule("- Não trocamos bateria de Apple Watch", "não trocamos bateria de apple watch")).toBe("- Não trocamos bateria de Apple Watch");
    expect(appendRule("x", "   ")).toBe("x");
  });
});
