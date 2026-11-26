import { describe, it, expect } from "vitest";
import {
  customerWhatsApp, diffAnswers, hasNews, selectionFromAnswers, shareMessage, shareUrl, TOKEN_RE, type TradeShare,
} from "../lib/share";
import type { AnswerLine, TradeRule } from "../lib/types";

const rule = (id: string, question: TradeRule["question"], label: string, amount = 0): TradeRule =>
  ({ id, store_id: "s", question, label, kind: "pct", amount, position: 1, active: true });
const line = (question: AnswerLine["question"], label: string, value = 0): AnswerLine =>
  ({ question, label, kind: "pct", amount: 0, value });

const RULES = [
  rule("t1", "tela", "Perfeita, sem riscos"), rule("t2", "tela", "Riscos leves", 5),
  rule("b1", "bateria", "90% ou mais"), rule("b2", "bateria", "85% a 89%", 5),
  rule("p1", "pecas", "Tela trocada", 10), rule("p2", "pecas", "Câmera trocada", 10),
];

describe("link da avaliação", () => {
  it("monta a URL e reconhece o código", () => {
    expect(shareUrl("abcdefghijklmnopqrstuvwx", "https://loja.app")).toBe("https://loja.app/avaliacao/abcdefghijklmnopqrstuvwx");
    expect(TOKEN_RE.test("abcdefghijklmnopqrstu-_x")).toBe(true);
    expect(TOKEN_RE.test("curto")).toBe(false);
    expect(TOKEN_RE.test("abcdefghijklmnopqrstu/.x")).toBe(false);
  });

  it("mensagem do WhatsApp: chama pelo nome, diz o valor e a validade; sem valor quando a conta está presa", () => {
    const m = shareMessage({ firstName: "Maria", device: "iPhone 13 128 GB", offer: 1900, blocked: false, url: "https://x/avaliacao/t" });
    expect(m).toMatch(/^Oi, Maria!/);
    expect(m).toContain("R$ 1.900");
    expect(m).toContain("3 dias");
    expect(m).toContain("https://x/avaliacao/t");
    expect(shareMessage({ firstName: null, device: "X", offer: 0, blocked: true, url: "u" })).not.toMatch(/Deu/);
  });

  it("wa.me do cliente só com telefone válido", () => {
    expect(customerWhatsApp("(87) 9 9999-0000", "oi")).toBe("https://wa.me/5587999990000?text=oi");
    expect(customerWhatsApp("123", "oi")).toBeNull();
    expect(customerWhatsApp(null, "oi")).toBeNull();
  });

  it("novidade do cliente: mexeu depois da última vez que a loja abriu", () => {
    const base = { activity_at: "2026-11-26T10:00:00Z", seen_at: null } as TradeShare;
    expect(hasNews(base)).toBe(true);
    expect(hasNews({ ...base, seen_at: "2026-11-26T11:00:00Z" })).toBe(false);
    expect(hasNews({ ...base, seen_at: "2026-11-26T09:00:00Z" })).toBe(true);
    expect(hasNews({ ...base, activity_at: null })).toBe(false);
    expect(hasNews(null)).toBe(false);
  });

  it("começa a revisão com o que a loja marcou (casando pelo texto, sem ligar para maiúsculas)", () => {
    const sel = selectionFromAnswers([line("tela", "riscos leves "), line("bateria", "90% ou mais"), line("pecas", "Tela trocada"), line("pecas", "Câmera trocada"), line("carcaca", "Sumiu")], RULES);
    expect(sel).toEqual({ tela: ["t2"], bateria: ["b1"], pecas: ["p1", "p2"] });
  });

  it("compara loja × cliente pergunta por pergunta, na ordem do simulador", () => {
    const store = [line("tela", "Riscos leves", 100), line("bateria", "90% ou mais")];
    const customer = [line("bateria", "90% ou mais"), line("tela", "Perfeita, sem riscos"), line("pecas", "Tela trocada", 200)];
    const d = diffAnswers(store, customer);
    expect(d.map((x) => x.question)).toEqual(["tela", "bateria", "pecas"]);
    expect(d[0]).toMatchObject({ store: ["Riscos leves"], customer: ["Perfeita, sem riscos"], changed: true });
    expect(d[1].changed).toBe(false);
    // pergunta de várias respostas sem nada marcado mostra "Nenhuma peça trocada"
    expect(d[2]).toMatchObject({ store: ["Nenhuma peça trocada"], customer: ["Tela trocada"], changed: true });
  });
});
