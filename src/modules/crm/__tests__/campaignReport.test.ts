import { describe, expect, it } from "vitest";
import { byCampaign, bySource, costs, type Row } from "../lib/campaignReport";

const r = (o: Partial<Row>): Row => ({ source: "Anúncio (código)", campaign: "Tela", adset: "25-45", ad: "Vídeo 1", contacts: 1, replied: 1, qualified: 0, won: 0, revenue: 0, ...o });

describe("relatório por campanha", () => {
  const rows = [
    r({ contacts: 10, replied: 7, won: 2, revenue: 3000 }),
    r({ ad: "Vídeo 2", contacts: 5, replied: 2, won: 0 }),
    r({ adset: "Remarketing", ad: "Carrossel", contacts: 4, replied: 4, won: 1, revenue: 1800 }),
    r({ source: "Orgânico", campaign: "—", adset: "—", ad: "click_to_chat_link", contacts: 8, replied: 8, won: 1, revenue: 900 }),
  ];

  it("compara os funis por origem", () => {
    const s = bySource(rows);
    expect(s[0]).toMatchObject({ source: "Anúncio (código)", contacts: 19, replied: 13, won: 3, revenue: 4800 });
    expect(s[1].source).toBe("Orgânico");
  });

  it("monta campanha › conjunto › anúncio com o investimento", () => {
    const [tela] = byCampaign(rows, new Map([["Tela", 1200]]));
    expect(tela).toMatchObject({ name: "Tela", contacts: 19, won: 3, revenue: 4800, spend: 1200 });
    expect(tela.adsets.map((a) => a.name)).toEqual(["25-45", "Remarketing"]);
    expect(tela.adsets[0].ads.map((a) => `${a.name}:${a.contacts}`)).toEqual(["Vídeo 1:10", "Vídeo 2:5"]);
  });

  it("custo por lead, por venda e retorno", () => {
    expect(costs({ contacts: 19, replied: 13, qualified: 0, won: 3, revenue: 4800 }, 1200)).toEqual({ cpl: 1200 / 19, cpv: 400, roas: 4 });
    expect(costs({ contacts: 5, replied: 0, qualified: 0, won: 0, revenue: 0 }, null)).toEqual({ cpl: null, cpv: null, roas: null });
  });
});
