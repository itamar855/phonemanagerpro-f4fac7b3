// Lista de preços colada pelo gerente (do WhatsApp, Excel ou bloco de notas).
// Uma linha por aparelho: "Marca; Modelo; Capacidade; Valor" (ou sem a marca, ou separado por tab).
import type { TradeModel } from "./types";

export interface PriceRow {
  brand: string;
  model: string;
  storage: string;
  base_price: number;
}

export interface ParsedList {
  rows: PriceRow[];
  /** linhas ignoradas (número da linha + motivo) */
  skipped: { line: number; reason: string }[];
}

/** "R$ 1.500,00" / "1500" / "1.500" / "1500.50" → número; inválido → null. */
export function parseMoney(raw: string): number | null {
  let s = (raw ?? "").replace(/r\$/gi, "").replace(/\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** "128" / "128gb" / "1tb" / "1 TB" → "128 GB" / "1 TB"; texto livre fica como está. */
export function normalizeStorage(raw: string): string {
  const s = (raw ?? "").trim();
  const m = s.match(/^(\d+)\s*(gb|g|tb|t)?$/i);
  if (!m) return s.slice(0, 20);
  const unit = m[2]?.toLowerCase().startsWith("t") ? "TB" : "GB";
  return `${Number(m[1])} ${unit}`;
}

/** Marca a partir do nome do modelo, quando a linha não traz a marca. */
export function guessBrand(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("iphone")) return "Apple";
  if (m.includes("galaxy") || m.startsWith("samsung")) return "Samsung";
  if (/(redmi|poco|xiaomi|\bmi\s?\d)/.test(m)) return "Xiaomi";
  if (m.startsWith("moto") || m.includes("motorola")) return "Motorola";
  return "Outro";
}

export function parsePriceList(text: string): ParsedList {
  const rows: PriceRow[] = [];
  const skipped: ParsedList["skipped"] = [];
  const seen = new Map<string, number>();

  (text ?? "").split(/\r?\n/).forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(line.includes("\t") ? "\t" : ";").map((p) => p.trim());
    let brand: string, model: string, storage: string, price: string;
    if (parts.length >= 4) [brand, model, storage, price] = parts;
    else if (parts.length === 3) { [model, storage, price] = parts; brand = guessBrand(model); }
    else { skipped.push({ line: i + 1, reason: "use Marca; Modelo; Capacidade; Valor" }); return; }

    if (!model) { skipped.push({ line: i + 1, reason: "sem modelo" }); return; }
    const value = parseMoney(price);
    if (value === null) { skipped.push({ line: i + 1, reason: price ? "valor inválido" : "sem valor" }); return; }

    const row: PriceRow = {
      brand: (brand || guessBrand(model)).slice(0, 40),
      model: model.slice(0, 80),
      storage: normalizeStorage(storage),
      base_price: value,
    };
    const key = modelKey(row);
    if (seen.has(key)) rows[seen.get(key)!] = row; // repetido: vale a última linha
    else { seen.set(key, rows.length); rows.push(row); }
  });
  return { rows, skipped };
}

/** Mesma chave do índice único do banco (marca/modelo/capacidade, sem maiúsculas e espaços nas pontas). */
export function modelKey(m: Pick<TradeModel, "brand" | "model" | "storage">): string {
  return [m.brand, m.model, m.storage].map((s) => (s ?? "").trim().toLowerCase()).join("|");
}

/** Separa o que é novo do que só muda o preço, comparando com a tabela atual da loja. */
export function planUpsert(rows: PriceRow[], existing: TradeModel[]) {
  const byKey = new Map(existing.map((m) => [modelKey(m), m]));
  const inserts: PriceRow[] = [];
  const updates: { id: string; base_price: number }[] = [];
  for (const r of rows) {
    const found = byKey.get(modelKey(r));
    if (!found) inserts.push(r);
    else if (Number(found.base_price) !== r.base_price || !found.active) updates.push({ id: found.id, base_price: r.base_price });
  }
  return { inserts, updates };
}

// Modelos de iPhone mais comuns na troca, com as capacidades de cada um (o gerente só preenche o valor).
/** iPhones que a loja costuma pegar na troca (do 8 ao 17), com as capacidades de cada um. */
export const IPHONES: [string, string[]][] = [
  ["iPhone 8", ["64", "128", "256"]],
  ["iPhone 8 Plus", ["64", "128", "256"]],
  ["iPhone X", ["64", "256"]],
  ["iPhone XR", ["64", "128", "256"]],
  ["iPhone XS", ["64", "256", "512"]],
  ["iPhone XS Max", ["64", "256", "512"]],
  ["iPhone 11", ["64", "128", "256"]],
  ["iPhone 11 Pro", ["64", "256", "512"]],
  ["iPhone 11 Pro Max", ["64", "256", "512"]],
  ["iPhone SE (2ª geração)", ["64", "128", "256"]],
  ["iPhone SE (3ª geração)", ["64", "128", "256"]],
  ["iPhone 12 mini", ["64", "128", "256"]],
  ["iPhone 12", ["64", "128", "256"]],
  ["iPhone 12 Pro", ["128", "256", "512"]],
  ["iPhone 12 Pro Max", ["128", "256", "512"]],
  ["iPhone 13 mini", ["128", "256", "512"]],
  ["iPhone 13", ["128", "256", "512"]],
  ["iPhone 13 Pro", ["128", "256", "512", "1tb"]],
  ["iPhone 13 Pro Max", ["128", "256", "512", "1tb"]],
  ["iPhone 14", ["128", "256", "512"]],
  ["iPhone 14 Plus", ["128", "256", "512"]],
  ["iPhone 14 Pro", ["128", "256", "512", "1tb"]],
  ["iPhone 14 Pro Max", ["128", "256", "512", "1tb"]],
  ["iPhone 15", ["128", "256", "512"]],
  ["iPhone 15 Plus", ["128", "256", "512"]],
  ["iPhone 15 Pro", ["128", "256", "512", "1tb"]],
  ["iPhone 15 Pro Max", ["256", "512", "1tb"]],
  ["iPhone 16e", ["128", "256", "512"]],
  ["iPhone 16", ["128", "256", "512"]],
  ["iPhone 16 Plus", ["128", "256", "512"]],
  ["iPhone 16 Pro", ["128", "256", "512", "1tb"]],
  ["iPhone 16 Pro Max", ["256", "512", "1tb"]],
  ["iPhone 17", ["256", "512"]],
  ["iPhone Air", ["256", "512", "1tb"]],
  ["iPhone 17 Pro", ["256", "512", "1tb"]],
  ["iPhone 17 Pro Max", ["256", "512", "1tb", "2tb"]],
];

/** Texto pronto para colar: uma linha por modelo/capacidade, com o valor em branco. */
export function iphoneTemplate(existing: TradeModel[] = []): string {
  const have = new Set(existing.map(modelKey));
  const lines: string[] = [];
  for (const [model, caps] of IPHONES) {
    for (const c of caps) {
      const storage = normalizeStorage(c);
      if (!have.has(modelKey({ brand: "Apple", model, storage }))) lines.push(`Apple; ${model}; ${storage}; `);
    }
  }
  return lines.join("\n");
}
