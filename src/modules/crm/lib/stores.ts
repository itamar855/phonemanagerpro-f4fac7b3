// Lojas no CRM: nome curto para a etiqueta e uma cor fixa por loja.

/** "Restaura Phone Brasil (Santa Luzia)" → "Santa Luzia"; sem parênteses, o nome como está. */
export function storeLabel(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  const inside = n.match(/\(([^)]+)\)\s*$/);
  return (inside?.[1] ?? n).trim() || "Loja";
}

// tons com texto legível no claro e no escuro (mesmo padrão da etiqueta "Veio do Instagram")
export const STORE_TONES = [
  "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "bg-violet-500/10 text-violet-700 dark:text-violet-300",
] as const;

export interface CrmStore {
  id: string;
  name: string;
  label: string;
  tone: string;
}

/** Ordem pelo nome curto e cor pela posição: a mesma loja tem sempre a mesma cor. */
export function toCrmStores(rows: { id: string; name: string | null }[]): CrmStore[] {
  return rows
    .map((r) => ({ id: r.id, name: r.name ?? "", label: storeLabel(r.name) }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"))
    .map((s, i) => ({ ...s, tone: STORE_TONES[i % STORE_TONES.length] }));
}

export const ALL = "all";

/** Filtro salvo vale só se a loja ainda existe; senão volta para "todas". */
export function validFilter(saved: string | null, stores: CrmStore[]): string {
  if (!saved || saved === ALL) return ALL;
  return stores.some((s) => s.id === saved) ? saved : ALL;
}
