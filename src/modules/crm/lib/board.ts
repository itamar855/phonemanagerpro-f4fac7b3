// Regras puras do quadro (funil). Testadas em __tests__/board.test.ts.
import type { CrmStage } from "./types";

/** Posição de um cartão solto entre dois vizinhos (ordem crescente). */
export function positionBetween(before?: number | null, after?: number | null): number {
  const hasB = typeof before === "number" && Number.isFinite(before);
  const hasA = typeof after === "number" && Number.isFinite(after);
  if (hasB && hasA) return (before! + after!) / 2;
  if (hasB) return before! + 1;
  if (hasA) return after! - 1;
  return Date.now() / 1000;
}

export type Freshness = "ok" | "warn" | "late";

/** Tempo parado na etapa comparado ao prazo dela: verde < 50%, amarelo < 100%, vermelho acima. */
export function stageFreshness(stageEnteredAt: string, slaHours: number | null, now = Date.now()): Freshness {
  if (!slaHours || slaHours <= 0) return "ok";
  const hours = (now - new Date(stageEnteredAt).getTime()) / 3_600_000;
  if (hours >= slaHours) return "late";
  if (hours >= slaHours / 2) return "warn";
  return "ok";
}

export function daysInStage(stageEnteredAt: string, now = Date.now()): number {
  return Math.max(0, Math.floor((now - new Date(stageEnteredAt).getTime()) / 86_400_000));
}

/** Etapas que aparecem no quadro (ocultas ficam de fora), na ordem. */
export function visibleStages(stages: CrmStage[]): CrmStage[] {
  return stages.filter((s) => !s.hidden).sort((a, b) => a.position - b.position);
}
