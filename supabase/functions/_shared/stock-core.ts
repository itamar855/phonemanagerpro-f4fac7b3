// Estoque para a IA do CRM (parte pura, sem banco): escolhe os itens que têm a ver com a conversa
// e monta as linhas que entram nas instruções. Testado em src/__tests__/business-rules/crm-ai-stock.test.ts.
// Nunca leva custo, IMEI ou número de série; peças (product_type "peca") ficam de fora, porque preço de
// peça não é preço de conserto.

export interface StockItem {
  kind: "device" | "accessory";
  name: string;
  brand?: string | null;
  model?: string | null;
  color?: string | null;
  capacity?: string | null;
  condition?: string | null;
  battery?: number | null;
  category?: string | null;
  price: number | null;
  qty: number;
  storeId: string;
  storeName: string;
}

export interface StockSelection {
  /** Itens da loja da conversa */
  own: StockItem[];
  /** Itens das outras unidades */
  others: StockItem[];
  /** A pessoa perguntou de forma geral ("quais aparelhos vocês têm?") */
  generic: boolean;
}

const CONDITION_PT: Record<string, string> = {
  new: "novo", used: "usado", refurbished: "recondicionado", seminovo_americano: "seminovo (americano)",
};

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

// palavras que não ajudam a achar produto
const STOP = new Set(["oi", "ola", "bom", "boa", "dia", "tarde", "noite", "tudo", "bem", "voce", "voces", "vc", "vcs", "tem", "tem", "teria", "quero", "queria", "gostaria",
  "saber", "quanto", "qual", "quais", "valor", "preco", "custa", "fica", "sai", "esta", "estao", "de", "do", "da", "dos", "das", "pra", "para", "por", "com", "sem", "um", "uma",
  "o", "a", "os", "as", "e", "ou", "no", "na", "nos", "nas", "que", "se", "me", "meu", "minha", "ai", "aqui", "la", "ja", "mais", "menos", "ainda", "sim", "nao", "ok", "obrigado",
  "obrigada", "favor", "pode", "posso", "consegue", "manda", "mandar", "foto", "fotos", "loja", "hoje", "amanha", "agora", "isso", "esse", "essa", "dele", "dela", "algum", "alguma",
  "modelo", "cor", "gb", "reais", "r", "rs"]);
// mesma coisa escrita de outro jeito
const SYNONYM: Record<string, string> = {
  capinha: "capa", capinhas: "capa", capas: "capa", case: "capa", peliculas: "pelicula", pelicula: "pelicula", vidro: "pelicula",
  carregadores: "carregador", fonte: "carregador", cabos: "cabo", fones: "fone", headset: "fone", galaxy: "samsung", redmi: "xiaomi", poco: "xiaomi",
  moto: "motorola", iphones: "iphone", ip: "iphone", celulares: "celular",
};
// pergunta geral por aparelhos
const GENERIC_DEVICE = new Set(["aparelho", "aparelhos", "celular", "celulares", "smartphone", "smartphones", "seminovo", "seminovos", "usado", "usados", "novos"]);

function tokens(text: string): string[] {
  const out: string[] = [];
  for (const w of words(text)) {
    const t = SYNONYM[w] ?? w;
    if (STOP.has(t)) continue;
    if (t.length < 2 && !/\d/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Palavras do item: true = palavra inteira; false = pedaço de código ("s13" → "13"), que vale menos. */
function hay(i: StockItem): Map<string, boolean> {
  const ws = words([i.name, i.brand, i.model, i.color, i.capacity, i.category].filter(Boolean).join(" "));
  const map = new Map<string, boolean>();
  for (const w of ws) {
    map.set(w, true);
    if (SYNONYM[w]) map.set(SYNONYM[w], true);
    const split = w.match(/^([a-z]+)(\d+)$/); // "a54" também vale "a 54"
    if (split) for (const part of [split[1], split[2]]) if (!map.has(part)) map.set(part, false);
  }
  return map;
}

/** Quanto o item tem a ver com o que a pessoa escreveu (0 = nada). Número de modelo pesa mais. */
export function stockScore(item: StockItem, query: string[]): number {
  const h = hay(item);
  let score = 0;
  for (const t of query) {
    const whole = h.get(t);
    if (whole === true) score += /\d/.test(t) ? 2 : 1;
    else if (whole === false) score += 0.5;
    else if (t.length >= 4 && [...h.keys()].some((w) => w.length >= 4 && (w.startsWith(t) || t.startsWith(w)))) score += 0.5;
  }
  return score;
}

/**
 * Escolhe o que entra nas instruções: itens da loja que batem com a conversa (até ownLimit) e das outras
 * unidades (até otherLimit). Pergunta geral por aparelho sem modelo: lista os aparelhos da loja.
 */
export function selectStock(items: StockItem[], text: string, storeId: string, opts: { ownLimit?: number; otherLimit?: number } = {}): StockSelection {
  const ownLimit = opts.ownLimit ?? 15, otherLimit = opts.otherLimit ?? 6;
  const query = tokens(text);
  const scored = items.map((i) => ({ i, s: query.length ? stockScore(i, query) : 0 })).filter((x) => x.s > 0);
  // fica com os mais parecidos: metade da melhor nota para cima (evita listar tudo que tem "iphone" quando pediu "iphone 13")
  const best = Math.max(0, ...scored.map((x) => x.s));
  const strong = scored.filter((x) => x.s >= Math.max(1, best / 2));
  const order = (a: { i: StockItem; s: number }, b: { i: StockItem; s: number }) => b.s - a.s || (a.i.price ?? 1e9) - (b.i.price ?? 1e9);
  let own = strong.filter((x) => x.i.storeId === storeId).sort(order).map((x) => x.i);
  const others = strong.filter((x) => x.i.storeId !== storeId).sort(order).map((x) => x.i).slice(0, otherLimit);
  const generic = query.some((t) => GENERIC_DEVICE.has(t));
  if (generic && own.filter((i) => i.kind === "device").length === 0) {
    own = [...own, ...items.filter((i) => i.storeId === storeId && i.kind === "device").sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9))];
  }
  return { own: dedupe(own).slice(0, ownLimit), others: dedupe(others), generic };
}

function dedupe(list: StockItem[]): StockItem[] {
  const seen = new Set<StockItem>();
  return list.filter((i) => (seen.has(i) ? false : (seen.add(i), true)));
}

const brl = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
// "IPHONE 13 PRO MAX 128GB" → "Iphone 13 Pro Max 128GB" (palavras com número ficam como estão)
const titleCase = (s: string) => (s === s.toUpperCase()
  ? s.split(/(\s+)/).map((w) => (/\d/.test(w) ? w : w.toLowerCase().replace(/^\p{L}/u, (m) => m.toUpperCase()))).join("")
  : s);

/** Uma linha por item, sem custo nem identificação do aparelho. */
export function stockLine(i: StockItem, withStore = false): string {
  const name = titleCase(i.name.trim());
  const nameWords = new Set(words(name));
  const extra = [i.capacity, i.color].filter((x): x is string => Boolean(x && x.trim()) && !words(x!).every((w) => nameWords.has(w))).map((x) => titleCase(x.trim()));
  const label = [name, ...extra].join(" ");
  const details: string[] = [];
  if (i.kind === "device") {
    if (i.condition) details.push(CONDITION_PT[i.condition] ?? i.condition);
    if (i.battery != null && i.battery > 0) details.push(`bateria ${i.battery}%`);
  }
  const price = i.price && i.price > 0 ? brl(i.price) : "preço a confirmar com vendas";
  const qty = i.kind === "accessory" ? ` · ${i.qty} em estoque` : i.qty > 1 ? ` · ${i.qty} unidades` : "";
  return `- ${withStore ? `[${i.storeName}] ` : ""}${label}${details.length ? ` (${details.join(", ")})` : ""} · ${price}${qty}`;
}

/** Junta aparelhos iguais (mesmo nome, capacidade, cor, estado e preço) numa linha só. */
export function groupDevices(items: StockItem[]): StockItem[] {
  const map = new Map<string, StockItem>();
  for (const i of items) {
    if (i.kind !== "device") { map.set(`${map.size}-acc`, i); continue; }
    const key = [i.storeId, fold(i.name), i.capacity, i.color, i.condition, i.price, i.battery].join("|");
    const prev = map.get(key);
    if (prev) prev.qty += i.qty; else map.set(key, { ...i });
  }
  return [...map.values()];
}

/** Texto usado para procurar no estoque: o que o cliente escreveu por último (áudio transcrito conta) + a memória dele. */
export function stockQueryText(messages: { direction: string; kind: string; body: string | null; transcript?: string | null }[], memory?: string | null): string {
  const said = messages.filter((m) => m.direction === "in")
    .map((m) => (m.kind === "audio" ? m.transcript : m.body) ?? "").filter(Boolean).slice(-5);
  return [...said, memory ?? ""].join(" ").replace(/\[[^\]]*\]/g, " ").slice(-1500);
}

/** Blocos de texto do estoque para as instruções da IA. */
export function stockPromptLines(sel: StockSelection, storeName: string): string[] {
  const lines: string[] = [];
  if (sel.own.length) {
    lines.push(`Na ${storeName}:`);
    for (const i of sel.own) lines.push(stockLine(i));
  } else {
    lines.push(sel.others.length
      ? `Na ${storeName}: nada parecido nesta unidade agora. Ofereça o que tem na outra unidade (abaixo), com o preço (reply), e diga que o pessoal confirma se chega aqui; não afirme que não tem nesta unidade.`
      : `Na ${storeName}: nenhum item do estoque parece com o que a pessoa pediu (pode ser só a forma de escrever). Não afirme que não tem: diga que o pessoal confirma.`);
  }
  if (sel.others.length) {
    lines.push("Em outra unidade da loja (pode ser transferido ou a pessoa pode retirar lá):");
    for (const i of sel.others) lines.push(stockLine(i, true));
  }
  return lines;
}
