// Tipos do módulo CRM (tabelas crm_*). O types.ts gerado do Supabase está
// desatualizado, então o módulo declara os seus e concentra os casts em api/.

export type Channel = "whatsapp" | "instagram";
export type OriginChannel = Channel | "manual" | "os_vendas" | "import";
export type ConversationStatus = "open" | "pending" | "resolved";
export type Handler = "ai" | "human";
export type Direction = "in" | "out";
export type SenderKind = "contact" | "user" | "ai" | "system";
export type MessageKind = "text" | "image" | "audio" | "video" | "document" | "sticker" | "note";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed" | "received";
export type StageKind = "open" | "won" | "lost";
export type DealStatus = "open" | "won" | "lost";
export type Interest = "device" | "repair" | "accessory" | "other";

export interface CrmContact {
  id: string;
  store_id: string;
  name: string;
  phone: string | null;
  phone_key: string | null;
  email: string | null;
  instagram_user_id: string | null;
  instagram_username: string | null;
  avatar_url: string | null;
  customer_id: string | null;
  origin_channel: OriginChannel;
  handoff_code: string | null;
  tags: string[];
  ignored: boolean;
  ignored_reason: string | null;
  notes: string | null;
  owner_id: string | null;
  attribution_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmConversation {
  id: string;
  store_id: string;
  contact_id: string;
  channel: Channel;
  external_thread_id: string | null;
  status: ConversationStatus;
  assigned_to: string | null;
  handler: Handler;
  ai_paused_until: string | null;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: Direction | null;
  last_inbound_at: string | null;
  first_response_at: string | null;
  accepted_at?: string | null;
  accepted_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmConversationWithContact extends CrmConversation {
  contact: Pick<CrmContact, "id" | "name" | "phone" | "instagram_username" | "avatar_url" | "origin_channel" | "ignored" | "customer_id" | "tags">;
}

export interface CrmMessage {
  id: string;
  store_id: string;
  conversation_id: string;
  contact_id: string;
  direction: Direction;
  sender_kind: SenderKind;
  sender_user_id: string | null;
  kind: MessageKind;
  body: string | null;
  media_path: string | null;
  media_url: string | null;
  media_mime: string | null;
  external_id: string | null;
  status: MessageStatus;
  error: string | null;
  created_at: string;
  transcript?: string | null;
  transcript_status?: "done" | "failed" | "empty" | null;
}

export interface CrmPipeline {
  id: string;
  store_id: string;
  name: string;
  kind: "sales" | "service";
  position: number;
  is_default: boolean;
  archived: boolean;
}

export interface CrmStage {
  id: string;
  store_id: string;
  pipeline_id: string;
  name: string;
  code: string | null;
  position: number;
  kind: StageKind;
  sla_hours: number | null;
  color: string | null;
  hidden: boolean;
}

export interface CrmDealWithContact extends CrmDeal {
  contact: Pick<CrmContact, "id" | "name" | "phone" | "avatar_url" | "origin_channel"> & { customer_id?: string | null };
}

export interface CrmDeal {
  id: string;
  store_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string;
  title: string;
  value: number;
  interest: Interest | null;
  owner_id: string | null;
  status: DealStatus;
  lost_reason: string | null;
  expected_close_date: string | null;
  position: number;
  stage_entered_at: string;
  origin_channel: OriginChannel | null;
  handoff_sent_at: string | null;
  handoff_completed_at: string | null;
  sale_id: string | null;
  service_order_id: string | null;
  ai_summary: string | null;
  ai_score: "hot" | "warm" | "cold" | null;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
}

export type TaskKind = "follow_up" | "call" | "reply" | "stale_deal" | "os_ready" | "review" | "warranty";
export type TaskSource = "user" | "automation" | "ai";

export interface CrmTask {
  id: string;
  store_id: string;
  title: string;
  notes: string | null;
  kind: TaskKind | string;
  due_at: string | null;
  done_at: string | null;
  assigned_to: string | null;
  contact_id: string | null;
  deal_id: string | null;
  conversation_id: string | null;
  source: TaskSource;
  suggested_message: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CrmTaskWithLinks extends CrmTask {
  contact: Pick<CrmContact, "id" | "name" | "phone"> | null;
  deal: Pick<CrmDeal, "id" | "title" | "pipeline_id" | "status"> | null;
}

export interface CrmAutomationSettings {
  store_id: string;
  round_robin: boolean;
  round_robin_members: string[];
  unanswered_minutes: number | null;
  stale_deals: boolean;
  os_ready: boolean;
  review_after_days: number | null;
  warranty_alert_days: number | null;
  ig_first_message: string;
  ig_followup_hours: number;
  os_sync: boolean;
  dispatch_enabled: boolean;
  dispatch_minutes: number;
  dispatch_owner_id: string | null;
}

/** Uma vez de alguém na distribuição de atendimento. */
export interface CrmDispatch {
  id: string;
  store_id: string;
  conversation_id: string;
  cycle_id: string;
  user_id: string | null;
  status: "waiting" | "offered" | "accepted" | "expired" | "owner" | "cancelled";
  offered_at: string | null;
  expires_at: string | null;
  decided_at: string | null;
  notify_status: "pending" | "sending" | "sent" | "failed" | null;
  notify_error: string | null;
  created_at: string;
}

export interface CrmActivity {
  id: string;
  store_id: string;
  contact_id: string | null;
  deal_id: string | null;
  conversation_id: string | null;
  actor_kind: "user" | "ai" | "system";
  actor_id: string | null;
  type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface CrmBusinessHours { enabled?: boolean; start?: string; end?: string; days?: number[] }

export interface CrmAiSettings {
  store_id: string;
  mode: "off" | "draft" | "autopilot";
  knowledge: string | null;
  persona: string | null;
  model: string | null;
  business_hours: CrmBusinessHours | null;
  max_replies_per_day: number;
  max_turns: number;
  handoff_message: string | null;
  enabled_channels: string[];
}

export interface CrmAiSuggestion {
  id: string;
  store_id: string;
  conversation_id: string;
  run_id: string | null;
  kind: "reply" | "handoff";
  body: string;
  status: "pending" | "sent" | "discarded";
  created_at: string;
}

export interface CrmAiDecision {
  decision: "reply" | "handoff" | "ignore";
  reply: string;
  commercial: boolean;
  interest: Interest | null;
  device_model: string | null;
  defect: string | null;
  urgency: string | null;
  customer_name: string | null;
  score: "hot" | "warm" | "cold";
  summary: string;
  title: string;
  reason: string | null;
}

export interface CrmAiRun {
  id: string;
  store_id: string;
  conversation_id: string | null;
  decision: string | null;
  output: CrmAiDecision | null;
  model: string | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
  conversation?: { id: string; contact: { name: string } | null } | null;
}

export interface CrmQuickReply {
  id: string;
  store_id: string;
  shortcut: string;
  body: string;
}
