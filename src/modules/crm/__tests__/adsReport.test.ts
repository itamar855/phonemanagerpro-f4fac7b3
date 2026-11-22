import { describe, expect, it } from "vitest";
import { adCosts, adsTotals, adsTree, adVerdict, matchRate, type AdRow } from "../lib/adsReport";

const row = (p: Partial<AdRow>): AdRow => ({
  campaign_id: "C1", campaign_name: "Tela", adset_id: "S1", adset_name: "25-45", ad_id: "A1", ad_name: "Vídeo",
  spend: 0, impressions: 0, clicks: 0, conversations: 0, leads: 0, replied: 0, qualified: 0, won: 0, revenue: 0, ...p,
});

describe("relatório por anúncio", () => {
  it("monta campanha › conjunto › anúncio somando gasto e vendas", () => {
    const rows = [
      row({ ad_id: "A1", spend: 100, conversations: 10, leads: 8, won: 2, revenue: 900 }),
      row({ ad_id: "A2", ad_name: "Carrossel", spend: 60, conversations: 4, leads: 3 }),
      row({ campaign_id: null, campaign_name: "Tela em 1h", adset_id: null, adset_name: "—", ad_id: "A9", ad_name: "Anúncio A9", spend: null, leads: 2, won: 1, revenue: 300 }),
    ];
    const tree = adsTree(rows);
    expect(tree.map((c) => c.name)).toEqual(["Tela", "Tela em 1h"]);
    expect(tree[0]).toMatchObject({ spend: 160, conversations: 14, leads: 11, won: 2, revenue: 900 });
    expect(tree[0].adsets[0].ads.map((a) => a.id)).toEqual(["A1", "A2"]);
    expect(adsTotals(rows)).toMatchObject({ spend: 160, leads: 13, won: 3, revenue: 1200 });
  });

  it("custos, retorno e o que fazer com cada anúncio", () => {
    const good = { spend: 100, conversations: 10, leads: 8, qualified: 4, won: 2, revenue: 900 };
    expect(adCosts(good)).toEqual({ perConversation: 10, perLead: 12.5, perSale: 50, roas: 9 });
    expect(adVerdict(good)).toBe("escalar");
    expect(adVerdict({ ...good, won: 0, revenue: 0, spend: 60 })).toBe("cortar");
    expect(adVerdict({ ...good, won: 1, revenue: 50 })).toBe("cortar"); // vendeu menos do que gastou
    expect(adVerdict({ ...good, won: 0, revenue: 0, spend: 20 })).toBeNull(); // pouco gasto para julgar
    expect(adCosts({ ...good, spend: 0 })).toEqual({ perConversation: null, perLead: null, perSale: null, roas: null });
    expect(matchRate(good)).toBe(0.8);
    expect(matchRate({ ...good, conversations: 0 })).toBeNull();
  });
});
