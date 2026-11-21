// Regras puras do agente de IA do CRM (sem rede, sem banco).
// Testadas em src/__tests__/business-rules/crm-ai-agent.test.ts.

export type Decision = "reply" | "handoff" | "ignore";
export type Score = "hot" | "warm" | "cold";
export type Interest = "device" | "repair" | "accessory" | "other";

export interface AgentDecision {
  decision: Decision;
  reply: string;
  commercial: boolean;
  interest: Interest | null;
  device_model: string | null;
  defect: string | null;
  urgency: string | null;
  customer_name: string | null;
  score: Score;
  summary: string;
  title: string;
  reason: string | null;
}

export interface TranscriptMessage {
  direction: "in" | "out";
  sender_kind: "contact" | "user" | "ai" | "system";
  kind: string;
  body: string | null;
  created_at?: string;
  /** Transcrição do áudio, quando houver */
  transcript?: string | null;
  /** Quando entrou no CRM (difere de created_at quando a mensagem foi sincronizada depois) */
  inserted_at?: string | null;
}

export interface ServiceOrderInfo { number: number | string; device: string; status: string }

export interface PromptContext {
  storeName: string;
  knowledge: string | null;
  persona: string | null;
  contactName: string | null;
  isCustomer: boolean;
  now: Date;
  openNow: boolean | null;
  hoursText: string | null;
  serviceOrders: ServiceOrderInfo[];
  handoffMessage: string | null;
  /** Exemplos reais aprovados, parecidos com a mensagem atual */
  examples?: { question: string | null; answer: string; has_price?: boolean }[];
  /** Memória do cliente escrita pela IA em conversas anteriores */
  memory?: string | null;
  /** Anotações da equipe no contato */
  teamNotes?: string | null;
  /** Avisos de contexto incompleto (checkContext) */
  contextWarnings?: string[];
  /** Estoque à venda que tem a ver com a conversa (stockPromptLines); null/undefined = IA sem acesso ao estoque */
  stock?: string[] | null;
}

/** Esquema da resposta (formato do Gemini: OpenAPI 3 em maiúsculas). */
export const DECISION_SCHEMA = {
  type: "OBJECT",
  properties: {
    decision: { type: "STRING", enum: ["reply", "handoff", "ignore"] },
    reply: { type: "STRING" },
    commercial: { type: "BOOLEAN" },
    interest: { type: "STRING", enum: ["device", "repair", "accessory", "other", "unknown"] },
    device_model: { type: "STRING" },
    defect: { type: "STRING" },
    urgency: { type: "STRING" },
    customer_name: { type: "STRING" },
    score: { type: "STRING", enum: ["hot", "warm", "cold"] },
    summary: { type: "STRING" },
    title: { type: "STRING" },
    reason: { type: "STRING" },
  },
  required: ["decision", "reply", "commercial", "score", "summary"],
};

const OS_STATUS_PT: Record<string, string> = {
  open: "aberta (aguardando análise)", analyzing: "em análise", waiting_part: "aguardando peça", repairing: "em reparo",
  waiting_approval: "aguardando aprovação do orçamento", ready: "PRONTA para retirada", delivered: "já entregue", cancelled: "cancelada",
};

export function buildSystemPrompt(ctx: PromptContext): string {
  const when = ctx.now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", hour: "2-digit", minute: "2-digit" });
  const lines: (string | null)[] = [
    `Você faz o primeiro atendimento da loja "${ctx.storeName}" (celulares, acessórios e assistência técnica) no WhatsApp, como alguém da equipe.`,
    `Seu objetivo é entender o que a pessoa precisa e passar para o colega certo (vendas ou técnica) com tudo anotado. Você NÃO fecha venda.`,
    "",
    "COMO ESCREVER",
    "- Português do Brasil, simpático e direto, como um bom vendedor de loja. Mensagens curtas (no máximo 3 frases).",
    "- Escreva como uma pessoa da equipe da loja. NUNCA diga que é assistente virtual, robô, IA, bot ou sistema, e nunca use as palavras \"atendente humano\" ou \"humano\". Para passar adiante, fale como colega: \"vou chamar o pessoal da técnica pra ver o valor certinho\" ou \"vou pedir pro meu colega de vendas te passar os valores\".",
    "- Faça no máximo UMA pergunta por mensagem. Não repita perguntas já respondidas na conversa.",
    "- Use o primeiro nome da pessoa quando souber. Pode usar *negrito* do WhatsApp com moderação. Sem listas longas.",
    ctx.persona ? `- Tom pedido pela loja: ${ctx.persona}` : null,
    "",
    "O QUE DESCOBRIR (sem interrogatório; pergunte só o que faltar)",
    "- Interesse: comprar aparelho, conserto/assistência, acessório ou outro.",
    "- Aparelho/modelo (ex.: iPhone 13, Galaxy A54) e, se for conserto, o defeito.",
    "- Urgência e o nome da pessoa (se ainda não souber).",
    "",
    "REGRAS QUE NUNCA PODEM SER QUEBRADAS",
    ...(ctx.stock ? [
      "- NUNCA invente preço, prazo, estoque, parcelamento, garantia ou promoção. Preço e disponibilidade de APARELHOS e ACESSÓRIOS vêm SOMENTE do ESTOQUE AGORA (abaixo), com o valor exato; o resto vem do CONHECIMENTO DA LOJA.",
      "- Item que está no ESTOQUE AGORA: pode dizer que tem e informar o preço exato (aparelho usado/seminovo: diga o estado e a bateria). Ofereça no máximo 3 opções por mensagem.",
      "- Item que NÃO aparece no ESTOQUE AGORA: NÃO diga que não tem (a lista pode não ter pegado). Diga que vai confirmar com o pessoal de vendas e faça a passagem (handoff).",
      "- \"preço a confirmar com vendas\": não informe valor; diga que o pessoal passa o valor.",
      "- Item de outra unidade: diga em qual unidade está e que dá para combinar com o pessoal (retirar lá ou trazer).",
      "- O estoque muda: nunca reserve nem garanta o item. Para fechar, reservar, negociar ou pagar, passe para vendas (handoff).",
      "- Preço de CONSERTO não está no estoque: só informe se estiver no CONHECIMENTO DA LOJA; senão, a técnica confirma (handoff).",
    ] : [
      "- NUNCA invente preço, prazo, estoque, parcelamento, garantia ou promoção. Só informe o que estiver no CONHECIMENTO DA LOJA abaixo, exatamente como está.",
      "- Você NÃO sabe o estoque: nunca responda \"temos sim\" sobre um aparelho, cor ou capacidade. Diga que trabalha com aquele tipo de aparelho e que a disponibilidade o pessoal de vendas confirma.",
      "- Se perguntarem algo que não está no conhecimento (preço, orçamento, disponibilidade), diga que vai pedir pro pessoal da loja confirmar e faça a passagem (handoff).",
    ]),
    "- Não negocie, não prometa nada e não trate reclamação: passe para o atendente.",
    "- Não peça dados sensíveis (CPF, cartão, senha).",
    "",
    "DECISÃO (campo decision)",
    "- reply: continue a conversa com a próxima pergunta ou informação.",
    ctx.stock ? "- A pessoa perguntou preço/disponibilidade de aparelho ou acessório que está no ESTOQUE AGORA e a loja ainda não disse o valor na conversa: decision = reply, com as opções (até 3) e o preço exato de cada uma, e pergunte qual interessa. NÃO faça handoff nessa mensagem; o handoff vem depois, quando ela escolher ou quiser fechar." : null,
    "- handoff: passe para o atendente quando: já souber o interesse E o aparelho/modelo (e já tiver respondido o que estava no estoque); a pessoa pedir um atendente/pessoa; houver reclamação, negociação ou pergunta fora do conhecimento; ou a mensagem for imagem/vídeo/áudio sem transcrição. Áudios transcritos você entende normalmente pelo texto. No handoff, reply = frase curta de transição, como colega de equipe, avisando que o pessoal de vendas ou da técnica vai continuar por aqui, SEM fazer perguntas e sem falar em atendente humano.",
    "- ignore: a conversa NÃO é de cliente (assunto pessoal, fornecedor, entregador, propaganda, spam, engano). Nesse caso reply = \"\" e commercial = false.",
    "",
    "OUTROS CAMPOS",
    "- score: hot (quer comprar/consertar agora), warm (interessado, sem pressa), cold (só pesquisando).",
    "- summary: resumo para o vendedor em 1 ou 2 frases (o que quer, aparelho, defeito, urgência, observações).",
    "- title: título curto do negócio, ex.: \"Troca de tela Galaxy A54\" ou \"iPhone 13 128GB\".",
    "- reason: por que escolheu essa decisão (curto).",
    "",
    "SITUAÇÃO AGORA",
    `- Data/hora: ${when}.`,
    ctx.openNow === null ? null : ctx.openNow ? "- A loja está ABERTA agora." : "- A loja está FECHADA agora. Isso NÃO é motivo para passar para o atendente: continue a conversa normalmente (entenda o interesse, o aparelho e o defeito, responda o que estiver no conhecimento). Avise uma única vez, quando fizer sentido, que valores e agendamento o pessoal confirma quando a loja abrir.",
    ctx.hoursText ? `- Horário de atendimento: ${ctx.hoursText}.` : null,
    ctx.contactName ? `- Nome no WhatsApp: ${ctx.contactName}.` : null,
    ctx.isCustomer ? "- Esta pessoa já é cliente cadastrado da loja." : null,
  ];

  if (ctx.memory?.trim() || ctx.teamNotes?.trim()) {
    lines.push("", "O QUE JÁ SABEMOS DESTA PESSOA (de conversas anteriores; use para não perguntar de novo o que ela já disse. Se ela disser algo diferente agora, vale o que ela disse agora):");
    if (ctx.memory?.trim()) lines.push(`- Resumo: ${ctx.memory.trim().slice(0, 700)}`);
    if (ctx.teamNotes?.trim()) lines.push(`- Anotações da equipe: ${ctx.teamNotes.trim().slice(0, 500)}`);
  }
  if (ctx.contextWarnings?.length) {
    lines.push("", "ATENÇÃO, CONTEXTO INCOMPLETO:");
    for (const w of ctx.contextWarnings) lines.push(`- ${w}`);
    lines.push("- Não presuma o que foi combinado antes. Se a última mensagem da pessoa depender de algo que não aparece na conversa, faça handoff em vez de chutar.");
  }

  if (ctx.serviceOrders.length > 0) {
    lines.push("", "ORDENS DE SERVIÇO DESTA PESSOA (pode informar o status se ela perguntar):");
    for (const o of ctx.serviceOrders) lines.push(`- OS #${o.number} · ${o.device || "aparelho"} · ${OS_STATUS_PT[o.status] ?? o.status}`);
  }

  // exemplos ANTES do conhecimento: o modelo pesa mais o que lê por último,
  // e o conhecimento é que manda (os exemplos podem estar velhos ou contradizer)
  if (ctx.examples?.length) {
    lines.push("", "EXEMPLOS REAIS DE COMO A LOJA RESPONDE (use SÓ para o jeito de falar. NÃO tire deles nenhuma informação: endereço, unidades, garantia, prazos, preços e condições vêm SOMENTE do CONHECIMENTO DA LOJA; os exemplos podem estar desatualizados ou ser de outra unidade):");
    for (const e of ctx.examples.slice(0, 5)) {
      lines.push(`- Cliente: "${(e.question ?? "").slice(0, 300)}"`, `  Loja: "${e.answer.slice(0, 500)}"`);
    }
  }
  if (ctx.stock) {
    lines.push("", "ESTOQUE AGORA (à venda, preço de venda; só os itens que parecem com a conversa):", ...ctx.stock);
  }
  lines.push("", "CONHECIMENTO DA LOJA (única fonte de informações; se um exemplo acima disser diferente, vale o que está aqui):", ctx.knowledge?.trim() || "(a loja ainda não cadastrou informações: não informe preços, endereço nem horários além do que está acima)");
  if (ctx.knowledge?.trim()) {
    lines.push("- Pergunta sobre endereço, horário, pagamento, garantia ou prazo: responda com os dados exatos do conhecimento acima (endereço completo, números exatos). Não acrescente nada que não esteja escrito nele.");
  }
  if (ctx.handoffMessage) lines.push("", `Frase de transição preferida pela loja: "${ctx.handoffMessage}"`);
  lines.push("", "Responda SOMENTE com o JSON pedido.");
  return lines.filter((l): l is string => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

const MEDIA_LABEL: Record<string, string> = {
  image: "[a pessoa enviou uma imagem]", audio: "[a pessoa enviou um áudio]", video: "[a pessoa enviou um vídeo]",
  document: "[a pessoa enviou um documento]", sticker: "[figurinha]",
};

/** Conversa → turnos do modelo (cliente = user; loja/IA = model). Junta mensagens seguidas do mesmo lado. */
export function toTurns(messages: TranscriptMessage[], limit = 30): { role: "user" | "model"; text: string }[] {
  const out: { role: "user" | "model"; text: string }[] = [];
  for (const m of messages.slice(-limit)) {
    if (m.kind === "note" || m.sender_kind === "system") continue;
    const role = m.direction === "in" ? "user" : "model";
    const heard = m.kind === "audio" && m.transcript?.trim() ? m.transcript.trim() : null;
    const media = heard
      ? (m.direction === "in" ? `[áudio da pessoa, transcrito]: ${heard}` : `[áudio enviado pela loja, transcrito]: ${heard}`)
      : m.kind !== "text" ? MEDIA_LABEL[m.kind] ?? `[${m.kind}]` : null;
    const body = (m.body ?? "").trim();
    const text = [media, body && !/^\[(Imagem|Áudio|Vídeo|Documento|Figurinha)\]$/i.test(body) ? body : null].filter(Boolean).join(" ");
    if (!text) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.text += `\n${text}`;
    else out.push({ role, text });
  }
  while (out.length && out[0].role === "model") out.shift(); // a conversa para o modelo começa pelo cliente
  return out;
}

const s = (v: unknown) => (typeof v === "string" && v.trim() && !/^(null|unknown|n\/a|-)$/i.test(v.trim()) ? v.trim() : null);

/** Lê a resposta do modelo de forma tolerante. Resposta inválida vira passagem para o humano. */
export function parseDecision(raw: unknown): AgentDecision {
  let o: Record<string, unknown> | null = null;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try { o = JSON.parse(cleaned); } catch { o = null; }
  } else if (raw && typeof raw === "object") o = raw as Record<string, unknown>;

  if (!o) {
    return {
      decision: "handoff", reply: "", commercial: true, interest: null, device_model: null, defect: null, urgency: null,
      customer_name: null, score: "warm", summary: "A IA não conseguiu interpretar a conversa.", title: "", reason: "resposta inválida da IA",
    };
  }
  const decision = (["reply", "handoff", "ignore"] as const).includes(o.decision as Decision) ? (o.decision as Decision) : "handoff";
  const interest = (["device", "repair", "accessory", "other"] as const).includes(o.interest as Interest) ? (o.interest as Interest) : null;
  const score = (["hot", "warm", "cold"] as const).includes(o.score as Score) ? (o.score as Score) : "warm";
  return {
    decision,
    reply: String(o.reply ?? "").trim(),
    commercial: o.commercial !== false,
    interest,
    device_model: s(o.device_model),
    defect: s(o.defect),
    urgency: s(o.urgency),
    customer_name: s(o.customer_name),
    score,
    summary: String(o.summary ?? "").trim(),
    title: String(o.title ?? "").trim().slice(0, 120),
    reason: s(o.reason),
  };
}

// limites de palavra com acento (\b não entende "robô")
const ASKS_HUMAN = /(?<!\p{L})(atendente|humano|pessoa de verdade|falar com (algu[eé]m|uma pessoa|o dono|vendedor|t[eé]cnico)|vendedor|gerente)(?!\p{L})/iu;
// "ia" sozinho não serve ("eu ia passar aí"), "máquina" também não ("passa na máquina?")
const ASKS_BOT = /(?<!\p{L})(rob[oô]|bot|chatbot|intelig[eê]ncia artificial|(é|eh|e|sendo|com) (uma )?ia|resposta autom[aá]tica)(?!\p{L})/iu;
// frase de passagem precisa dizer que alguém da loja continua
const HANDS_OVER = /(atendente|colega|pessoal|equipe|t[eé]cnic|vendedor|vendas|consultor|chama|retorn|continu|responde)/i;
const REVEALS_BOT = /(?<!\p{L})(assistente virtual|atendente virtual|rob[oô]|chatbot|bot|intelig[eê]ncia artificial|sou (uma|um) ia|atendente humano|um humano)(?!\p{L})/iu;
const REVEALS_BOT_SENTENCE = /[^.!?]*(?<!\p{L})(assistente virtual|atendente virtual|rob[oô]|chatbot|bot|intelig[eê]ncia artificial|sou (uma|um) ia|atendente humano|um humano)(?!\p{L})[^.!?]*[.!?]?\s*/giu;

export interface GuardInput {
  aiRepliesSoFar: number;
  maxTurns: number;
  lastInbound: TranscriptMessage | null;
}

/** Travas finais, independentes do que o modelo decidiu. */
export function applyGuards(d: AgentDecision, g: GuardInput): AgentDecision {
  const out = { ...d };
  const heard = g.lastInbound?.kind === "audio" ? (g.lastInbound.transcript ?? "").trim() : "";
  const lastText = heard || (g.lastInbound?.body ?? "").trim();
  // áudio transcrito conta como texto; só mídia que a IA não entende vai para o humano
  const mediaOnly = Boolean(g.lastInbound && g.lastInbound.kind !== "text" && !heard && !/[a-z]{3}/i.test(lastText.replace(/^\[.*?\]$/, "")));

  if (out.decision !== "ignore") {
    if (ASKS_BOT.test(lastText)) {
      // perguntou se é robô: não nega nem confirma; a equipe assume com a frase padrão de passagem
      out.decision = "handoff"; out.reason = "perguntou se é robô"; out.reply = "";
    } else if (ASKS_HUMAN.test(lastText)) { out.decision = "handoff"; out.reason = out.reason ?? "pediu atendente"; }
    else if (mediaOnly && out.decision === "reply") { out.decision = "handoff"; out.reason = "mensagem em áudio/imagem"; }
    else if (out.decision === "reply" && g.aiRepliesSoFar >= g.maxTurns) { out.decision = "handoff"; out.reason = "limite de mensagens da IA"; }
    else if (out.decision === "reply" && !out.reply) { out.decision = "handoff"; out.reason = out.reason ?? "IA sem resposta"; }
  }
  if (out.decision === "ignore") out.reply = "";
  // na passagem para o atendente não se pergunta nada (quem continua é a pessoa da loja)
  if (out.decision === "handoff" && out.reply.includes("?")) {
    out.reply = out.reply.split(/(?<=[.!?])\s+/).filter((s) => !s.trim().endsWith("?")).join(" ").trim();
    // sobrou só "Entendi, anotado aqui!": sem dizer que alguém vai continuar, usa a frase padrão
    if (!HANDS_OVER.test(out.reply)) out.reply = "";
  }
  // a IA não se revela, mesmo que o modelo escorregue
  if (REVEALS_BOT.test(out.reply)) out.reply = out.decision === "handoff" ? "" : out.reply.replace(REVEALS_BOT_SENTENCE, "").trim();
  if (out.decision === "reply" && !out.reply) { out.decision = "handoff"; out.reason = out.reason ?? "IA sem resposta"; }
  out.reply = out.reply.slice(0, 1000);
  if (!out.summary) out.summary = [out.title, out.defect, out.urgency].filter(Boolean).join(" · ") || "Contato pelo WhatsApp.";
  return out;
}

// ---------------- trava de contexto ----------------

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
// palavras que, sozinhas, só confirmam ("ok", "obrigada", "blz")
const ACK_CORE = new Set(["ok", "okay", "okey", "okk", "blz", "beleza", "obrigado", "obrigada", "obrigadao", "obrigadas", "obrigados", "obg", "brigado", "brigada", "valeu", "vlw", "certo", "perfeito", "show", "combinado", "entendi", "fechado", "otimo", "joia", "top", "massa"]);
// palavras que podem acompanhar a confirmação sem mudar o sentido
const ACK_FILLER = new Set(["amigo", "amiga", "mano", "moco", "moca", "irmao", "querido", "querida", "sim", "entao", "ta", "tah", "bom", "boa", "tarde", "noite", "dia", "muito", "mt", "mto", "ai", "viu", "e", "ate", "mais", "depois", "logo", "amanha", "flw", "tchau", "deus", "abencoe", "vc", "voce", "tbm", "tambem", "pra", "por", "tudo", "bem", "de", "nada", "aguardo", "kk", "kkk", "kkkk", "rs", "haha", "hehe", "sr", "sra", "senhor", "senhora"]);

/** "Ok", "Ok amigo boa tarde", "Obrigada!", "👍": só confirma, não pede nada. */
export function isAcknowledgement(text: string | null | undefined): boolean {
  const raw = (text ?? "").trim();
  if (!raw || raw.includes("?")) return false;
  const noEmoji = raw.replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u200d\ufe0f]/gu, " ").trim();
  if (!noEmoji) return true; // só emoji (👍🙏)
  const words = fold(noEmoji).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean)
    .map((w) => (/^(k{2,}|(ha){2,}|(he){2,}|rs+)$/.test(w) ? "kk" : w.replace(/^o?k+$/, "ok")));
  if (!words.length || words.length > 8) return false;
  return words.some((w) => ACK_CORE.has(w)) && words.every((w) => ACK_CORE.has(w) || ACK_FILLER.has(w));
}

export interface ContextCheck {
  /** Não responder nem sugerir sozinho (motivo) */
  skip: string | null;
  /** Motivos para só sugerir, nunca enviar sozinho */
  draftOnly: string[];
  /** Avisos que vão para o prompt */
  warnings: string[];
}

const LATE_MS = 10 * 60_000;
const HUMAN_RECENT_MS = 12 * 3600_000;
const LATE_WINDOW_MS = 3 * 24 * 3600_000;

/**
 * Antes de a IA responder: a conversa tem contexto suficiente?
 * - só "ok/obrigado" do cliente → não responde (não há o que responder);
 * - mensagens sincronizadas depois, ou conversa que começou antes do CRM → só sugere e avisa o modelo;
 * - alguém da equipe respondeu nas últimas 12 h → só sugere (a pessoa está atendendo).
 * messages em ordem cronológica; hasOlder = há mensagens mais antigas que não vieram na lista.
 */
export function checkContext(messages: TranscriptMessage[], opts: { now?: Date; hasOlder?: boolean } = {}): ContextCheck {
  const now = (opts.now ?? new Date()).getTime();
  const out: ContextCheck = { skip: null, draftOnly: [], warnings: [] };
  const list = messages.filter((m) => m.kind !== "note" && m.sender_kind !== "system");
  if (!list.length) return out;

  // o que o cliente mandou desde a última mensagem da loja
  let i = list.length;
  while (i > 0 && list[i - 1].direction === "in") i--;
  const burst = list.slice(i);
  const textOf = (m: TranscriptMessage) => (m.kind === "audio" ? m.transcript : m.kind === "text" ? m.body : null);
  if (burst.length && burst.every((m) => (m.kind === "text" || (m.kind === "audio" && m.transcript)) && isAcknowledgement(textOf(m)))) {
    out.skip = "o cliente só confirmou (ok/obrigado)";
  }

  const late = list.some((m) => {
    if (!m.created_at || !m.inserted_at) return false;
    const c = Date.parse(m.created_at), ins = Date.parse(m.inserted_at);
    return ins - c > LATE_MS && now - c < LATE_WINDOW_MS;
  });
  if (late) {
    out.draftOnly.push("histórico sincronizado depois");
    out.warnings.push("Parte desta conversa entrou no sistema depois (sincronização): pode haver mensagens faltando.");
  }

  const first = list[0];
  if (!opts.hasOlder && first.direction === "in" && isAcknowledgement(textOf(first))) {
    out.draftOnly.push("conversa começou antes do CRM");
    out.warnings.push("A conversa começou antes de entrar no sistema: o começo dela não aparece aqui.");
  }

  const humanRecent = list.some((m) => m.direction === "out" && m.sender_kind === "user" && m.created_at && now - Date.parse(m.created_at) < HUMAN_RECENT_MS);
  if (humanRecent) out.draftOnly.push("a equipe respondeu nas últimas 12 h");

  return out;
}

export function defaultHandoffMessage(name: string | null, openNow: boolean | null): string {
  const first = name ? ` ${name.split(/\s+/)[0]}` : "";
  return openNow === false
    ? `Show${first}! Já anotei tudo aqui. Vou passar pro pessoal e assim que a loja abrir eles te chamam por aqui mesmo. 🙏`
    : `Show${first}! Já anotei tudo aqui. Vou passar pro pessoal e já já eles te chamam por aqui mesmo. 🙏`;
}

// ------------------------------------------------------------------ aprendizado

/** Esconde telefone, e-mail e CPF antes de mandar texto para a IA. */
export function maskPersonalData(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[cpf]")
    .replace(/(\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}\b/g, "[telefone]")
    .replace(/\b\d{10,14}\b/g, "[número]"); // qualquer sequência longa que sobrar (CPF sem pontos, etc.)
}

export interface HistoryLine { fromMe: boolean; text: string; at: number }

/** Conversa antiga → texto compacto para extração (só texto, mascarado, últimas linhas). */
export function historyTranscript(lines: HistoryLine[], opts: { maxLines?: number; maxChars?: number } = {}): string | null {
  const maxLines = opts.maxLines ?? 60;
  const maxChars = opts.maxChars ?? 6000;
  const clean = lines
    .filter((l) => l.text && l.text.trim())
    .sort((a, b) => a.at - b.at)
    .map((l) => `${l.fromMe ? "Loja" : "Cliente"}: ${maskPersonalData(l.text.trim().replace(/\s+/g, " ")).slice(0, 400)}`);
  const fromStore = lines.filter((l) => l.fromMe && l.text?.trim()).length;
  const fromClient = lines.filter((l) => !l.fromMe && l.text?.trim()).length;
  if (fromStore < 1 || fromClient < 1 || clean.length < 3) return null; // sem troca real, nada a aprender
  let out = clean.slice(-maxLines);
  while (out.join("\n").length > maxChars && out.length > 3) out = out.slice(1);
  return out.join("\n");
}

export const LEARN_SCHEMA = {
  type: "OBJECT",
  properties: {
    commercial: { type: "BOOLEAN" },
    pairs: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { topic: { type: "STRING" }, question: { type: "STRING" }, answer: { type: "STRING" } },
        required: ["question", "answer"],
      },
    },
    facts: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { topic: { type: "STRING" }, fact: { type: "STRING" } }, required: ["fact"] },
    },
  },
  required: ["commercial", "pairs", "facts"],
};

export function learnSystemPrompt(storeName: string): string {
  return [
    `Você analisa conversas antigas de WhatsApp da loja "${storeName}" (celulares, acessórios e assistência técnica) para treinar o atendente virtual.`,
    "Extraia SOMENTE o que for útil e reaproveitável em outros atendimentos:",
    "- pairs: perguntas típicas de cliente e a resposta que a LOJA deu (reescreva de forma genérica, sem nomes, sem dados pessoais, sem combinados específicos daquele cliente). No máximo 4 por conversa. Ignore cumprimentos soltos.",
    "- facts: informações da loja ditas pela equipe (endereço, horário, formas de pagamento, parcelamento, garantia, prazos de conserto, serviços que faz ou não faz, entrega, preços com o produto/serviço). Uma frase curta por fato.",
    "- commercial = false se a conversa não for com cliente (pessoal, fornecedor, entregador, spam). Nesse caso pairs e facts vazios.",
    "Nunca invente nada que não esteja na conversa. Responda só com o JSON.",
  ].join("\n");
}

export function knowledgeDraftPrompt(storeName: string): string {
  return [
    `Organize os fatos abaixo, extraídos de conversas da loja "${storeName}", num texto curto de "conhecimento da loja" para o atendente virtual.`,
    "Agrupe por tema (Endereço, Horário, Pagamento, Garantia, Serviços, Prazos, Entrega, Preços). Quando houver fatos contraditórios, fique com o mais frequente e marque com (confirmar).",
    "Preços: liste à parte em \"Preços citados nas conversas (confirmar antes de usar)\".",
    "Não invente nada. Responda em texto simples, em português, sem markdown pesado.",
  ].join("\n");
}

export interface BusinessHours { enabled?: boolean; start?: string; end?: string; days?: number[] }

/** A loja está aberta agora? null quando o horário não foi configurado. */
export function isOpenNow(h: BusinessHours | null | undefined, now = new Date()): boolean | null {
  if (!h?.enabled || !h.start || !h.end) return null;
  const local = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const days = h.days?.length ? h.days : [1, 2, 3, 4, 5, 6];
  if (!days.includes(local.getDay())) return false;
  const mins = local.getHours() * 60 + local.getMinutes();
  const [sh, sm] = h.start.split(":").map(Number);
  const [eh, em] = h.end.split(":").map(Number);
  return mins >= sh * 60 + (sm || 0) && mins < eh * 60 + (em || 0);
}

const DAY_PT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
export function hoursText(h: BusinessHours | null | undefined): string | null {
  if (!h?.enabled || !h.start || !h.end) return null;
  const days = (h.days?.length ? h.days : [1, 2, 3, 4, 5, 6]).slice().sort();
  return `${days.map((d) => DAY_PT[d]).join(", ")} das ${h.start} às ${h.end}`;
}
