import { describe, expect, it } from "vitest";
import { isConsultOnly, matchesStock, splitStock, type ConsultaProduct } from "@/components/features/estoque/consultaRules";

const p = (o: Partial<ConsultaProduct>): ConsultaProduct => ({
  id: "x", name: "iPhone 13", brand: "Apple", model: "A2633", color: "Azul", capacity: "128GB",
  battery_percentage: 88, condition: "used", sale_price: 3000, product_type: "celular", ...o,
});

describe("estoque de outra loja (só consulta)", () => {
  it("só consulta quando a loja não é da pessoa; admin e a própria loja editam", () => {
    expect(isConsultOnly("VE", ["SL"], false)).toBe(true);
    expect(isConsultOnly("SL", ["SL"], false)).toBe(false);
    expect(isConsultOnly("VE", [], true)).toBe(false);
    expect(isConsultOnly("all", ["SL"], false)).toBe(false);
    expect(isConsultOnly(null, ["SL"], false)).toBe(false);
  });

  it("separa aparelhos de peças/acessórios cadastrados como produto", () => {
    const { devices, parts } = splitStock([p({ id: "1" }), p({ id: "2", product_type: "peca" }), p({ id: "3", product_type: null }), p({ id: "4", product_type: "acessorio" })]);
    expect(devices.map((d) => d.id)).toEqual(["1", "3"]);
    expect(parts.map((d) => d.id)).toEqual(["2", "4"]);
  });

  it("busca por várias palavras, sem acento nem maiúscula", () => {
    expect(matchesStock(p({}), "")).toBe(true);
    expect(matchesStock(p({}), "iphone 128")).toBe(true);
    expect(matchesStock(p({}), "IPHONE azul")).toBe(true);
    expect(matchesStock(p({}), "iphone 256")).toBe(false);
    expect(matchesStock({ name: "Película de vidro" }, "pelicula")).toBe(true);
  });
});
