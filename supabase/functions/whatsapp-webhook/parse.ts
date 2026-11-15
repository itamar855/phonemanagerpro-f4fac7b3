// Extração do conteúdo de uma mensagem da Evolution API.
// Módulo puro (sem imports de Deno) para ser testado pelo Vitest.

export type ParsedKind = "text" | "image" | "audio" | "video" | "document" | "sticker";

export interface ParsedMessage {
  kind: ParsedKind;
  content: string;
  /** Mime type da mídia, quando houver */
  mimeType?: string;
  /** base64 embutido no payload, quando a Evolution envia */
  base64?: string;
}

/**
 * Retorna null para eventos que não são mensagens de conversa
 * (reações, mensagens de protocolo/apagadas, enquetes etc.). Esses eventos
 * não devem criar lead nem marcar a conversa como não lida.
 */
export function parseMessageBody(message: any, payload?: any): ParsedMessage | null {
  const body = message?.message;
  if (!body || typeof body !== "object") return null;

  const text = body.conversation || body.extendedTextMessage?.text;
  if (typeof text === "string" && text.trim()) {
    return { kind: "text", content: text };
  }

  const embedded = (m: any) => message?.base64 || m?.base64 || payload?.base64 || undefined;

  if (body.imageMessage) {
    return {
      kind: "image",
      content: body.imageMessage.caption || "[Imagem]",
      mimeType: body.imageMessage.mimetype || "image/jpeg",
      base64: embedded(body.imageMessage),
    };
  }
  if (body.audioMessage) {
    return {
      kind: "audio",
      content: "[Áudio]",
      mimeType: body.audioMessage.mimetype || "audio/ogg",
      base64: embedded(body.audioMessage),
    };
  }
  if (body.videoMessage) {
    return { kind: "video", content: body.videoMessage.caption || "[Vídeo]" };
  }
  if (body.documentMessage || body.documentWithCaptionMessage) {
    const doc = body.documentMessage || body.documentWithCaptionMessage?.message?.documentMessage;
    return { kind: "document", content: doc?.caption || doc?.fileName || "[Documento]" };
  }
  if (body.stickerMessage) {
    return { kind: "sticker", content: "[Figurinha]" };
  }
  return null;
}

/** Timestamp da Evolution (segundos Unix, número/string/Long) → ISO. */
export function resolveTimestamp(raw: unknown, fallback = new Date()): string {
  if (raw === null || raw === undefined) return fallback.toISOString();
  const n = typeof raw === "object" && raw !== null && "low" in (raw as any) ? Number((raw as any).low) : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback.toISOString();
  const ms = n < 100000000000 ? n * 1000 : n;
  return new Date(ms).toISOString();
}

const PHONE_JID = /^\d{8,15}@s\.whatsapp\.net$/;

/**
 * jid de telefone da conversa privada, ou null para grupos, transmissões, canais e status.
 * Contas com identificador oculto (@lid) trazem o número em remoteJidAlt/senderPn.
 */
export function resolveContactJid(key: any): string | null {
  const jid: string = key?.remoteJid || "";
  if (key?.participant && !jid.endsWith("@lid")) return null;
  if (PHONE_JID.test(jid)) return jid;
  if (jid.endsWith("@lid")) {
    for (const alt of [key?.remoteJidAlt, key?.senderPn, key?.participantAlt]) {
      if (typeof alt === "string" && PHONE_JID.test(alt)) return alt;
    }
  }
  return null;
}

/** Só conversas privadas com pessoas: sem grupos, transmissões, canais ou status. */
export function isDirectChat(key: any): boolean {
  return resolveContactJid(key) !== null;
}

/** Status de entrega da Evolution → status do CRM. */
export function mapAckStatus(raw: unknown): "sent" | "delivered" | "read" | null {
  const s = String(raw ?? "").toUpperCase();
  if (s === "SERVER_ACK" || s === "2") return "sent";
  if (s === "DELIVERY_ACK" || s === "3") return "delivered";
  if (s === "READ" || s === "PLAYED" || s === "4" || s === "5") return "read";
  return null;
}
