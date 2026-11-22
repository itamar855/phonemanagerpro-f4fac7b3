// Relatório anúncio a anúncio: gasto da Meta × o que virou no CRM (sem acesso ao banco).

export interface AdRow {
  campaign_id: string | null; campaign_name: string; adset_id: string | null; adset_name: string; ad_id: string; ad_name: string;
  spend: number | null; impressions: number | null; clicks: number | null; conversations: number | null;
  leads: number; replied: number; qualified: number; won: number; revenue: number;
}

export interface AdTotals { spend: number; conversations: number; leads: number; qualified: number; won: number; revenue: number }
export interface AdLeaf extends AdTotals { id: string; name: string }
export interface AdsetNode extends AdTotals { key: string; name: string; ads: AdLeaf[] }
export interface CampaignNode extends AdTotals { key: string; name: string; adsets: AdsetNode[] }

const zero = (): AdTotals => ({ spend: 0, conversations: 0, leads: 0, qualified: 0, won: 0, revenue: 0 });
const add = <T extends AdTotals>(t: T, r: AdRow): T => {
  t.spend += Number(r.spend ?? 0); t.conversations += Number(r.conversations ?? 0);
  t.leads += r.leads; t.qualified += r.qualified; t.won += r.won; t.revenue += Number(r.revenue);
  return t;
};
const byValue = (a: AdTotals, b: AdTotals) => b.revenue - a.revenue || b.spend - a.spend || b.leads - a.leads;

/** Árvore campanha › conjunto › anúncio (pelo ID da Meta quando há; senão pelo nome). */
export function adsTree(rows: AdRow[]): CampaignNode[] {
  const camps = new Map<string, CampaignNode>();
  for (const r of rows) {
    const ck = r.campaign_id ?? `n:${r.campaign_name}`;
    const c = camps.get(ck) ?? { key: ck, name: r.campaign_name, adsets: [], ...zero() };
    add(c, r);
    const sk = r.adset_id ?? `n:${r.adset_name}`;
    let s = c.adsets.find((x) => x.key === sk);
    if (!s) { s = { key: sk, name: r.adset_name, ads: [], ...zero() }; c.adsets.push(s); }
    add(s, r);
    s.ads.push(add({ id: r.ad_id, name: r.ad_name, ...zero() }, r));
    camps.set(ck, c);
  }
  const out = [...camps.values()].sort(byValue);
  for (const c of out) { c.adsets.sort(byValue); for (const s of c.adsets) s.ads.sort(byValue); }
  return out;
}

export function adsTotals(rows: AdRow[]): AdTotals {
  return rows.reduce((t, r) => add(t, r), zero());
}

/** Custos e retorno. null quando não dá para calcular. */
export function adCosts(t: AdTotals) {
  const has = t.spend > 0;
  return {
    perConversation: has && t.conversations ? t.spend / t.conversations : null,
    perLead: has && t.leads ? t.spend / t.leads : null,
    perSale: has && t.won ? t.spend / t.won : null,
    roas: has ? t.revenue / t.spend : null,
  };
}

/**
 * Sinal de cada anúncio para quem decide a verba:
 * - "cortar": gastou bem (≥ R$ 50) e não trouxe venda, ou retorno abaixo de 1
 * - "escalar": retorno ≥ 3 com pelo menos 2 vendas
 * - null: pouco dado para dizer
 */
export function adVerdict(t: AdTotals): "cortar" | "escalar" | null {
  if (t.spend <= 0) return null;
  const roas = t.revenue / t.spend;
  if (t.won >= 2 && roas >= 3) return "escalar";
  if ((t.spend >= 50 && t.won === 0) || (t.won > 0 && roas < 1)) return "cortar";
  return null;
}

/** Leads do CRM que a Meta não contou como conversa, e vice-versa: muito diferente = rastreio falhando. */
export function matchRate(t: AdTotals): number | null {
  return t.conversations > 0 ? Math.min(1, t.leads / t.conversations) : null;
}
