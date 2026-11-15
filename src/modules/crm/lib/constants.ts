import type { Channel, Interest, OriginChannel } from "./types";

export const INTEREST_LABEL: Record<Interest, string> = {
  device: "Aparelho",
  repair: "Conserto",
  accessory: "Acessório",
  other: "Outro",
};

export const LOST_REASONS = [
  "Achou mais barato",
  "Comprou em outro lugar",
  "Parou de responder",
  "Desistiu da compra",
  "Sem o produto em estoque",
  "Conserto não compensa",
];

/** Cor da etapa (nome salvo no banco) → classes com contraste nos dois temas. */
export const STAGE_DOT: Record<string, string> = {
  pink: "bg-pink-500", amber: "bg-amber-500", green: "bg-emerald-500", blue: "bg-sky-500",
  emerald: "bg-emerald-600", slate: "bg-slate-400", violet: "bg-violet-500",
};

export const TASK_KIND_LABEL: Record<string, string> = {
  follow_up: "Retorno",
  call: "Ligação",
  reply: "Sem resposta",
  stale_deal: "Negócio parado",
  os_ready: "OS pronta",
  review: "Avaliação",
  warranty: "Garantia",
  ig_followup: "Instagram → WhatsApp",
};

export const CHANNEL_LABEL: Record<Channel, string> = { whatsapp: "WhatsApp", instagram: "Instagram" };

export const ORIGIN_LABEL: Record<OriginChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  manual: "Manual",
  os_vendas: "OS / Vendas",
  import: "Importado",
};
