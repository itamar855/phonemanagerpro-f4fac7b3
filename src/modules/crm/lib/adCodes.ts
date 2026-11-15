// Códigos de anúncio (#T21): geração, leitura e textos prontos para o "Modelo de mensagem" da Meta.
import { extractPhone, extractUsername } from "./igLead";

export interface AdCode {
  id: string;
  store_id: string;
  code: string;
  level: "ad" | "adset" | "campaign";
  campaign_name: string;
  adset_name: string | null;
  ad_name: string | null;
  campaign_id: string | null;
  adset_id: string | null;
  ad_id: string | null;
  active: boolean;
  created_at: string;
}

/** Mesmo padrão do webhook (supabase/functions/whatsapp-webhook/parse.ts). */
export function extractAdCode(text: string | null | undefined): string | null {
  const m = /(?:#|\bref\.?\s*:?\s*)([A-Za-z][A-Za-z0-9]{1,5})\b/i.exec(text ?? "");
  return m ? m[1].toUpperCase() : null;
}

/** Letra da campanha: primeira letra do nome (sem acento). */
export function campaignLetter(name: string): string {
  const l = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z]/g, "").charAt(0).toUpperCase();
  return l || "A";
}

/**
 * Próximo código livre: letra da campanha + conjunto + anúncio (ex.: T21).
 * Sem 0 nos números (não confunde com O). Se ocupado, avança o anúncio, depois o conjunto.
 */
export function suggestCode(campaignName: string, existing: string[], level: AdCode["level"] = "ad"): string {
  const L = campaignLetter(campaignName);
  const taken = new Set(existing.map((c) => c.toUpperCase()));
  if (level === "campaign") {
    if (!taken.has(L + "1")) return L + "1";
    for (let i = 2; i <= 9; i++) if (!taken.has(`${L}${i}`)) return `${L}${i}`;
  }
  if (level === "adset") {
    for (let s = 1; s <= 9; s++) if (!taken.has(`${L}${s}`)) return `${L}${s}`;
  }
  for (let s = 1; s <= 9; s++) for (let a = 1; a <= 9; a++) if (!taken.has(`${L}${s}${a}`)) return `${L}${s}${a}`;
  for (let n = 111; n <= 999; n++) if (!String(n).includes("0") && !taken.has(`${L}${n}`)) return `${L}${n}`;
  return `${L}${Date.now() % 1000}`;
}

/** "Tela Novembro › Público 25-45 › Vídeo 1" */
export const adCodePath = (c: Pick<AdCode, "campaign_name" | "adset_name" | "ad_name">) =>
  [c.campaign_name, c.adset_name, c.ad_name].filter(Boolean).join(" › ");

/** Textos prontos para colar no anúncio (saudação + perguntas). */
export function adTexts(code: string, storeName: string) {
  return {
    greeting: `Oi! 😊 Bem-vindo à ${storeName}. Ref. ${code}`,
    questions: [
      `Quero saber o preço 📱 #${code}`,
      `Vocês aceitam meu usado na troca? 🔄 #${code}`,
      `Quais as formas de pagamento? 💳 #${code}`,
    ],
  };
}

export interface PasteResult { phone?: string; username?: string; code?: AdCode }

/**
 * O vendedor cola qualquer coisa no mesmo botão: link do perfil, mensagem com o número
 * ou a saudação/pergunta do anúncio. Devolve o que foi reconhecido.
 */
export function parsePasted(text: string, codes: AdCode[]): PasteResult {
  const out: PasteResult = {};
  const raw = extractAdCode(text);
  if (raw) {
    const hit = codes.find((c) => c.active && c.code === raw);
    if (hit) out.code = hit;
  }
  const phone = extractPhone(text);
  if (phone) out.phone = phone;
  // @ só quando parece link/usuário (não confunde "#T21" ou um número com @)
  if (/instagram\.com|instagr\.am|ig\.me|(?:^|\s)@/.test(text) || (!phone && !out.code)) {
    const u = extractUsername(text);
    if (u) out.username = u;
  }
  return out;
}
