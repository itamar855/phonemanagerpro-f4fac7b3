// Agrupa as linhas do relatório (origem › campanha › conjunto › anúncio) e calcula custos com o investimento.

export interface Row { source: string; campaign: string; adset: string; ad: string; contacts: number; replied: number; qualified: number; won: number; revenue: number }

export interface Totals { contacts: number; replied: number; qualified: number; won: number; revenue: number }
const zero = (): Totals => ({ contacts: 0, replied: 0, qualified: 0, won: 0, revenue: 0 });
const add = (t: Totals, r: Totals) => {
  t.contacts += r.contacts; t.replied += r.replied; t.qualified += r.qualified; t.won += r.won; t.revenue += Number(r.revenue);
  return t;
};

export interface AdNode extends Totals { name: string }
export interface AdsetNode extends Totals { name: string; ads: AdNode[] }
export interface CampaignNode extends Totals { name: string; source: string; spend: number | null; adsets: AdsetNode[] }

/** Funil por origem (Link, Anúncio → WhatsApp, Instagram...). */
export function bySource(rows: Row[]): (Totals & { source: string })[] {
  const m = new Map<string, Totals>();
  for (const r of rows) m.set(r.source, add(m.get(r.source) ?? zero(), r));
  return [...m].map(([source, t]) => ({ source, ...t })).sort((a, b) => b.revenue - a.revenue || b.contacts - a.contacts);
}

/** Árvore campanha › conjunto › anúncio, com o investimento da campanha. */
export function byCampaign(rows: Row[], spend: Map<string, number>): CampaignNode[] {
  const camps = new Map<string, CampaignNode>();
  for (const r of rows) {
    const key = `${r.source}|${r.campaign}`;
    const c = camps.get(key) ?? { name: r.campaign, source: r.source, spend: spend.get(r.campaign) ?? null, adsets: [], ...zero() };
    add(c, r);
    let s = c.adsets.find((x) => x.name === r.adset);
    if (!s) { s = { name: r.adset, ads: [], ...zero() }; c.adsets.push(s); }
    add(s, r);
    let a = s.ads.find((x) => x.name === r.ad);
    if (!a) { a = { name: r.ad, ...zero() }; s.ads.push(a); }
    add(a, r);
    camps.set(key, c);
  }
  return [...camps.values()].sort((a, b) => b.revenue - a.revenue || b.contacts - a.contacts);
}

/** Custo por lead, custo por venda e retorno (receita ÷ investimento). null quando não dá para calcular. */
export function costs(t: Totals, spend: number | null) {
  if (!spend || spend <= 0) return { cpl: null, cpv: null, roas: null };
  return {
    cpl: t.contacts ? spend / t.contacts : null,
    cpv: t.won ? spend / t.won : null,
    roas: t.revenue / spend,
  };
}
