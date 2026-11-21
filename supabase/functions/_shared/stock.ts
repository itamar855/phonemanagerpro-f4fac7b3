/* eslint-disable @typescript-eslint/no-explicit-any -- linhas do PostgREST sem tipos gerados */
// Carrega o estoque à venda (todas as unidades) para a IA do CRM. Só preço de venda: nunca custo, IMEI ou série.
import { groupDevices, selectStock, stockPromptLines, type StockItem } from "./stock-core.ts";

const shortStore = (name: string) => name.match(/\(([^)]+)\)\s*$/)?.[1] ?? name;

export async function loadStock(admin: any): Promise<StockItem[]> {
  const [{ data: stores }, { data: products, error: pErr }, { data: accessories, error: aErr }] = await Promise.all([
    admin.from("stores").select("id, name"),
    admin.from("products")
      .select("store_id, name, brand, model, color, capacity, battery_percentage, condition, sale_price, product_type")
      .eq("status", "in_stock").limit(1000),
    admin.from("accessories").select("store_id, name, brand, category, quantity, sale_price").gt("quantity", 0).limit(2000),
  ]);
  if (pErr || aErr) throw new Error((pErr ?? aErr).message);
  const storeName = new Map<string, string>((stores ?? []).map((s: any) => [s.id, shortStore(String(s.name))]));
  const items: StockItem[] = [];
  for (const p of products ?? []) {
    if (p.product_type === "peca") continue; // preço de peça não é preço de conserto
    items.push({
      kind: p.product_type === "acessorio" ? "accessory" : "device",
      name: String(p.name ?? "").trim() || [p.brand, p.model].filter(Boolean).join(" "),
      brand: p.brand, model: p.model, color: p.color, capacity: p.capacity, condition: p.condition,
      battery: p.battery_percentage, price: p.sale_price == null ? null : Number(p.sale_price), qty: 1,
      storeId: p.store_id, storeName: storeName.get(p.store_id) ?? "outra unidade",
    });
  }
  for (const a of accessories ?? []) {
    items.push({
      kind: "accessory", name: String(a.name ?? "").trim(), brand: a.brand, category: a.category,
      price: a.sale_price == null ? null : Number(a.sale_price), qty: Number(a.quantity) || 0,
      storeId: a.store_id, storeName: storeName.get(a.store_id) ?? "outra unidade",
    });
  }
  return groupDevices(items.filter((i) => i.name));
}

/** Estoque que tem a ver com a conversa, já em linhas para as instruções. Nunca lança (sem estoque = null). */
export async function stockForConversation(admin: any, storeId: string, storeName: string, text: string) {
  try {
    const items = await loadStock(admin);
    const sel = selectStock(items, text, storeId);
    return { lines: stockPromptLines(sel, shortStore(storeName)), count: sel.own.length + sel.others.length };
  } catch (e) {
    console.error("[stock]", (e as Error).message);
    return null;
  }
}
