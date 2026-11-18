import { describe, expect, it } from "vitest";
import { leadKinds, NEUTRAL_TONE, ownerLabel, tagColorMap, tagKey, tagTone, visibleTags } from "../lib/labels";

describe("etiquetas do lead", () => {
  it("tipo do lead: Assistência/Venda pelo lead_kind e Cliente pelo cadastro", () => {
    expect(leadKinds({}).map((k) => k.label)).toEqual([]);
    expect(leadKinds({ lead_kind: "assistencia" }).map((k) => k.label)).toEqual(["Assistência"]);
    expect(leadKinds({ lead_kind: "venda", customer_id: "c1" }).map((k) => k.label)).toEqual(["Venda", "Cliente"]);
    expect(leadKinds({ lead_kind: "outra", customer_id: null }).map((k) => k.label)).toEqual([]);
    // fornecedor com cadastro de cliente: mostra só Fornecedor
    expect(leadKinds({ lead_kind: "fornecedor", customer_id: "c1" }).map((k) => k.label)).toEqual(["Fornecedor"]);
  });

  it("responsável: Você, primeiro nome, Colega ou sem responsável", () => {
    const names = new Map([["u1", "Thayna Souza"], ["u2", "  "]]);
    expect(ownerLabel(null, names, "u1")).toBeNull();
    expect(ownerLabel("u1", names, "u1")).toBe("Você");
    expect(ownerLabel("u1", names, "adm")).toBe("Thayna");
    expect(ownerLabel("u2", names, "adm")).toBe("Colega");
    expect(ownerLabel("u9", names, "adm")).toBe("Colega");
  });

  it("cor da etiqueta pela loja e nome (sem diferenciar maiúscula); digitada à mão fica neutra", () => {
    const map = tagColorMap([{ id: "1", store_id: "A", name: "Quente", color: "red" }, { id: "2", store_id: "B", name: "Quente", color: "blue" }]);
    expect(map.get(tagKey("A", "quente"))).toBe("red");
    expect(map.get(tagKey("B", "Quente "))).toBe("blue");
    expect(map.get(tagKey("A", "vip"))).toBeUndefined();
    expect(tagTone("red")).toContain("red");
    expect(tagTone(null)).toBe(NEUTRAL_TONE);
    expect(tagTone("roxo-inexistente")).toBe(NEUTRAL_TONE);
  });

  it("mostra até N etiquetas e conta o resto", () => {
    expect(visibleTags(["a", "b", "c", "d"], 2)).toEqual({ shown: ["a", "b"], more: 2 });
    expect(visibleTags(["a"], 2)).toEqual({ shown: ["a"], more: 0 });
  });
});
