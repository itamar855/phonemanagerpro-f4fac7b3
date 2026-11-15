// Períodos dos relatórios: sempre [início, fim) em horário local.
import { addDays, startOfDay, startOfMonth, subMonths } from "date-fns";

export type PeriodKey = "7d" | "30d" | "90d" | "month" | "last_month";

export const PERIOD_LABEL: Record<PeriodKey, string> = {
  "7d": "7 dias",
  "30d": "30 dias",
  "90d": "90 dias",
  month: "Este mês",
  last_month: "Mês passado",
};

export function periodRange(key: PeriodKey, now = new Date()): { from: Date; to: Date } {
  const tomorrow = startOfDay(addDays(now, 1));
  switch (key) {
    case "7d": return { from: addDays(tomorrow, -7), to: tomorrow };
    case "30d": return { from: addDays(tomorrow, -30), to: tomorrow };
    case "90d": return { from: addDays(tomorrow, -90), to: tomorrow };
    case "month": return { from: startOfMonth(now), to: tomorrow };
    case "last_month": return { from: startOfMonth(subMonths(now, 1)), to: startOfMonth(now) };
  }
}

/** Percentual inteiro, ou null quando não há base. */
export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : null);

/** "45 min", "2,5 h", "1,2 dia" */
export function minutesLabel(min: number | null | undefined): string {
  if (min === null || min === undefined) return "—";
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 60 * 24) return `${(min / 60).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} h`;
  return `${(min / 1440).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dia(s)`;
}
