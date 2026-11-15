import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { extractAdAttribution, extractTrackCode, hasAdData } from "../../../supabase/functions/whatsapp-webhook/parse";
import { buildCapiEvent, fbcFrom, newTrackCode, normalizePhoneForMeta, splitName } from "../../../supabase/functions/_shared/meta-capi";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

describe("rastreamento — origem que o WhatsApp manda", () => {
  it("anúncio que abre o WhatsApp (externalAdReply)", () => {
    const msg = { message: { extendedTextMessage: { text: "Olá", contextInfo: {
      conversionSource: "FB_Ads", entryPointConversionSource: "ctwa_ad", entryPointConversionApp: "instagram",
      externalAdReply: { sourceId: "120210", sourceUrl: "https://fb.me/x", sourceType: "ad", title: "Tela em 1h", ctwaClid: "ARAk" },
    } } } };
    const n = extractAdAttribution(msg);
    expect(n).toMatchObject({ entry_point: "ctwa_ad", entry_app: "instagram", ad_source_id: "120210", ad_title: "Tela em 1h", ctwa_clid: "ARAk" });
    expect(hasAdData(n)).toBe(true);
  });

  it("contato orgânico (link de conversa) não conta como anúncio", () => {
    const n = extractAdAttribution({ message: { conversation: "oi", messageContextInfo: { entryPointConversionSource: "click_to_chat_link", entryPointConversionApp: "whatsapp" } } });
    expect(n).toEqual({ entry_point: "click_to_chat_link", entry_app: "whatsapp" });
    expect(hasAdData(n)).toBe(false);
  });

  it("código do link de rastreio na mensagem", () => {
    expect(extractTrackCode("Olá! Quero mais informações. (cód. K7Q2M)")).toBe("K7Q2M");
    expect(extractTrackCode("cod: k7q2m")).toBe("K7Q2M");
    expect(extractTrackCode("meu código é 12345")).toBeNull(); // 1 não existe no alfabeto do código
    expect(extractTrackCode("oi")).toBeNull();
  });
});

describe("rastreamento — evento para a Meta", () => {
  it("telefone e nome no formato da Meta", () => {
    expect(normalizePhoneForMeta("(87) 99911-2233")).toBe("5587999112233");
    expect(normalizePhoneForMeta("5587999112233")).toBe("5587999112233");
    expect(normalizePhoneForMeta("123")).toBeNull();
    expect(splitName("José da Silva!")).toEqual({ fn: "josé", ln: "silva" });
    expect(splitName("Contato")).toEqual({ fn: null, ln: null });
  });

  it("dados pessoais com hash; clique, IP e valor abertos; sem duplicar pelo event_id", async () => {
    const e: any = await buildCapiEvent({
      eventName: "Purchase", eventId: "purchase:abc", eventTime: new Date("2026-11-16T12:00:00Z"),
      contact: { id: "c1", phone: "5587999112233", name: "Ana Souza" },
      attribution: { fbc: fbcFrom("IwAR1", new Date(1700000000000)), ip: "200.1.2.3", user_agent: "Mozilla" },
      value: 450, contentName: "Tela A54",
    });
    expect(e).toMatchObject({ event_name: "Purchase", event_id: "purchase:abc", action_source: "chat", event_time: 1794830400 });
    expect(e.user_data.ph).toEqual([sha("5587999112233")]);
    expect(e.user_data.fn).toEqual([sha("ana")]);
    expect(e.user_data.external_id).toEqual([sha("c1")]);
    expect(e.user_data.fbc).toBe("fb.1.1700000000000.IwAR1");
    expect(e.user_data.client_ip_address).toBe("200.1.2.3");
    expect(e.custom_data).toMatchObject({ value: 450, currency: "BRL", content_name: "Tela A54" });
  });

  it("código curto sem caracteres que confundem", () => {
    const c = newTrackCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(extractTrackCode(`(cód. ${c})`)).toBe(c);
  });
});
