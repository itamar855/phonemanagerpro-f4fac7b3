// Gêmea em TypeScript de crm_normalize_phone / crm_phone_key (SQL).
// Mantenha as duas iguais: os testes de src/modules/crm/__tests__ conferem os mesmos casos.

/** Telefone brasileiro → DDD + número (10 ou 11 dígitos), ou null. */
export function normalizePhone(input: string | null | undefined): string | null {
  let n = String(input ?? "").replace(/\D/g, "");
  if ((n.length === 12 || n.length === 13) && n.startsWith("55")) n = n.slice(2);
  else if ((n.length === 11 || n.length === 12) && n.startsWith("0")) n = n.replace(/^0+/, "");
  if ((n.length === 10 || n.length === 11) && !n.startsWith("0")) return n;
  return null;
}

/** Chave de casamento: DDD + 8 últimos dígitos (resolve o 9º dígito). */
export function phoneKey(input: string | null | undefined): string | null {
  const n = normalizePhone(input);
  return n ? n.slice(0, 2) + n.slice(-8) : null;
}

/** "5587999112233" → "(87) 99911-2233". Devolve o original se não for telefone BR. */
export function formatPhone(input: string | null | undefined): string {
  const n = normalizePhone(input);
  if (!n) return String(input ?? "");
  const ddd = n.slice(0, 2);
  const rest = n.slice(2);
  return rest.length === 9
    ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
    : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

/** Link wa.me com mensagem pronta. */
export function waMeLink(storePhone: string, text: string): string | null {
  const n = normalizePhone(storePhone);
  if (!n) return null;
  return `https://wa.me/55${n}?text=${encodeURIComponent(text)}`;
}
