// Link da avaliação para o cliente (tradein_shares + funções tradein_public_*).
// Decisões do dono (26/11/2026): o cliente vê base, descontos e valor (sem a margem),
// pode refazer, mandar fotos e aceitar; o link vale 3 dias.
import { formatBRL } from "./calc";
import { QUESTIONS } from "./questions";
import type { AnswerLine, QuestionKey, TradeRule } from "./types";

export const SHARE_DAYS = 3;
export const MAX_PHOTOS = 4;
export const TOKEN_RE = /^[A-Za-z0-9_-]{24}$/;

/** Como a loja enxerga o link (linha de tradein_shares). */
export interface TradeShare {
  token: string;
  expires_at: string;
  opened_at: string | null;
  review_answers: AnswerLine[] | null;
  review_offer: number | null;
  review_discount_total: number | null;
  review_blocked: boolean | null;
  review_note: string | null;
  review_count: number;
  reviewed_at: string | null;
  accepted_at: string | null;
  accepted_value: number | null;
  photo_count: number;
  photos_at: string | null;
  activity_at: string | null;
  seen_at: string | null;
}

/** O que o cliente recebe de tradein_public_get. */
export interface PublicEvaluation {
  store_name: string;
  customer_first_name: string | null;
  brand: string;
  model: string;
  storage: string;
  base_price: number;
  answers: AnswerLine[];
  discount_total: number;
  offer: number;
  agreed: boolean;
  blocked: boolean;
  evaluated_at: string;
  expires_at: string;
  status: "aberta" | "vencida" | "encerrada";
  round_to: number;
  rules: TradeRule[];
  review: {
    answers: AnswerLine[];
    discount_total: number;
    offer: number;
    blocked: boolean;
    note: string | null;
    reviewed_at: string;
  } | null;
  reviews_left: number;
  accepted_at: string | null;
  accepted_value: number | null;
  photo_count: number;
  photos_left: number;
}

export const shareUrl = (token: string, origin = window.location.origin) => `${origin}/avaliacao/${token}`;

export function shareExpiryLabel(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Mensagem do WhatsApp, no tom de vendedor (sem cara de robô). */
export function shareMessage(p: { firstName: string | null; device: string; offer: number; blocked: boolean; url: string }): string {
  const hi = p.firstName ? `Oi, ${p.firstName}!` : "Oi!";
  const value = p.blocked ? "" : ` Deu ${formatBRL(p.offer)}.`;
  return `${hi} Segue a avaliação do seu ${p.device}, com o valor base aqui na loja e cada desconto.${value}\n\n`
    + `Se achar que alguma coisa não bate, você mesmo pode refazer por lá e mandar fotos. O link vale ${SHARE_DAYS} dias:\n${p.url}`;
}

/** Telefone BR → DDD + número. Igual a normalizePhone do CRM (o módulo do CRM não pode ser importado aqui). */
function normalizePhone(input: string | null | undefined): string | null {
  let n = String(input ?? "").replace(/\D/g, "");
  if ((n.length === 12 || n.length === 13) && n.startsWith("55")) n = n.slice(2);
  else if ((n.length === 11 || n.length === 12) && n.startsWith("0")) n = n.replace(/^0+/, "");
  return (n.length === 10 || n.length === 11) && !n.startsWith("0") ? n : null;
}

/** wa.me do cliente; sem telefone válido → null (aí só copia o link). */
export function customerWhatsApp(phone: string | null, text: string): string | null {
  const n = normalizePhone(phone);
  return n ? `https://wa.me/55${n}?text=${encodeURIComponent(text)}` : null;
}

/** O cliente mexeu (revisou, aceitou, mandou foto) e a loja ainda não abriu. */
export function hasNews(s: TradeShare | null | undefined): boolean {
  if (!s?.activity_at) return false;
  return !s.seen_at || new Date(s.activity_at) > new Date(s.seen_at);
}

/**
 * Respostas da loja → ids das regras atuais (casando pergunta + texto), para o cliente
 * começar a revisão com o que a loja marcou. Regra que mudou de nome fica sem marcar.
 */
export function selectionFromAnswers(lines: AnswerLine[], rules: TradeRule[]): Partial<Record<QuestionKey, string[]>> {
  const out: Partial<Record<QuestionKey, string[]>> = {};
  for (const l of lines) {
    const r = rules.find((x) => x.question === l.question && x.label.trim().toLowerCase() === l.label.trim().toLowerCase());
    if (r) out[l.question] = [...(out[l.question] ?? []), r.id];
  }
  return out;
}

export interface AnswerDiff {
  question: QuestionKey;
  short: string;
  store: string[];
  customer: string[];
  changed: boolean;
}

/** Pergunta por pergunta: o que a loja viu × o que o cliente disse. */
export function diffAnswers(store: AnswerLine[], customer: AnswerLine[]): AnswerDiff[] {
  const labels = (lines: AnswerLine[], q: QuestionKey) => lines.filter((l) => l.question === q).map((l) => l.label).sort();
  return QUESTIONS.flatMap((q) => {
    const s = labels(store, q.key);
    const c = labels(customer, q.key);
    if (!s.length && !c.length) return [];
    const none = q.noneLabel ?? "—";
    const show = (x: string[]) => (x.length ? x : [q.multi ? none : "—"]);
    return [{ question: q.key, short: q.short, store: show(s), customer: show(c), changed: s.join("|") !== c.join("|") }];
  });
}
