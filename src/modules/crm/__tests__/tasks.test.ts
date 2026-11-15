import { describe, expect, it } from "vitest";
import { dueLabel, duePresets, fromLocalInput, groupTasks, taskBucket, toLocalInput } from "../lib/tasks";

const now = new Date(2026, 10, 16, 10, 0); // seg 16/11/2026 10:00 (horário local)
const iso = (y: number, mo: number, d: number, h = 9, mi = 0) => new Date(y, mo, d, h, mi).toISOString();

describe("tarefas — prazos", () => {
  it("classifica por prazo", () => {
    expect(taskBucket(null, now)).toBe("none");
    expect(taskBucket(iso(2026, 10, 16, 9), now)).toBe("overdue");
    expect(taskBucket(iso(2026, 10, 16, 18), now)).toBe("today");
    expect(taskBucket(iso(2026, 10, 17, 8), now)).toBe("tomorrow");
    expect(taskBucket(iso(2026, 10, 23), now)).toBe("week");
    expect(taskBucket(iso(2026, 11, 1), now)).toBe("later");
  });

  it("agrupa na ordem: atrasadas, hoje, amanhã…, sem data por último", () => {
    const g = groupTasks([
      { id: 1, due_at: null },
      { id: 2, due_at: iso(2026, 10, 17) },
      { id: 3, due_at: iso(2026, 10, 15) },
      { id: 4, due_at: iso(2026, 10, 16, 15) },
    ], now);
    expect(g.map((x) => x.bucket)).toEqual(["overdue", "today", "tomorrow", "none"]);
  });

  it("atalhos sempre no futuro", () => {
    const p = duePresets(now);
    expect(p[0].label).toBe("Hoje 18h");
    const late = new Date(2026, 10, 16, 19, 30);
    expect(duePresets(late)[0].label).toBe("Em 1 hora");
    for (const x of [...p, ...duePresets(late)]) expect(x.date.getTime()).toBeGreaterThan(now.getTime());
  });

  it("converte de/para o campo de data e hora", () => {
    const v = toLocalInput(new Date(2026, 10, 17, 9, 5));
    expect(v).toBe("2026-11-17T09:05");
    expect(new Date(fromLocalInput(v)!).getHours()).toBe(9);
    expect(fromLocalInput("")).toBeNull();
  });

  it("texto curto do prazo", () => {
    expect(dueLabel(iso(2026, 10, 16, 18), now)).toBe("hoje 18:00");
    expect(dueLabel(iso(2026, 10, 17, 9), now)).toBe("amanhã 09:00");
    expect(dueLabel(iso(2026, 10, 15, 9), now)).toBe("ontem 09:00");
    expect(dueLabel(null, now)).toBe("sem data");
  });
});
