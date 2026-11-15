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
    `Você é o assistente virtual da loja "${ctx.storeName}" (celulares, acessórios e assistência técnica) no WhatsApp.`,
    `Seu objetivo é atender o primeiro contato, entender o que a pessoa precisa e passar para um atendente humano com tudo anotado. Você NÃO fecha venda.`,
    "",
    "COMO ESCREVER",
    "- Português do Brasil, simpático e direto, como um bom vendedor de loja. Mensagens curtas (no máximo 3 frases).",
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
    "- NUNCA invente preço, prazo, estoque, parcelamento, garantia ou promoção. Só informe o que estiver no CONHECIMENTO DA LOJA abaixo, exatamente como está.",
    "- Se perguntarem algo que não está no conhecimento (preço, orçamento, disponibilidade), diga que um atendente vai confirmar e faça a passagem (handoff).",
    "- Não negocie, não prometa nada e não trate reclamação: passe para o atendente.",
    "- Não peça dados sensíveis (CPF, cartão, senha).",
    "",
    "DECISÃO (campo decision)",
    "- reply: continue a conversa com a próxima pergunta ou informação.",
    "- handoff: passe para o atendente quando: já souber o interesse E o aparelho/modelo; a pessoa pedir um atendente/pessoa; houver reclamação, negociação ou pergunta fora do conhecimento; ou a mensagem for áudio/imagem que você não consegue entender. No handoff, reply = frase curta de transição avisando que um atendente vai continuar, SEM fazer perguntas.",
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
    ctx.openNow === null ? null : ctx.openNow ? "- A loja está ABERTA agora." : "- A loja está FECHADA agora: avise que um atendente responde no próximo horário de atendimento.",
    ctx.hoursText ? `- Horário de atendimento: ${ctx.hoursText}.` : null,
    ctx.contactName ? `- Nome no WhatsApp: ${ctx.contactName}.` : null,
    ctx.isCustomer ? "- Esta pessoa já é cliente cadastrado da loja." : null,
  ];

  if (ctx.serviceOrders.length > 0) {
    lines.push("", "ORDENS DE SERVIÇO DESTA PESSOA (pode informar o status se ela perguntar):");
    for (const o of ctx.serviceOrders) lines.push(`- OS #${o.number} · ${o.device || "aparelho"} · ${OS_STATUS_PT[o.status] ?? o.status}`);
  }

  lines.push("", "CONHECIMENTO DA LOJA (única fonte de informações):", ctx.knowledge?.trim() || "(a loja ainda não cadastrou informações: não informe preços, endereço nem horários além do que está acima)");
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
    const media = m.kind !== "text" ? MEDIA_LABEL[m.kind] ?? `[${m.kind}]` : null;
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
const ASKS_HUMAN = /(?<!\p{L})(atendente|humano|pessoa de verdade|falar com (algu[eé]m|uma pessoa|o dono|vendedor|t[eé]cnico)|vendedor|gerente|rob[oô])(?!\p{L})/iu;

export interface GuardInput {
  aiRepliesSoFar: number;
  maxTurns: number;
  lastInbound: TranscriptMessage | null;
}

/** Travas finais, independentes do que o modelo decidiu. */
export function applyGuards(d: AgentDecision, g: GuardInput): AgentDecision {
  const out = { ...d };
  const lastText = (g.lastInbound?.body ?? "").trim();
  const mediaOnly = Boolean(g.lastInbound && g.lastInbound.kind !== "text" && !/[a-z]{3}/i.test(lastText.replace(/^\[.*?\]$/, "")));

  if (out.decision !== "ignore") {
    if (ASKS_HUMAN.test(lastText)) { out.decision = "handoff"; out.reason = out.reason ?? "pediu atendente"; }
    else if (mediaOnly && out.decision === "reply") { out.decision = "handoff"; out.reason = "mensagem em áudio/imagem"; }
    else if (out.decision === "reply" && g.aiRepliesSoFar >= g.maxTurns) { out.decision = "handoff"; out.reason = "limite de mensagens da IA"; }
    else if (out.decision === "reply" && !out.reply) { out.decision = "handoff"; out.reason = out.reason ?? "IA sem resposta"; }
  }
  if (out.decision === "ignore") out.reply = "";
  out.reply = out.reply.slice(0, 1000);
  if (!out.summary) out.summary = [out.title, out.defect, out.urgency].filter(Boolean).join(" · ") || "Contato pelo WhatsApp.";
  return out;
}

export function defaultHandoffMessage(name: string | null, openNow: boolean | null): string {
  const first = name ? ` ${name.split(/\s+/)[0]}` : "";
  return openNow === false
    ? `Obrigado${first}! Já anotei tudo. Um atendente vai continuar com você assim que a loja abrir. 🙏`
    : `Obrigado${first}! Já anotei tudo e um atendente vai continuar com você em instantes. 🙏`;
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
