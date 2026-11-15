import { describe, expect, it } from "vitest";
import {
  applyGuards, buildSystemPrompt, defaultHandoffMessage, hoursText, isOpenNow, parseDecision, toTurns,
  type AgentDecision, type TranscriptMessage,
} from "../../../supabase/functions/_shared/ai-agent-core";

const msg = (direction: "in" | "out", body: string, kind = "text", sender_kind: TranscriptMessage["sender_kind"] = direction === "in" ? "contact" : "user"): TranscriptMessage =>
  ({ direction, body, kind, sender_kind });

const reply = (over: Partial<AgentDecision> = {}): AgentDecision => ({
  decision: "reply", reply: "Qual o modelo do aparelho?", commercial: true, interest: "repair", device_model: null, defect: "tela quebrada",
  urgency: null, customer_name: null, score: "warm", summary: "Quer trocar a tela", title: "Troca de tela", reason: null, ...over,
});

describe("agente de IA — instruções", () => {
  const base = {
    storeName: "Restaura Phone", knowledge: "Endereço: Rua A, 10. Película 3D: R$ 30.", persona: null, contactName: "Ana Souza",
    isCustomer: true, now: new Date("2026-11-16T13:00:00Z"), openNow: true, hoursText: "seg a sáb das 08:00 às 18:00",
    serviceOrders: [{ number: 106, device: "Motorola G22", status: "ready" }], handoffMessage: null,
  };

  it("leva o conhecimento, as OS e a proibição de inventar preço", () => {
    const p = buildSystemPrompt(base);
    expect(p).toContain("Restaura Phone");
    expect(p).toContain("Película 3D: R$ 30.");
    expect(p).toContain("OS #106 · Motorola G22 · PRONTA para retirada");
    expect(p).toMatch(/NUNCA invente preço/);
    expect(p).toContain("A loja está ABERTA agora.");
    expect(p).not.toMatch(/\n{3,}/);
  });

  it("sem conhecimento cadastrado, avisa para não informar preços", () => {
    expect(buildSystemPrompt({ ...base, knowledge: "", serviceOrders: [] })).toMatch(/ainda não cadastrou informações/);
  });
});

describe("agente de IA — conversa para o modelo", () => {
  it("ignora notas, junta mensagens seguidas e começa pelo cliente", () => {
    const turns = toTurns([
      msg("out", "Olá! Promoção de capinhas"),
      msg("in", "oi"),
      msg("in", "quanto custa a tela do A54?"),
      { direction: "out", body: "anotar: cliente antigo", kind: "note", sender_kind: "user" },
      msg("out", "Oi! Qual o defeito?", "text", "ai"),
      msg("in", "[Áudio]", "audio"),
    ]);
    expect(turns).toEqual([
      { role: "user", text: "oi\nquanto custa a tela do A54?" },
      { role: "model", text: "Oi! Qual o defeito?" },
      { role: "user", text: "[a pessoa enviou um áudio]" },
    ]);
  });
});

describe("agente de IA — leitura da resposta", () => {
  it("aceita JSON com cercas de código e normaliza campos", () => {
    const d = parseDecision('```json\n{"decision":"reply","reply":"Oi!","commercial":true,"interest":"unknown","score":"hot","summary":"x","device_model":"null"}\n```');
    expect(d).toMatchObject({ decision: "reply", reply: "Oi!", interest: null, score: "hot", device_model: null });
  });

  it("resposta inválida vira passagem para o humano", () => {
    expect(parseDecision("não sou json").decision).toBe("handoff");
    expect(parseDecision({ decision: "vender", reply: "x" }).decision).toBe("handoff");
  });
});

describe("agente de IA — travas", () => {
  const g = { aiRepliesSoFar: 1, maxTurns: 8, lastInbound: msg("in", "minha tela quebrou") };

  it("pedido de atendente sempre passa para o humano", () => {
    expect(applyGuards(reply(), { ...g, lastInbound: msg("in", "quero falar com um atendente") }).decision).toBe("handoff");
    expect(applyGuards(reply(), { ...g, lastInbound: msg("in", "vc é robô?") }).decision).toBe("handoff");
  });

  it("áudio/imagem sem texto passa para o humano", () => {
    expect(applyGuards(reply(), { ...g, lastInbound: msg("in", "[Áudio]", "audio") }).reason).toBe("mensagem em áudio/imagem");
  });

  it("limite de mensagens da IA", () => {
    expect(applyGuards(reply(), { ...g, aiRepliesSoFar: 8 }).decision).toBe("handoff");
    expect(applyGuards(reply(), g).decision).toBe("reply");
  });

  it("assunto não comercial fica em silêncio", () => {
    const d = applyGuards(reply({ decision: "ignore", reply: "oi mãe", commercial: false }), { ...g, lastInbound: msg("in", "falar com o vendedor da Samsung sobre o pedido") });
    expect(d.decision).toBe("ignore");
    expect(d.reply).toBe("");
  });
});

describe("agente de IA — horário", () => {
  const h = { enabled: true, start: "08:00", end: "18:00", days: [1, 2, 3, 4, 5, 6] };
  it("aberto/fechado no horário de Brasília", () => {
    expect(isOpenNow(h, new Date("2026-11-16T13:00:00Z"))).toBe(true); // seg 10:00
    expect(isOpenNow(h, new Date("2026-11-16T22:00:00Z"))).toBe(false); // seg 19:00
    expect(isOpenNow(h, new Date("2026-11-15T13:00:00Z"))).toBe(false); // domingo
    expect(isOpenNow(null)).toBeNull();
    expect(hoursText(h)).toBe("seg, ter, qua, qui, sex, sáb das 08:00 às 18:00");
  });

  it("frase de transição muda quando a loja está fechada", () => {
    expect(defaultHandoffMessage("Ana Souza", true)).toMatch(/^Obrigado Ana!.*em instantes/);
    expect(defaultHandoffMessage(null, false)).toMatch(/assim que a loja abrir/);
  });
});
