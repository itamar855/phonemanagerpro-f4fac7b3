import { describe, expect, it } from "vitest";
import { attributionLabel, META_URL_PARAMS, slugify, type Attribution } from "../lib/tracking";

const base: Attribution = {
  id: "1", kind: "organic", entry_point: null, entry_app: null, ad_title: null, ad_source_id: null, ad_id: null, utm_source: null,
  utm_campaign: null, utm_content: null, utm_term: null, created_at: "",
};

describe("rastreamento — tela", () => {
  it("endereço do link a partir do nome", () => {
    expect(slugify("Promoção Tela A54!")).toBe("promocao-tela-a54");
    expect(slugify("  --Black Friday 2026--  ")).toBe("black-friday-2026");
  });

  it("parâmetros dinâmicos da Meta para colar no anúncio", () => {
    expect(META_URL_PARAMS).toContain("utm_campaign={{campaign.name}}");
    expect(META_URL_PARAMS).toContain("ad_id={{ad.id}}");
  });

  it("origem legível na ficha do contato", () => {
    expect(attributionLabel({ ...base, kind: "link", utm_campaign: "Tela A54", utm_content: "Vídeo 1" })).toBe("Link de rastreio · Tela A54 › Vídeo 1");
    expect(attributionLabel({ ...base, kind: "code", ad_code: "T21", utm_campaign: "Tela Nov", utm_term: "25-45", utm_content: "Vídeo 1" }))
      .toBe("Anúncio T21 · Tela Nov › 25-45 › Vídeo 1");
    expect(attributionLabel({ ...base, kind: "manual", entry_point: "instagram_ad", ad_code: "T21", utm_campaign: "Tela Nov" }))
      .toBe("Instagram (anúncio) T21 · Tela Nov");
    expect(attributionLabel({ ...base, kind: "manual", entry_point: "instagram_story" })).toBe("Instagram (story)");
    expect(attributionLabel({ ...base, kind: "ctwa", ad_title: "Tela em 1h", ad_source_id: "120" })).toBe("Anúncio (WhatsApp) · Tela em 1h · #120");
    expect(attributionLabel({ ...base, entry_point: "click_to_chat_link" })).toBe("Orgânico · link do WhatsApp (wa.me)");
  });
});
