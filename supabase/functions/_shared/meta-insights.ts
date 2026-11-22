// Gasto dos anúncios lido da Meta (Insights da conta de anúncios) — sem rede; testado no Vitest.

export const INSIGHT_FIELDS = "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,date_start";
/** Conversas por mensagem iniciadas (contagem da própria Meta, janela de 7 dias). */
const CONVERSATION_ACTIONS = new Set(["onsite_conversion.messaging_conversation_started_7d"]);

export interface InsightRow {
  date: string; ad_id: string; ad_name: string | null; adset_id: string | null; adset_name: string | null;
  campaign_id: string | null; campaign_name: string | null; spend: number; impressions: number; clicks: number; conversations: number;
}

const int = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };
const str = (v: unknown, max = 200) => (v === null || v === undefined || v === "" ? null : String(v).slice(0, max));

/** Uma linha da resposta /insights (level=ad, time_increment=1) no formato da tabela crm_ad_insights. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- linha crua da Graph API
export function parseInsight(r: any): InsightRow | null {
  if (!r?.ad_id || !/^\d{4}-\d{2}-\d{2}$/.test(String(r.date_start ?? ""))) return null;
  const actions: { action_type?: string; value?: unknown }[] = Array.isArray(r.actions) ? r.actions : [];
  const conversations = actions.filter((a) => CONVERSATION_ACTIONS.has(String(a.action_type))).reduce((s, a) => s + int(a.value), 0);
  const spend = Number(r.spend);
  return {
    date: String(r.date_start), ad_id: String(r.ad_id), ad_name: str(r.ad_name), adset_id: str(r.adset_id, 40), adset_name: str(r.adset_name),
    campaign_id: str(r.campaign_id, 40), campaign_name: str(r.campaign_name),
    spend: Number.isFinite(spend) && spend > 0 ? Math.round(spend * 100) / 100 : 0,
    impressions: int(r.impressions), clicks: int(r.clicks), conversations,
  };
}

/** Período a buscar: na 1ª vez, 90 dias; depois, os últimos 3 dias (a Meta ainda ajusta os números recentes). */
export function insightsRange(lastSync: Date | null, now = new Date()): { since: string; until: string } {
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const back = lastSync ? 3 : 90;
  return { since: day(new Date(now.getTime() - back * 86400_000)), until: day(now) };
}

/** "act_123" ou "123" → "123" (só números) ou null. */
export const normalizeAdAccount = (v: unknown) => {
  const d = String(v ?? "").trim().replace(/^act_/i, "");
  return /^\d{5,20}$/.test(d) ? d : null;
};
