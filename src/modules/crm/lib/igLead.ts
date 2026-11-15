// Lead do Instagram cadastrado à mão: leitura do texto colado da DM e mensagem modelo.
import { normalizePhone } from "./phone";

/** Primeiro telefone brasileiro válido no texto (DDD + número, 10 ou 11 dígitos), ou null. */
export function extractPhone(text: string): string | null {
  // candidatos: sequências de dígitos com separadores comuns ( ) - . espaço, com ou sem +55
  const re = /(?:\+?55[\s.-]*)?\(?\d{2}\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]*\d{4}/g;
  for (const m of text.match(re) ?? []) {
    const n = normalizePhone(m);
    if (n) return n;
  }
  return null;
}

/** @usuario do Instagram citado no texto. */
export function extractUsername(text: string): string | null {
  const m = /(?:^|\s)@([A-Za-z0-9._]{2,30})\b/.exec(text);
  return m ? m[1].replace(/\.$/, "").toLowerCase() : null;
}

/** Nome quando a pessoa se apresenta ("meu nome é Ana", "aqui é a Bruna", "sou o Carlos"). */
export function extractName(text: string): string | null {
  const m = /(?:meu nome (?:é|e)|me chamo|aqui (?:é|e) (?:a|o)|sou (?:a|o))\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[A-ZÀ-Ý][a-zà-ÿ]+)?)/i.exec(text);
  if (!m) return null;
  return m[1].split(/\s+/).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(" ");
}

export const DEFAULT_IG_MESSAGE = "Oi {primeiro_nome}! Aqui é a {loja}, você falou com a gente no Instagram{sobre} 😊 Posso te ajudar por aqui?";

/**
 * Preenche o modelo. Variáveis: {primeiro_nome} {nome} {loja} {assunto} {sobre}
 * ({sobre} vira " sobre <assunto>" ou some quando não há assunto).
 */
export function fillTemplate(tpl: string, v: { name: string | null; store: string | null; subject: string | null }): string {
  const name = (v.name ?? "").replace(/^@/, "").trim();
  const first = name && !/^\+?\d/.test(name) ? name.split(/\s+/)[0] : "";
  const subject = (v.subject ?? "").trim();
  return tpl
    .replace(/\{primeiro_nome\}/g, first)
    .replace(/\{nome\}/g, name && !/^\+?\d/.test(name) ? name : "")
    .replace(/\{loja\}/g, (v.store ?? "loja").trim())
    .replace(/\{assunto\}/g, subject)
    .replace(/\{sobre\}/g, subject ? ` sobre ${subject.charAt(0).toLowerCase()}${subject.slice(1)}` : "")
    .replace(/\s+([!,.?])/g, "$1") // "Oi !" → "Oi!" quando não há nome
    .replace(/ {2,}/g, " ")
    .trim();
}
