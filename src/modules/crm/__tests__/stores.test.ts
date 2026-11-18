import { describe, it, expect } from "vitest";
import { ALL, STORE_TONES, storeLabel, toCrmStores, validFilter } from "../lib/stores";
import { pickPipelineId } from "../lib/board";

describe("lojas no CRM", () => {
  it("nome curto da etiqueta", () => {
    expect(storeLabel("Restaura Phone Brasil (Santa Luzia)")).toBe("Santa Luzia");
    expect(storeLabel("Restaura Phone Brasil (Vila Eulalia) ")).toBe("Vila Eulalia");
    expect(storeLabel("Loja Centro")).toBe("Loja Centro");
    expect(storeLabel(null)).toBe("Loja");
  });

  it("cada loja tem sempre a mesma cor, pela ordem do nome", () => {
    const a = toCrmStores([{ id: "ve", name: "X (Vila Eulalia)" }, { id: "sl", name: "X (Santa Luzia)" }]);
    const b = toCrmStores([{ id: "sl", name: "X (Santa Luzia)" }, { id: "ve", name: "X (Vila Eulalia)" }]);
    expect(a).toEqual(b);
    expect(a.map((s) => s.label)).toEqual(["Santa Luzia", "Vila Eulalia"]);
    expect(a[0].tone).toBe(STORE_TONES[0]);
    expect(a[0].tone).not.toBe(a[1].tone);
  });

  it("filtro salvo de loja que não existe mais volta para todas", () => {
    const stores = toCrmStores([{ id: "sl", name: "Santa Luzia" }]);
    expect(validFilter(null, stores)).toBe(ALL);
    expect(validFilter("sl", stores)).toBe("sl");
    expect(validFilter("apagada", stores)).toBe(ALL);
  });
});

describe("funil aberto", () => {
  const pipes = [
    { id: "sl-v", store_id: "sl", is_default: true },
    { id: "ve-v", store_id: "ve", is_default: true },
    { id: "ve-a", store_id: "ve", is_default: false },
  ];
  it("prefere o padrão da loja da pessoa", () => {
    expect(pickPipelineId(pipes, null, "ve")).toBe("ve-v");
    expect(pickPipelineId(pipes, null, null)).toBe("sl-v");
  });
  it("usa o da URL só se ainda estiver na lista", () => {
    expect(pickPipelineId(pipes, "ve-a", "sl")).toBe("ve-a");
    expect(pickPipelineId(pipes, "sumiu", "ve")).toBe("ve-v");
    expect(pickPipelineId([], null, "ve")).toBeUndefined();
  });
});
