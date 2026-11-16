import { describe, it, expect } from "vitest";
import { checkWebhookAuth, safeEqual, WEBHOOK_SECRET_HEADER } from "../../../supabase/functions/whatsapp-webhook/auth.ts";
import { isDirectChat, mapAckStatus, mediaExt, mediaMime, parseMessageBody, resolveContactJid, resolveTimestamp } from "../../../supabase/functions/whatsapp-webhook/parse.ts";

const headers = (h: Record<string, string>) => new Headers(h);

describe("whatsapp-webhook — autenticação (x-evolution-webhook-secret)", () => {
  const TEST_SECRET = "super_secret_evolution_webhook_key_1234567890_32bytes";

  it("recusa tudo (500) quando EVOLUTION_WEBHOOK_SECRET não está configurado", () => {
    const r = checkWebhookAuth(headers({ [WEBHOOK_SECRET_HEADER]: TEST_SECRET }), undefined);
    expect(r).toEqual({ ok: false, status: 500, error: "Webhook indisponível" });
  });

  it("recusa (401) sem o header", () => {
    expect(checkWebhookAuth(headers({}), TEST_SECRET)).toMatchObject({ ok: false, status: 401 });
  });

  it("recusa (401) com segredo errado", () => {
    expect(checkWebhookAuth(headers({ [WEBHOOK_SECRET_HEADER]: "errado" }), TEST_SECRET)).toMatchObject({ ok: false, status: 401 });
  });

  it("aceita com o segredo correto", () => {
    expect(checkWebhookAuth(headers({ [WEBHOOK_SECRET_HEADER]: TEST_SECRET }), TEST_SECRET)).toEqual({ ok: true });
  });

  it("safeEqual compara exatamente", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("whatsapp-webhook — interpretação da mensagem", () => {
  it("texto simples e texto estendido", () => {
    expect(parseMessageBody({ message: { conversation: "Oi" } })).toEqual({ kind: "text", content: "Oi" });
    expect(parseMessageBody({ message: { extendedTextMessage: { text: "Link" } } })).toEqual({ kind: "text", content: "Link" });
  });

  it("imagem com legenda e mime", () => {
    const p = parseMessageBody({ message: { imageMessage: { caption: "tela", mimetype: "image/png" } }, base64: "AAA" });
    expect(p).toMatchObject({ kind: "image", content: "tela", mimeType: "image/png", base64: "AAA" });
  });

  it("áudio", () => {
    expect(parseMessageBody({ message: { audioMessage: {} } })).toMatchObject({ kind: "audio", content: "[Áudio]" });
  });

  it("ignora reação, protocolo e corpo vazio (não criam lead nem marcam não lido)", () => {
    expect(parseMessageBody({ message: { reactionMessage: { text: "👍" } } })).toBeNull();
    expect(parseMessageBody({ message: { protocolMessage: { type: 0 } } })).toBeNull();
    expect(parseMessageBody({ message: { conversation: "   " } })).toBeNull();
    expect(parseMessageBody({})).toBeNull();
  });

  it("vídeo, documento e figurinha viram texto descritivo", () => {
    expect(parseMessageBody({ message: { videoMessage: {} } })).toMatchObject({ kind: "video", content: "[Vídeo]" });
    expect(parseMessageBody({ message: { documentMessage: { fileName: "nota.pdf" } } })).toMatchObject({ kind: "document", content: "nota.pdf" });
    expect(parseMessageBody({ message: { stickerMessage: {} } })).toMatchObject({ kind: "sticker" });
  });

  it("só aceita conversa privada", () => {
    expect(isDirectChat({ remoteJid: "5587999999999@s.whatsapp.net" })).toBe(true);
    expect(isDirectChat({ remoteJid: "1203630@g.us" })).toBe(false);
    expect(isDirectChat({ remoteJid: "status@broadcast" })).toBe(false);
    expect(isDirectChat({ remoteJid: "123@newsletter" })).toBe(false);
    expect(isDirectChat({ remoteJid: "5587999999999@s.whatsapp.net", participant: "x" })).toBe(false);
  });

  it("conta com identificador oculto (@lid) usa o número alternativo", () => {
    expect(resolveContactJid({ remoteJid: "123456789@lid", remoteJidAlt: "5587999112233@s.whatsapp.net" })).toBe("5587999112233@s.whatsapp.net");
    expect(resolveContactJid({ remoteJid: "123456789@lid", senderPn: "5587999112233@s.whatsapp.net" })).toBe("5587999112233@s.whatsapp.net");
    expect(resolveContactJid({ remoteJid: "123456789@lid" })).toBeNull();
    expect(resolveContactJid({ remoteJid: "1203630@g.us", participant: "5587999112233@s.whatsapp.net" })).toBeNull();
  });

  it("status de entrega", () => {
    expect(mapAckStatus("SERVER_ACK")).toBe("sent");
    expect(mapAckStatus("DELIVERY_ACK")).toBe("delivered");
    expect(mapAckStatus("READ")).toBe("read");
    expect(mapAckStatus(4)).toBe("read");
    expect(mapAckStatus("PENDING")).toBeNull();
  });

  it("timestamp em segundos, Long e inválido", () => {
    expect(resolveTimestamp(1730332148)).toBe(new Date(1730332148 * 1000).toISOString());
    expect(resolveTimestamp({ low: 1730332148, high: 0 })).toBe(new Date(1730332148 * 1000).toISOString());
    const fb = new Date("2026-01-01T00:00:00Z");
    expect(resolveTimestamp("lixo", fb)).toBe(fb.toISOString());
    expect(resolveTimestamp(undefined, fb)).toBe(fb.toISOString());
  });

  it("mídia: mime aceito pelo bucket crm_media e extensão", () => {
    expect(mediaMime("audio/ogg; codecs=opus", "audio")).toBe("audio/ogg");
    expect(mediaMime("IMAGE/PNG", "image")).toBe("image/png");
    expect(mediaMime("application/octet-stream", "audio")).toBe("audio/ogg");
    expect(mediaMime(undefined, "image")).toBe("image/jpeg");
    expect(mediaExt("audio/ogg")).toBe("ogg");
    expect(mediaExt("image/jpeg")).toBe("jpg");
  });
});
