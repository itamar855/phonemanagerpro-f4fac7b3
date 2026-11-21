// Parte pura da IA que etiqueta o lead (sem rede nem banco): prompt, leitura da resposta e junção das etiquetas.
// Usada pelo ai-tagger.ts (Deno) e testada no Vitest.

export type LeadKind = "assistencia" | "venda" | "fornecedor";

/** Etiquetas de temperatura: o lead tem no máximo uma (a nova troca a antiga). */
export const TEMPERATURE_TAGS = ["quente", "morno", "frio"];

export interface TagDecision { lead_kind: LeadKind | null; tags: string[]; summary: string | null }

/** Tamanho máximo do resumo do cliente (cabe no painel e no prompt). */
export const SUMMARY_MAX = 600;

export const TAGGING_SCHEMA = {
  type: "OBJECT",
  properties: {
    lead_kind: { type: "STRING", enum: ["assistencia", "venda", "fornecedor", "desconhecido"] },
    tags: { type: "ARRAY", items: { type: "STRING" } },
    summary: { type: "STRING" },
  },
  required: ["lead_kind", "tags", "summary"],
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function taggingSystemPrompt(storeName: string, available: string[], current: { lead_kind: string | null; tags: string[]; summary?: string | null }): string {
  return [
    `Você classifica conversas de WhatsApp/Instagram da loja de celulares "${storeName}" (vende aparelhos e acessórios e faz assistência técnica).`,
    "Leia a conversa e devolva JSON com:",
    `- lead_kind: "assistencia" se a pessoa quer conserto/reparo/orçamento de reparo; "venda" se quer comprar aparelho ou acessório; "fornecedor" se é empresa ou vendedor que oferece/vende peças, aparelhos ou produtos PARA a loja (atacado, distribuidora, representante, laboratório parceiro); "desconhecido" se ainda não dá para saber.`,
    `- Fornecedor não leva etiqueta de temperatura nem de interesse de compra.`,
    `- tags: as etiquetas que se aplicam, escolhidas SOMENTE desta lista (escreva exatamente igual): ${available.map((t) => `"${t}"`).join(", ")}.`,
    "Regras das etiquetas:",
    "- Temperatura (use no máximo uma): Quente = quer fechar logo, pergunta preço/forma de pagamento/disponibilidade para hoje; Morno = interessado mas sem pressa; Frio = só curiosidade, sumiu ou disse que vai pensar.",
    "- Marque defeito, aparelho desejado, troca etc. somente quando a pessoa disser isso claramente.",
    "- \"Orçamento enviado\" só se a LOJA já passou um preço. \"Pós-venda\" só se a pessoa já comprou/consertou e fala depois disso.",
    "- Na dúvida, deixe de fora. Lista vazia é uma resposta válida.",
    "- summary: a MEMÓRIA deste cliente, lida pela equipe e pela IA antes de responder. De 1 a 4 frases curtas, só fatos da conversa:",
    "  quem é (se disse), o que quer, aparelho/modelo e defeito, valores ou prazos que a LOJA já passou, o que ficou combinado (ex.: \"vem sábado\", \"aguardando peça\") e o que está pendente.",
    "  Atualize o resumo anterior com o que for novo; mantenha o que continua valendo e corrija o que mudou. Não invente, não opine, sem saudações. Fornecedor: o que oferece/negocia com a loja.",
    `Resumo anterior: ${current.summary?.trim() || "nenhum"}.`,
    `Etiquetas atuais do lead: ${current.tags.length ? current.tags.join(", ") : "nenhuma"}. Tipo atual: ${current.lead_kind ?? "não definido"}.`,
    "A conversa vem a seguir: mensagens do cliente como 'user' e da loja como 'model'. Responda apenas o JSON.",
  ].join("\n");
}

/** Lê a resposta do modelo; só aceita etiquetas da lista (com a grafia da lista). */
export function parseTagging(raw: unknown, available: string[]): TagDecision {
  let o: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    try { o = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")); } catch { o = null; }
  } else if (raw && typeof raw === "object") o = raw as Record<string, unknown>;
  if (!o) return { lead_kind: null, tags: [], summary: null };
  const lead_kind = o.lead_kind === "assistencia" || o.lead_kind === "venda" || o.lead_kind === "fornecedor" ? o.lead_kind : null;
  const byNorm = new Map(available.map((t) => [norm(t), t]));
  const tags: string[] = [];
  for (const t of Array.isArray(o.tags) ? o.tags : []) {
    const hit = typeof t === "string" ? byNorm.get(norm(t)) : undefined;
    if (hit && !tags.includes(hit)) tags.push(hit);
  }
  // mais de uma temperatura: fica a primeira
  const temps = tags.filter((t) => TEMPERATURE_TAGS.includes(norm(t)));
  return { lead_kind, tags: temps.length > 1 ? tags.filter((t) => !temps.slice(1).includes(t)) : tags, summary: cleanSummary(o.summary) };
}

/** Resumo do modelo: texto limpo, sem "null"/vazio, cortado no limite. */
export function cleanSummary(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t || /^(null|nenhum|n\/a|-|desconhecido)\.?$/i.test(t)) return null;
  return t.length > SUMMARY_MAX ? `${t.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : t;
}

/**
 * Junta o que a IA sugeriu com o que o lead já tem:
 * - etiquetas existentes (inclusive as digitadas pela equipe) ficam;
 * - temperatura nova substitui a antiga;
 * - nada é duplicado (comparação sem acento/maiúscula).
 */
export function mergeTags(current: string[], suggested: string[]): string[] {
  const newTemp = suggested.find((t) => TEMPERATURE_TAGS.includes(norm(t)));
  const out = current.filter((t) => !(newTemp && TEMPERATURE_TAGS.includes(norm(t))));
  for (const t of suggested) if (!out.some((x) => norm(x) === norm(t))) out.push(t);
  return out;
}

export function sameTags(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}
