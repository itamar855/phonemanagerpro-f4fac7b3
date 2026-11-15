import { describe, expect, it } from "vitest";
import { daysInStage, positionBetween, stageFreshness, visibleStages } from "../lib/board";
import type { CrmStage } from "../lib/types";

describe("funil — posição ao soltar o cartão", () => {
  it("entre dois cartões fica no meio", () => expect(positionBetween(10, 20)).toBe(15));
  it("no fim da coluna fica depois do último", () => expect(positionBetween(10, null)).toBe(11));
  it("no topo fica antes do primeiro", () => expect(positionBetween(null, 10)).toBe(9));
  it("coluna vazia usa o horário atual", () => expect(positionBetween()).toBeGreaterThan(1_000_000_000));
});

describe("funil — tempo na etapa", () => {
  const now = new Date("2026-11-15T12:00:00Z").getTime();
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  it("sem prazo nunca atrasa", () => expect(stageFreshness(ago(500), null, now)).toBe("ok"));
  it("verde antes da metade do prazo", () => expect(stageFreshness(ago(5), 24, now)).toBe("ok"));
  it("amarelo depois da metade", () => expect(stageFreshness(ago(13), 24, now)).toBe("warn"));
  it("vermelho depois do prazo", () => expect(stageFreshness(ago(30), 24, now)).toBe("late"));
  it("dias inteiros na etapa", () => expect(daysInStage(ago(49), now)).toBe(2));
});

describe("funil — etapas visíveis", () => {
  it("esconde as ocultas e ordena", () => {
    const st = (code: string, position: number, hidden = false) => ({ id: code, code, position, hidden } as CrmStage);
    expect(visibleStages([st("won", 4), st("ig_new", 0, true), st("wa_active", 2), st("wa_invited", 1, true)]).map((s) => s.code))
      .toEqual(["wa_active", "won"]);
  });
});
