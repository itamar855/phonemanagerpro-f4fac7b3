// Regras puras das tarefas (agrupamento por prazo e atalhos de data).
import { addDays, differenceInCalendarDays, format, setHours, setMinutes, startOfDay } from "date-fns";

export type TaskBucket = "overdue" | "today" | "tomorrow" | "week" | "later" | "none";

export const BUCKET_LABEL: Record<TaskBucket, string> = {
  overdue: "Atrasadas",
  today: "Hoje",
  tomorrow: "Amanhã",
  week: "Próximos 7 dias",
  later: "Mais tarde",
  none: "Sem data",
};

export const BUCKET_ORDER: TaskBucket[] = ["overdue", "today", "tomorrow", "week", "later", "none"];

export function taskBucket(dueIso: string | null | undefined, now = new Date()): TaskBucket {
  if (!dueIso) return "none";
  const due = new Date(dueIso);
  if (due.getTime() < now.getTime()) return "overdue";
  const days = differenceInCalendarDays(due, now);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  if (days <= 7) return "week";
  return "later";
}

/** Agrupa mantendo a ordem de entrada dentro de cada grupo. */
export function groupTasks<T extends { due_at: string | null }>(tasks: T[], now = new Date()) {
  const groups = new Map<TaskBucket, T[]>();
  for (const t of tasks) {
    const b = taskBucket(t.due_at, now);
    groups.set(b, [...(groups.get(b) ?? []), t]);
  }
  return BUCKET_ORDER.filter((b) => groups.has(b)).map((b) => ({ bucket: b, tasks: groups.get(b)! }));
}

const at = (d: Date, h: number, m = 0) => setMinutes(setHours(startOfDay(d), h), m);

/** Atalhos de prazo, sempre no futuro. */
export function duePresets(now = new Date()): { label: string; date: Date }[] {
  const out: { label: string; date: Date }[] = [];
  if (now.getHours() < 17) out.push({ label: "Hoje 18h", date: at(now, 18) });
  else out.push({ label: "Em 1 hora", date: new Date(now.getTime() + 3600_000) });
  out.push({ label: "Amanhã 9h", date: at(addDays(now, 1), 9) });
  out.push({ label: "Em 3 dias", date: at(addDays(now, 3), 9) });
  out.push({ label: "Em 1 semana", date: at(addDays(now, 7), 9) });
  return out;
}

/** Date → valor de <input type="datetime-local"> (horário local). */
export const toLocalInput = (d: Date | string | null | undefined) => (d ? format(new Date(d), "yyyy-MM-dd'T'HH:mm") : "");

/** Valor de <input type="datetime-local"> → ISO (ou null). */
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

/** Texto curto do prazo: "hoje 18:00", "amanhã 09:00", "seg 09:00", "12/11 09:00". */
export function dueLabel(dueIso: string | null | undefined, now = new Date()): string {
  if (!dueIso) return "sem data";
  const d = new Date(dueIso);
  const days = differenceInCalendarDays(d, now);
  const hm = format(d, "HH:mm");
  if (days === 0) return `hoje ${hm}`;
  if (days === 1) return `amanhã ${hm}`;
  if (days === -1) return `ontem ${hm}`;
  return format(d, "dd/MM HH:mm");
}
