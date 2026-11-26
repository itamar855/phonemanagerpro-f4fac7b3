import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { extractAdAttribution, extractTrackCode, hasAdData } from "../../../supabase/functions/whatsapp-webhook/parse";
import { buildCapiEvent, chooseFormat, fbcFrom, messagingEventName, newTrackCode, normalizePhoneForMeta, splitName, tooOld } from "../../../supabase/functions/_shared/meta-capi";
import { insightsRange, normalizeAdAccount, parseInsight } from "../../../supabase/functions/_shared/meta-insights";

/** O evento montado é um objeto livre (formato da Meta); os testes leem estes campos. */
type CapiEvent = { user_data: Record<string, unknown>; custom_data: Record<string, unknown> };

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
    const e = (await buildCapiEvent({
      eventName: "Purchase", eventId: "purchase:abc", eventTime: new Date("2026-11-16T12:00:00Z"),
      contact: { id: "c1", phone: "5587999112233", name: "Ana Souza" },
      attribution: { fbc: fbcFrom("IwAR1", new Date(1700000000000)), ip: "200.1.2.3", user_agent: "Mozilla" },
      value: 450, contentName: "Tela A54",
    })) as CapiEvent;
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

describe("rastreamento — dois formatos (pixel hoje, conta oficial depois)", () => {
  const official = { dataset_id: "111111", messaging_dataset_id: "222222", waba_id: "333333", page_id: "444444" };

  it("escolhe o formato: mensagens com conta oficial; pixel sem ela", () => {
    expect(chooseFormat({ dataset_id: "111111" }, "Lead", "ARAk")).toBe("pixel");
    expect(chooseFormat(official, "Lead", "ARAk")).toBe("messaging");
    expect(chooseFormat(official, "Purchase", null)).toBe("messaging"); // casa pelo telefone + página
    expect(chooseFormat({ ...official, page_id: null }, "Purchase", null)).toBe("pixel"); // sem clique nem página
    expect(chooseFormat(official, "MeuEventoCustom", "ARAk")).toBe("pixel"); // não existe no formato de mensagens
    expect(chooseFormat({ messaging_dataset_id: "2", waba_id: "3" }, "Lead", null)).toBeNull();
    expect(messagingEventName("Lead")).toBe("LeadSubmitted");
    expect(messagingEventName("QualifiedLead")).toBe("QualifiedLead");
  });

  it("evento de mensagens: business_messaging + whatsapp, WABA e ctwa_clid abertos, telefone com hash", async () => {
    const e = (await buildCapiEvent({
      eventName: "Lead", eventId: "lead:c1", eventTime: new Date("2026-11-20T12:00:00Z"), format: "messaging", wabaId: "333333", pageId: "444444",
      contact: { id: "c1", phone: "5587999112233", name: "Ana Souza" },
      attribution: { ctwa_clid: "ARAkClid", fbc: "fb.1.1.x", ip: "1.2.3.4" },
    })) as CapiEvent;
    expect(e).toMatchObject({ event_name: "LeadSubmitted", action_source: "business_messaging", messaging_channel: "whatsapp", event_id: "lead:c1" });
    expect(e.user_data).toMatchObject({ whatsapp_business_account_id: "333333", ctwa_clid: "ARAkClid", page_id: "444444", ph: [sha("5587999112233")] });
    expect(e.user_data.fbc).toBeUndefined(); // dados de site não vão no formato de mensagens
    expect(e.user_data.external_id).toBeUndefined();
    expect(e.custom_data.lead_source).toBeUndefined();
    await expect(buildCapiEvent({ eventName: "Lead", eventId: "x", eventTime: new Date(), format: "messaging", contact: { id: "c", phone: null, name: null } }))
      .rejects.toThrow(/WABA/);
  });

  it("evento velho demais (a Meta só aceita até 7 dias)", () => {
    const now = new Date("2026-11-22T12:00:00Z");
    expect(tooOld(new Date("2026-11-16T12:00:00Z"), now)).toBe(false);
    expect(tooOld(new Date("2026-11-15T10:00:00Z"), now)).toBe(true);
  });

  it("gasto da Meta: linha do Insights por anúncio e dia", () => {
    const r = parseInsight({
      date_start: "2026-11-21", ad_id: "120", ad_name: "Vídeo", adset_id: "110", adset_name: "25-45", campaign_id: "100", campaign_name: "Tela",
      spend: "35.427", impressions: "1500", clicks: "40",
      actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "7" }, { action_type: "link_click", value: "30" }],
    });
    expect(r).toEqual({ date: "2026-11-21", ad_id: "120", ad_name: "Vídeo", adset_id: "110", adset_name: "25-45", campaign_id: "100", campaign_name: "Tela",
      spend: 35.43, impressions: 1500, clicks: 40, conversations: 7 });
    expect(parseInsight({ date_start: "2026-11-21" })).toBeNull();
    expect(parseInsight({ ad_id: "1", date_start: "ontem" })).toBeNull();
    expect(normalizeAdAccount("act_123456789")).toBe("123456789");
    expect(normalizeAdAccount("abc")).toBeNull();
    expect(insightsRange(null, new Date("2026-11-22T12:00:00Z"))).toEqual({ since: "2026-08-24", until: "2026-11-22" });
    expect(insightsRange(new Date(), new Date("2026-11-22T12:00:00Z"))).toEqual({ since: "2026-11-19", until: "2026-11-22" });
  });
});
