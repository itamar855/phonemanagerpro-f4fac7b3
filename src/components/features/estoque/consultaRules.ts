// Regras puras da consulta ao estoque de outra loja (testadas no Vitest).

export interface ConsultaProduct {
  id: string; name: string; brand: string | null; model: string | null; color: string | null; capacity: string | null;
  battery_percentage: number | null; condition: string | null; sale_price: number | null; product_type: string | null;
}
export interface ConsultaAccessory { id: string; name: string; brand: string | null; category: string | null; quantity: number; sale_price: number | null }

const PART_TYPES = ["peca", "acessorio"];

/** Aparelhos x peças (peças e acessórios cadastrados como produto ficam na aba Peças, como na tela da loja). */
export function splitStock(products: ConsultaProduct[]) {
  return {
    devices: products.filter((p) => !PART_TYPES.includes(p.product_type ?? "")),
    parts: products.filter((p) => PART_TYPES.includes(p.product_type ?? "")),
  };
}

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca por nome, marca, modelo, cor ou capacidade, sem acento/maiúscula; todas as palavras precisam bater. */
export function matchesStock(item: { name: string; brand?: string | null; model?: string | null; color?: string | null; capacity?: string | null }, search: string): boolean {
  const words = norm(search).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = norm([item.name, item.brand, item.model, item.color, item.capacity].filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}

/** Loja que a pessoa só pode consultar: não é dela (admin edita todas). */
export function isConsultOnly(storeId: string | null, userStoreIds: string[], isAdmin: boolean): boolean {
  if (!storeId || storeId === "all" || isAdmin) return false;
  return !userStoreIds.includes(storeId);
}
