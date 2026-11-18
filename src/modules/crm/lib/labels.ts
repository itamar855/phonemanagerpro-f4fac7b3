// Etiquetas do lead: cores das etiquetas, tipo do lead (Assistência / Venda / Cliente) e nome do responsável.

export type LeadKind = "assistencia" | "venda" | "fornecedor";

/** Chave de cor gravada em crm_tags.color → classes com texto legível no claro e no escuro. */
export const TAG_TONES: Record<string, string> = {
  red: "bg-red-500/10 text-red-700 dark:text-red-300",
  orange: "bg-orange-500/10 text-orange-700 dark:text-orange-300",
  amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  lime: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
  emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cyan: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300",
  blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  indigo: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  pink: "bg-pink-500/10 text-pink-700 dark:text-pink-300",
  rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  slate: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};
export const TAG_COLOR_KEYS = Object.keys(TAG_TONES);
export const NEUTRAL_TONE = "bg-muted text-muted-foreground";

/** Bolinha da cor (para o seletor de cores e a legenda). */
export const TAG_DOTS: Record<string, string> = {
  red: "bg-red-500", orange: "bg-orange-500", amber: "bg-amber-500", lime: "bg-lime-500", emerald: "bg-emerald-500", cyan: "bg-cyan-500",
  blue: "bg-blue-500", indigo: "bg-indigo-500", violet: "bg-violet-500", pink: "bg-pink-500", rose: "bg-rose-500", slate: "bg-slate-500",
};

export function tagTone(color: string | null | undefined): string {
  return (color && TAG_TONES[color]) || NEUTRAL_TONE;
}

export interface CrmTag { id: string; store_id: string; name: string; color: string | null }

export const tagKey = (storeId: string, name: string) => `${storeId}:${name.trim().toLowerCase()}`;

/** Mapa loja+nome → cor, para pintar as etiquetas do contato. Etiqueta digitada à mão fica neutra. */
export function tagColorMap(tags: CrmTag[]): Map<string, string | null> {
  return new Map(tags.map((t) => [tagKey(t.store_id, t.name), t.color]));
}

export type KindId = "assistencia" | "venda" | "fornecedor" | "cliente";
export interface KindChip { id: KindId; label: string; tone: string }

export const KIND_CHIPS: Record<KindId, KindChip> = {
  // tipo do lead = contorno + ícone; etiquetas = preenchidas. Assim não se confundem mesmo com cores parecidas.
  assistencia: { id: "assistencia", label: "Assistência", tone: "border border-orange-500/50 text-orange-700 dark:text-orange-300" },
  venda: { id: "venda", label: "Venda", tone: "border border-sky-500/50 text-sky-700 dark:text-sky-300" },
  fornecedor: { id: "fornecedor", label: "Fornecedor", tone: "border border-slate-500/60 bg-slate-500/10 text-slate-700 dark:text-slate-200" },
  cliente: { id: "cliente", label: "Cliente", tone: "border border-emerald-500/50 text-emerald-700 dark:text-emerald-300" },
};

/** Tipo do lead: Assistência, Venda ou Fornecedor (funil / IA / equipe) e Cliente (já tem cadastro). Pode ter dois. */
export function leadKinds(contact: { lead_kind?: string | null; customer_id?: string | null }): KindChip[] {
  const out: KindChip[] = [];
  const k = contact.lead_kind;
  if (k === "assistencia" || k === "venda" || k === "fornecedor") out.push(KIND_CHIPS[k]);
  if (contact.customer_id && k !== "fornecedor") out.push(KIND_CHIPS.cliente);
  return out;
}

/** Nome curto do responsável: "Você", o primeiro nome, ou null quando não há responsável. */
export function ownerLabel(ownerId: string | null | undefined, names: Map<string, string>, userId: string | null | undefined): string | null {
  if (!ownerId) return null;
  if (ownerId === userId) return "Você";
  const full = names.get(ownerId)?.trim();
  return full ? full.split(/\s+/)[0] : "Colega";
}

/** Separa as etiquetas que cabem na linha e quantas sobram ("+N"). */
export function visibleTags(tags: string[], max: number): { shown: string[]; more: number } {
  return { shown: tags.slice(0, max), more: Math.max(0, tags.length - max) };
}
