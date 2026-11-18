// Parte pura do aviso no celular (texto e destino do push). Testada no Vitest.

export interface PushPayload { title: string; body: string; url: string; tag: string }

const MEDIA_PREVIEW: Record<string, string> = {
  image: "📷 Foto", audio: "🎤 Áudio", video: "🎬 Vídeo", document: "📄 Documento", sticker: "Figurinha",
};

/** "Nome · Loja" no título; prévia curta da mensagem no corpo; tocar abre a conversa no CRM. */
export function buildPushPayload(args: {
  conversationId: string; contactName: string | null; storeLabel: string | null; kind: string; body: string | null; channel: string;
}): PushPayload {
  const name = (args.contactName ?? "").trim() || "Cliente";
  const title = args.storeLabel ? `${name} · ${args.storeLabel}` : name;
  let text = (args.body ?? "").replace(/\s+/g, " ").trim();
  if (args.kind !== "text" || !text || /^\[.*\]$/.test(text)) text = MEDIA_PREVIEW[args.kind] ?? (text || "Nova mensagem");
  if (text.length > 120) text = `${text.slice(0, 117)}…`;
  if (args.channel === "instagram") text = `Instagram: ${text}`;
  return { title, body: text, url: `/crm/inbox/${args.conversationId}`, tag: `crm-${args.conversationId}` };
}

/** "Restaura Phone Brasil (Santa Luzia)" → "Santa Luzia" (mesma regra da tela). */
export function storeShortName(name: string | null | undefined): string | null {
  const n = (name ?? "").trim();
  if (!n) return null;
  return (n.match(/\(([^)]+)\)\s*$/)?.[1] ?? n).trim();
}

/** Push que o serviço recusou de vez (aparelho desinstalou / inscrição expirou): apagar. */
export const isGoneStatus = (status: number | undefined) => status === 404 || status === 410;
