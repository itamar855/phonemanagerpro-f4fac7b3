// Link de rastreio do CRM: https://cellpro360.vercel.app/w/<slug>?utm_...&fbclid=...
// (a Vercel repassa para esta função). Grava o clique (campanha, fbclid, IP, navegador),
// gera um código curto e manda a pessoa para o WhatsApp com a mensagem pronta + código.
// Público (sem login): só lê o link e grava o clique; nunca expõe dados.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminClient } from "../_shared/http.ts";
import { fbcFrom, newTrackCode } from "../_shared/meta-capi.ts";

const BOT = /facebookexternalhit|facebot|bot|crawler|spider|preview|whatsapp\//i;
const UTM = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

const text = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
const go = (url: string) => new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("l") ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 41);
    if (!slug) return text("Link inválido.", 404);

    const admin = adminClient();
    const { data: link } = await admin.from("crm_track_links").select("id, store_id, message, active").eq("slug", slug).maybeSingle();
    if (!link || !link.active) return text("Este link não está mais ativo.", 404);
    const { data: settings } = await admin.from("crm_tracking_settings").select("whatsapp_number").eq("store_id", link.store_id).maybeSingle();
    const number = String(settings?.whatsapp_number ?? "").replace(/\D/g, "");
    if (number.length < 10) return text("WhatsApp da loja não configurado.", 503);

    const ua = req.headers.get("user-agent") ?? "";
    // pré-visualização de link (robôs) não vira clique
    if (BOT.test(ua)) return go(`https://wa.me/${number}?text=${encodeURIComponent(link.message)}`);

    const p = url.searchParams;
    const fbclid = p.get("fbclid");
    const utm: Record<string, string> = {};
    for (const k of UTM) { const v = p.get(k); if (v) utm[k] = v.slice(0, 200); }
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || null;

    let code = "";
    for (let i = 0; i < 5; i++) {
      code = newTrackCode();
      const { error } = await admin.from("crm_track_clicks").insert({
        store_id: link.store_id, link_id: link.id, code, fbclid, fbc: fbcFrom(fbclid), utm,
        campaign_id: p.get("campaign_id")?.slice(0, 40) ?? null, adset_id: p.get("adset_id")?.slice(0, 40) ?? null,
        ad_id: p.get("ad_id")?.slice(0, 40) ?? null, ip, user_agent: ua.slice(0, 400), referer: (req.headers.get("referer") ?? "").slice(0, 400) || null,
      });
      if (!error) break;
      if (!/duplicate|unique/i.test(error.message)) { console.error("[crm-track]", error.message); code = ""; break; }
    }

    const message = code ? `${link.message} (cód. ${code})` : link.message;
    return go(`https://wa.me/${number}?text=${encodeURIComponent(message)}`);
  } catch (e) {
    console.error("[crm-track]", (e as Error).message);
    return text("Não foi possível abrir o WhatsApp agora.", 500);
  }
});
