import { describe, expect, it } from "vitest";
import {
  applyGuards, buildSystemPrompt, defaultHandoffMessage, historyTranscript, hoursText, isOpenNow, maskPersonalData, parseDecision, toTurns,
  type AgentDecision, type TranscriptMessage,
} from "../../../supabase/functions/_shared/ai-agent-core";

describe("agente de IA — aprendizado", () => {
  it("esconde telefone, e-mail e CPF", () => {
    expect(maskPersonalData("me chama no (87) 99911-2233 ou ana@gmail.com, cpf 123.456.789-09"))
      .toBe("me chama no [telefone] ou [email], cpf [cpf]");
    expect(maskPersonalData("+55 87 999112233")).toBe("[telefone]");
    expect(maskPersonalData("iPhone 13 128GB por R$ 3.500")).toBe("iPhone 13 128GB por R$ 3.500");
  });

  it("monta a conversa antiga em ordem e só quando houve troca real", () => {
    const t = historyTranscript([
      { fromMe: true, text: "Temos sim, sai por R$ 30", at: 3 },
      { fromMe: false, text: "tem película 3D do A54?", at: 1 },
      { fromMe: false, text: "meu número é 87999112233", at: 2 },
    ]);
    expect(t).toBe("Cliente: tem película 3D do A54?\nCliente: meu número é [telefone]\nLoja: Temos sim, sai por R$ 30");
    expect(historyTranscript([{ fromMe: false, text: "oi", at: 1 }, { fromMe: false, text: "alguém?", at: 2 }, { fromMe: false, text: "?", at: 3 }])).toBeNull();
  });

  it("exemplos aprovados entram nas instruções com o aviso sobre preço", () => {
    const p = buildSystemPrompt({
      storeName: "Loja", knowledge: null, persona: null, contactName: null, isCustomer: false, now: new Date(), openNow: null,
      hoursText: null, serviceOrders: [], handoffMessage: null,
      examples: [{ question: "trocam tela de iphone 11?", answer: "Trocamos sim! Fica pronto no mesmo dia." }],
    });
    expect(p).toContain('Cliente: "trocam tela de iphone 11?"');
    expect(p).toContain('Loja: "Trocamos sim! Fica pronto no mesmo dia."');
    expect(p).toMatch(/use SÓ para o jeito de falar/);
  });
});

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

  it("áudio transcrito a IA entende (e o pedido de atendente falado também conta)", () => {
    const heard = { ...msg("in", "[Áudio]", "audio"), transcript: "minha tela do A54 quebrou, quanto fica?" };
    expect(applyGuards(reply(), { ...g, lastInbound: heard }).decision).toBe("reply");
    const asksHuman = { ...msg("in", "[Áudio]", "audio"), transcript: "deixa eu falar com um atendente" };
    expect(applyGuards(reply(), { ...g, lastInbound: asksHuman }).decision).toBe("handoff");
  });

  it("transcrição entra na conversa enviada ao modelo", () => {
    const turns = toTurns([{ ...msg("in", "[Áudio]", "audio"), transcript: "boa tarde, tem capinha do iPhone 13?" }]);
    expect(turns).toEqual([{ role: "user", text: "[áudio da pessoa, transcrito]: boa tarde, tem capinha do iPhone 13?" }]);
  });

  it("frase de passagem sai sem perguntas", () => {
    const d = applyGuards(reply({ decision: "handoff", reply: "Entendido! Um atendente te chama amanhã às 8h. Poderia me dizer seu nome, por favor?" }), g);
    expect(d.reply).toBe("Entendido! Um atendente te chama amanhã às 8h.");
    // se sobrar vazio, o executor usa a frase padrão de passagem
    expect(applyGuards(reply({ decision: "handoff", reply: "Qual seu nome?" }), g).reply).toBe("");
  });

  it("a IA não se revela", () => {
    // perguntou se é robô: passa para a equipe com a frase padrão (não nega nem confirma)
    const bot = applyGuards(reply({ reply: "Não, sou uma pessoa!" }), { ...g, lastInbound: msg("in", "vc é um bot?") });
    expect(bot).toMatchObject({ decision: "handoff", reply: "" });
    expect(applyGuards(reply(), { ...g, lastInbound: msg("in", "eu ia passar aí amanhã") }).decision).toBe("reply");
    expect(applyGuards(reply(), { ...g, lastInbound: msg("in", "passa na máquina?") }).decision).toBe("reply");
    // o modelo escorregou
    expect(applyGuards(reply({ decision: "handoff", reply: "Vou chamar um atendente humano." }), g).reply).toBe("");
    expect(applyGuards(reply({ reply: "Sou o assistente virtual da loja. Qual o modelo?" }), g).reply).toBe("Qual o modelo?");
  });

  it("passagem sem dizer quem continua usa a frase padrão", () => {
    expect(applyGuards(reply({ decision: "handoff", reply: "Entendi, anotado aqui! Qual o seu nome?" }), g).reply).toBe("");
    expect(defaultHandoffMessage("Ana", true)).not.toMatch(/atendente|humano|virtual/i);
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
    expect(defaultHandoffMessage("Ana Souza", true)).toMatch(/^Show Ana!.*já já/);
    expect(defaultHandoffMessage(null, false)).toMatch(/assim que a loja abrir/);
  });
});
