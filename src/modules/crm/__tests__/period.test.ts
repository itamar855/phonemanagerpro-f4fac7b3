import { describe, expect, it } from "vitest";
import { minutesLabel, pct, periodRange } from "../lib/period";

const now = new Date(2026, 10, 15, 10, 30); // 15/11/2026

describe("relatórios — períodos", () => {
  it("7 dias inclui hoje inteiro", () => {
    const r = periodRange("7d", now);
    expect(r.to).toEqual(new Date(2026, 10, 16));
    expect(r.from).toEqual(new Date(2026, 10, 9));
  });

  it("mês atual e mês passado", () => {
    expect(periodRange("month", now).from).toEqual(new Date(2026, 10, 1));
    const lm = periodRange("last_month", now);
    expect(lm.from).toEqual(new Date(2026, 9, 1));
    expect(lm.to).toEqual(new Date(2026, 10, 1));
  });

  it("percentual e tempo legível", () => {
    expect(pct(1, 4)).toBe(25);
    expect(pct(1, 0)).toBeNull();
    expect(minutesLabel(12.4)).toBe("12 min");
    expect(minutesLabel(90)).toBe("1,5 h");
    expect(minutesLabel(null)).toBe("—");
  });
});
