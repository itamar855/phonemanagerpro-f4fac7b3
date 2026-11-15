import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

export const brl = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v) || 0);

/** Horário curto para a lista de conversas: 14:32 · Ontem · seg · 12/11 */
export function shortTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Ontem";
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, "EEE", { locale: ptBR });
  return format(d, "dd/MM");
}

export const relative = (iso: string | null | undefined) =>
  iso ? formatDistanceToNowStrict(new Date(iso), { locale: ptBR, addSuffix: true }) : "";

export const dayLabel = (iso: string) => {
  const d = new Date(iso);
  if (isToday(d)) return "Hoje";
  if (isYesterday(d)) return "Ontem";
  return format(d, "EEEE, dd 'de' MMMM", { locale: ptBR });
};

export const initials = (name: string | null | undefined) =>
  String(name ?? "?")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
