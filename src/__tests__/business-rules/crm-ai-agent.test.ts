import { describe, expect, it } from "vitest";
import {
  applyGuards, buildSystemPrompt, checkContext, defaultHandoffMessage, freshStart, isAcknowledgement, isGreeting, personName, typingDelayMs, historyTranscript, hoursText, isOpenNow, maskPersonalData, parseDecision, toTurns,
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
    storeName: "Restaura Phone", knowledge: "Endereço: Rua A, 10. Película 3D: R$ 30.", persona: null as string | null, contactName: "Ana Souza",
    isCustomer: true, now: new Date("2026-11-16T13:00:00Z"), openNow: true, hoursText: "seg a sáb das 08:00 às 18:00",
    serviceOrders: [{ number: 106, device: "Motorola G22", status: "ready" }], handoffMessage: null as string | null,
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
    expect(defaultHandoffMessage("Ana Souza", true)).toMatch(/Ana!/);
    expect(defaultHandoffMessage("Ana Souza", true)).not.toMatch(/anotei tudo/);
    expect(defaultHandoffMessage(null, false)).toMatch(/assim que a loja abrir/);
  });
});

describe("trava de contexto: a IA só responde sozinha quando entende a conversa", () => {
  const NOW = new Date("2026-11-21T15:00:00Z");
  const msg = (direction: "in" | "out", body: string, at: string, extra: Partial<TranscriptMessage> = {}): TranscriptMessage => ({
    direction, sender_kind: direction === "in" ? "contact" : "ai", kind: "text", body, created_at: at, inserted_at: at, ...extra,
  });

  it("reconhece mensagens que só confirmam", () => {
    for (const t of ["Ok", "ok!", "Okk", "Ok amigo boa tarde", "Ok, obrigada", "Obrigado!!", "blz", "Beleza, valeu", "👍", "🙏🙏", "Tá bom, obrigada", "Combinado kkk"]) {
      expect(isAcknowledgement(t), t).toBe(true);
    }
    for (const t of ["ok, qual o valor?", "Boa tarde", "Oi", "sim", "Ok, quero a tela do A54", "Obrigada, mas e a garantia", "", null]) {
      expect(isAcknowledgement(t), String(t)).toBe(false);
    }
  });

  it("só 'ok/obrigado' depois da loja: não responde", () => {
    const c = checkContext([
      msg("in", "quanto fica a tela do iPhone 11?", "2026-11-21T14:00:00Z"),
      msg("out", "Fica R$ 350, pode trazer hoje", "2026-11-21T14:05:00Z"),
      msg("in", "Ok", "2026-11-21T14:06:00Z"),
      msg("in", "Obrigada!", "2026-11-21T14:06:10Z"),
    ], { now: NOW, hasOlder: false });
    expect(c.skip).toMatch(/só confirmou/);
  });

  it("pergunta nova depois do ok: responde normalmente", () => {
    const c = checkContext([
      msg("in", "quanto fica a tela do iPhone 11?", "2026-11-21T14:00:00Z"),
      msg("out", "Fica R$ 350", "2026-11-21T14:05:00Z"),
      msg("in", "Ok", "2026-11-21T14:06:00Z"),
      msg("in", "e a bateria?", "2026-11-21T14:06:30Z"),
    ], { now: NOW, hasOlder: false });
    expect(c).toEqual({ skip: null, draftOnly: [], warnings: [] });
  });

  it("mensagens sincronizadas depois: só sugere e avisa o modelo", () => {
    const c = checkContext([
      msg("in", "tem capinha do A15?", "2026-11-21T10:00:00Z", { inserted_at: "2026-11-21T13:00:00Z" }),
      msg("in", "preta", "2026-11-21T14:50:00Z"),
    ], { now: NOW, hasOlder: false });
    expect(c.skip).toBeNull();
    expect(c.draftOnly).toContain("histórico sincronizado depois");
    expect(c.warnings.join(" ")).toMatch(/pode haver mensagens faltando/);
  });

  it("sincronização antiga (mais de 3 dias) não trava mais", () => {
    const c = checkContext([
      msg("in", "tem capinha do A15?", "2026-11-10T10:00:00Z", { inserted_at: "2026-11-12T10:00:00Z" }),
      msg("in", "preta", "2026-11-21T14:50:00Z"),
    ], { now: NOW, hasOlder: true });
    expect(c.draftOnly).toEqual([]);
  });

  it("conversa que começa com 'ok' (começou antes do CRM): só sugere", () => {
    const c = checkContext([
      msg("in", "Ok amigo boa tarde", "2026-11-21T14:00:00Z"),
      msg("in", "e aí, chegou a peça?", "2026-11-21T14:40:00Z"),
    ], { now: NOW, hasOlder: false });
    expect(c.skip).toBeNull();
    expect(c.draftOnly).toContain("conversa começou antes do CRM");
    // com mensagens mais antigas guardadas, o começo existe: não trava
    expect(checkContext([msg("in", "Ok", "2026-11-21T14:00:00Z"), msg("in", "chegou?", "2026-11-21T14:40:00Z")], { now: NOW, hasOlder: true }).draftOnly).toEqual([]);
  });

  it("alguém da equipe respondeu nas últimas 12 h: só sugere", () => {
    const c = checkContext([
      msg("in", "oi, tem película?", "2026-11-21T09:00:00Z"),
      msg("out", "Tem sim", "2026-11-21T09:10:00Z", { sender_kind: "user" }),
      msg("in", "qual o valor?", "2026-11-21T14:50:00Z"),
    ], { now: NOW, hasOlder: false });
    expect(c.draftOnly).toContain("a equipe respondeu nas últimas 12 h");
  });

  it("memória, anotações e avisos entram nas instruções", () => {
    const p = buildSystemPrompt({
      storeName: "Loja X", knowledge: "Endereço: Rua A", persona: null, contactName: "Joyce", isCustomer: false,
      now: NOW, openNow: true, hoursText: null, serviceOrders: [], handoffMessage: null,
      memory: "iPhone 11 não liga; loja passou R$ 350; vem sábado.", teamNotes: "Prefere áudio.",
      contextWarnings: ["A conversa começou antes de entrar no sistema: o começo dela não aparece aqui."],
    });
    expect(p).toContain("O QUE JÁ SABEMOS DESTA PESSOA");
    expect(p).toContain("- Resumo: iPhone 11 não liga; loja passou R$ 350; vem sábado.");
    expect(p).toContain("- Anotações da equipe: Prefere áudio.");
    expect(p).toContain("ATENÇÃO, CONTEXTO INCOMPLETO");
    expect(p).toMatch(/faça handoff em vez de chutar/);
    // sem memória nem avisos: nada disso aparece
    const plain = buildSystemPrompt({ storeName: "Loja X", knowledge: "", persona: null, contactName: null, isCustomer: false, now: NOW, openNow: null, hoursText: null, serviceOrders: [], handoffMessage: null });
    expect(plain).not.toContain("O QUE JÁ SABEMOS");
    expect(plain).not.toContain("CONTEXTO INCOMPLETO");
  });
});

describe("jeito de gente: a pessoa não percebe que é a IA", () => {
  const base = { storeName: "Loja X", knowledge: "", persona: null as string | null, contactName: null as string | null, isCustomer: false, now: new Date(), openNow: true, hoursText: null as string | null, serviceOrders: [] as { number: number; device: string; status: string }[], handoffMessage: null as string | null };

  it("instruções pedem conversa informal, sem lista numerada nem frases de robô", () => {
    const p = buildSystemPrompt(base);
    expect(p).toMatch(/NÃO pode perceber/);
    expect(p).toMatch(/sem listas numeradas/);
    expect(p).toMatch(/Cumprimente só na primeira resposta/);
    expect(p).toMatch(/NUNCA diga que é assistente virtual, robô, IA/);
  });

  it("nome que não é de gente não entra na frase ('Show Cliente!', 'Show não!')", () => {
    expect(personName("Cliente")).toBeNull();
    expect(personName("não")).toBeNull();
    expect(personName("desconhecido")).toBeNull();
    expect(personName("87999112233")).toBeNull();
    expect(personName("Joyce")).toBe("Joyce");
    expect(personName("Ana Souza")).toBe("Ana Souza");
    expect(defaultHandoffMessage("Cliente", true)).not.toMatch(/Cliente/);
    expect(parseDecision({ decision: "handoff", reply: "", customer_name: "não", score: "warm", summary: "x" }).customer_name).toBeNull();
  });

  it("frase de passagem varia entre conversas e nunca fala em atendente/robô", () => {
    const all = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((seed) => defaultHandoffMessage("Joyce", true, seed)));
    expect(all.size).toBeGreaterThan(1);
    for (const m of all) {
      expect(m).toContain("Joyce");
      expect(m).not.toMatch(/atendente|humano|virtual|rob[oô]|anotei tudo/i);
    }
    expect(defaultHandoffMessage(null, false, "x")).toMatch(/loja abrir|abrir a loja/);
  });

  it("'digitando…' proporcional ao tamanho da mensagem (2 a 9 s)", () => {
    expect(typingDelayMs("ok")).toBe(2000);
    expect(typingDelayMs("x".repeat(100))).toBe(5700);
    expect(typingDelayMs("x".repeat(1000))).toBe(9000);
  });
});

describe("atendimento que recomeça depois de dias", () => {
  const at = (iso: string) => new Date(iso).toISOString();
  const m = (direction: "in" | "out", body: string, created_at: string, sender_kind: TranscriptMessage["sender_kind"] = direction === "in" ? "contact" : "user"): TranscriptMessage =>
    ({ direction, sender_kind, kind: "text", body, created_at: at(created_at) });

  it("reconhece cumprimentos soltos", () => {
    for (const t of ["Oi", "Oii", "oiee", "Olá, tudo bem?", "Boa noite", "bom dia gente", "E aí", "opa 👋"]) expect(isGreeting(t)).toBe(true);
    for (const t of ["Oi, quanto custa a tela do A54?", "Vcs fazem conserto?", "ok", "", "Pro Max"]) expect(isGreeting(t)).toBe(false);
  });

  it("\"Oi\" depois de 5 dias começa do zero", () => {
    const msgs = [
      m("in", "12 normal?", "2026-11-16T17:51:00Z"),
      m("out", "Aqui serve 12 e 12 pro", "2026-11-16T17:52:00Z"),
      m("in", "Só tem essas duas", "2026-11-16T17:53:00Z"),
      m("in", "Oi", "2026-11-21T22:06:00Z"),
      m("in", "Oi", "2026-11-21T22:17:00Z"),
    ];
    const r = freshStart(msgs);
    expect(r.gapHours).toBe(124);
    expect(r.messages.map((x) => x.body)).toEqual(["Oi", "Oi"]);
  });

  it("voltar com uma pergunta, ou responder pouco tempo depois, mantém a conversa", () => {
    const old = [m("out", "A peça chega quinta", "2026-11-16T17:52:00Z")];
    expect(freshStart([...old, m("in", "Oi, chegou a peça?", "2026-11-20T12:00:00Z")]).gapHours).toBeNull();
    expect(freshStart([...old, m("in", "Oi", "2026-11-16T19:00:00Z")]).gapHours).toBeNull();
  });

  it("depois do recomeço, a conversa nova continua inteira", () => {
    const msgs = [
      m("in", "Tem capa?", "2026-11-10T12:00:00Z"),
      m("in", "Boa noite", "2026-11-21T22:00:00Z"),
      m("out", "Opa, boa noite! Em que posso ajudar?", "2026-11-21T22:00:30Z", "ai"),
      m("in", "Vcs fazem conserto?", "2026-11-21T22:01:00Z"),
    ];
    expect(freshStart(msgs).messages.map((x) => x.body)).toEqual(["Boa noite", "Opa, boa noite! Em que posso ajudar?", "Vcs fazem conserto?"]);
  });

  it("\"Não informado\" não vira nome na frase de passagem", () => {
    expect(personName("Não informado")).toBeNull();
    expect(personName("nao identificado")).toBeNull();
    expect(personName("Sem nome")).toBeNull();
    expect(defaultHandoffMessage("Não informado", false, "x")).not.toMatch(/N[aã]o!/);
    expect(personName("Ana Paula")).toBe("Ana Paula");
  });
});

describe("conserto: orienta antes de passar para a técnica", () => {
  it("o prompt traz as dicas seguras e pede a dica na mesma mensagem da passagem", () => {
    const p = buildSystemPrompt({ storeName: "Loja", knowledge: null, persona: null, contactName: null, isCustomer: false, now: new Date(), openNow: false, hoursText: null, serviceOrders: [], handoffMessage: null });
    expect(p).toMatch(/ORIENTAÇÃO NO CONSERTO/);
    expect(p).toMatch(/Molhou \/ entrou líquido: desligar e não ligar para testar, não carregar/);
    expect(p).toMatch(/Handoff de CONSERTO: antes da frase de transição, na MESMA mensagem/);
    expect(p).toMatch(/nunca prometa que tem conserto, preço ou prazo/);
  });
});
