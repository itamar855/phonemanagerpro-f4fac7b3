import { crmDb, throwIf } from "./db";
import type { OriginChannel } from "../lib/types";

export interface CrmReport {
  totals: {
    deals_created: number; won: number; won_value: number; lost: number; open: number; open_value: number;
    avg_days_to_win: number | null; conversations: number; conv_whatsapp: number; conv_instagram: number;
    answered: number; unanswered: number; resp_avg_min: number | null; resp_median_min: number | null; resp_within_15: number;
  };
  funnel: { key: string; name: string; kind: "open" | "won"; deals: number }[];
  lost_reasons: { reason: string; count: number }[];
  by_origin: { origin: OriginChannel; created: number; won: number; won_value: number }[];
  by_owner: { owner_id: string | null; won: number; won_value: number; lost: number; open: number; open_value: number }[];
  handoff: { sent: number; completed: number; avg_hours: number | null };
  tasks: { created: number; done: number; done_on_time: number; overdue_now: number };
  series: { day: string; conversations: number; deals_created: number; won_value: number }[];
}

export async function crmReport(args: { storeId: string | null; from: Date; to: Date; kind: "sales" | "service" }): Promise<CrmReport> {
  const { data, error } = await crmDb.rpc("crm_report", {
    p_store_id: args.storeId, p_from: args.from.toISOString(), p_to: args.to.toISOString(), p_pipeline_kind: args.kind,
  });
  throwIf(error);
  return data as CrmReport;
}

export interface LinkCandidate {
  kind: "sale" | "service_order";
  id: string;
  label: string;
  amount: number | null;
  happened_at: string;
}

export async function dealLinkCandidates(dealId: string): Promise<LinkCandidate[]> {
  const { data, error } = await crmDb.rpc("crm_deal_link_candidates", { p_deal_id: dealId });
  throwIf(error);
  return (data ?? []) as LinkCandidate[];
}
