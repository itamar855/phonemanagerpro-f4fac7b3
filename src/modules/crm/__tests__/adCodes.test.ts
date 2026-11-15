import { describe, expect, it } from "vitest";
import { extractAdCode as serverExtract } from "../../../../supabase/functions/whatsapp-webhook/parse";
import { adCodePath, adTexts, campaignLetter, extractAdCode, parsePasted, suggestCode, type AdCode } from "../lib/adCodes";

const code = (c: string, over: Partial<AdCode> = {}): AdCode => ({
  id: c, store_id: "s", code: c, level: "ad", campaign_name: "Tela Novembro", adset_name: "Público 25-45", ad_name: "Vídeo 1",
  campaign_id: null, adset_id: null, ad_id: null, active: true, created_at: "", ...over,
});

describe("códigos de anúncio", () => {
  it("lê #T21 e Ref. T21 (igual no servidor e na tela)", () => {
    for (const fn of [extractAdCode, serverExtract]) {
      expect(fn("Quero saber o preço 📱 #T21")).toBe("T21");
      expect(fn("Oi! 😊 Bem-vindo à Loja. Ref. t21")).toBe("T21");
      expect(fn("ref: B11")).toBe("B11");
      expect(fn("quanto custa?")).toBeNull();
    }
  });

  it("gera o próximo código livre a partir do nome da campanha", () => {
    expect(campaignLetter("Ébano Promo")).toBe("E");
    expect(suggestCode("Tela Novembro", [])).toBe("T11");
    expect(suggestCode("Tela Novembro", ["T11", "T12"])).toBe("T13");
    expect(suggestCode("Bateria", ["T11"], "adset")).toBe("B1");
    expect(suggestCode("Tela", ["T1"], "campaign")).toBe("T2");
  });

  it("textos prontos levam o código", () => {
    const t = adTexts("T21", "Restaura Phone");
    expect(t.greeting).toBe("Oi! 😊 Bem-vindo à Restaura Phone. Ref. T21");
    expect(t.questions.every((q) => q.endsWith("#T21"))).toBe(true);
    expect(adCodePath(code("T21"))).toBe("Tela Novembro › Público 25-45 › Vídeo 1");
  });

  it("um botão Colar entende link do perfil, número ou código", () => {
    const codes = [code("T21"), code("B11", { active: false })];
    expect(parsePasted("https://www.instagram.com/ana.souza?igsh=xyz", codes)).toEqual({ username: "ana.souza" });
    expect(parsePasted("meu zap 87 99911-2233", codes)).toEqual({ phone: "87999112233" });
    expect(parsePasted("Quero saber o preço 📱 #T21", codes).code?.code).toBe("T21");
    expect(parsePasted("Quero saber #B11", codes)).toEqual({}); // código desativado não vale
  });
});
