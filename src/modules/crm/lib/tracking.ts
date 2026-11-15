// Regras puras do rastreamento (sem acesso ao banco).

export interface Attribution {
  id: string; kind: "link" | "ctwa" | "organic"; entry_point: string | null; entry_app: string | null;
  ad_title: string | null; ad_source_id: string | null; ad_id: string | null; utm_source: string | null; utm_campaign: string | null;
  utm_content: string | null; utm_term: string | null; created_at: string;
}

/** Endereço público dos links (a Vercel repassa /w/<slug> para a função crm-track). */
export const TRACK_BASE = "https://cellpro360.vercel.app/w/";
/** Parâmetros dinâmicos da Meta: a campanha/anúncio chegam preenchidos no clique. */
export const META_URL_PARAMS =
  "utm_source=facebook&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&campaign_id={{campaign.id}}&adset_id={{adset.id}}&ad_id={{ad.id}}";

/** "Promoção Tela A54!" → "promocao-tela-a54" */
export const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

const ENTRY_LABEL: Record<string, string> = {
  ctwa_ad: "anúncio que abre o WhatsApp", click_to_chat_link: "link do WhatsApp (wa.me)", phone_number_hyperlink: "número clicado num site",
  global_search_new_chat: "buscou o número no WhatsApp", contact_card: "cartão de contato", group_participant_list: "veio de um grupo",
};

/** Texto curto da origem para a ficha do contato. */
export function attributionLabel(a: Attribution): string {
  if (a.kind === "link") return ["Link de rastreio", a.utm_campaign, a.utm_content].filter(Boolean).join(" · ");
  if (a.kind === "ctwa") return ["Anúncio (WhatsApp)", a.ad_title, a.ad_source_id ? `#${a.ad_source_id}` : null].filter(Boolean).join(" · ");
  return `Orgânico · ${ENTRY_LABEL[a.entry_point ?? ""] ?? a.entry_point ?? "WhatsApp"}`;
}
