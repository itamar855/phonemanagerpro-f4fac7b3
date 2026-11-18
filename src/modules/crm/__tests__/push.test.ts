import { describe, expect, it } from "vitest";
import { isIos, pushSupport, urlBase64ToUint8Array, type PushEnv } from "../lib/push";
import { buildPushPayload, isGoneStatus, storeShortName } from "../../../../supabase/functions/_shared/push-core";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-A346M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const env = (p: Partial<PushEnv>): PushEnv => ({ userAgent: ANDROID, standalone: false, hasServiceWorker: true, hasPushManager: true, hasNotification: true, ...p });

describe("avisos no celular — aparelho", () => {
  it("Android/PC com as APIs: ok", () => {
    expect(pushSupport(env({}))).toBe("ok");
    expect(pushSupport(env({ hasPushManager: false }))).toBe("unsupported");
  });

  it("iPhone só com o app instalado na Tela de Início", () => {
    expect(isIos(IPHONE)).toBe(true);
    expect(pushSupport(env({ userAgent: IPHONE, hasPushManager: false }))).toBe("ios-install");
    expect(pushSupport(env({ userAgent: IPHONE, standalone: true }))).toBe("ok");
  });

  it("chave VAPID base64url vira bytes", () => {
    expect([...urlBase64ToUint8Array("AQID_-8")]).toEqual([1, 2, 3, 255, 239]);
  });
});

describe("avisos no celular — conteúdo", () => {
  const base = { conversationId: "c1", contactName: "Maria", storeLabel: "Santa Luzia", kind: "text", body: "oi, tem capinha?", channel: "whatsapp" };

  it("título com a loja, corpo com a prévia, toque abre a conversa", () => {
    expect(buildPushPayload(base)).toEqual({ title: "Maria · Santa Luzia", body: "oi, tem capinha?", url: "/crm/inbox/c1", tag: "crm-c1" });
  });

  it("mídia vira rótulo; texto longo é cortado; Instagram identificado; sem nome = Cliente", () => {
    expect(buildPushPayload({ ...base, kind: "audio", body: "[Áudio]" }).body).toBe("🎤 Áudio");
    expect(buildPushPayload({ ...base, kind: "image", body: null }).body).toBe("📷 Foto");
    expect(buildPushPayload({ ...base, body: "a".repeat(200) }).body).toHaveLength(118);
    expect(buildPushPayload({ ...base, channel: "instagram" }).body).toBe("Instagram: oi, tem capinha?");
    expect(buildPushPayload({ ...base, contactName: " ", storeLabel: null }).title).toBe("Cliente");
  });

  it("nome curto da loja e inscrição expirada", () => {
    expect(storeShortName("Restaura Phone Brasil (Vila Eulalia)")).toBe("Vila Eulalia");
    expect(storeShortName(null)).toBeNull();
    expect(isGoneStatus(410)).toBe(true);
    expect(isGoneStatus(500)).toBe(false);
  });
});
