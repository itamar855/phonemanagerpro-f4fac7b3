// Link da avaliação: funções da loja e as públicas (cliente sem login).
// As funções tradein_* não estão no types.ts gerado; o cast fica concentrado aqui.
import { supabase } from "@/integrations/supabase/client";
import { convertToWebP } from "@/utils/imageOptimizer";
import type { AnswerLine, TradeRule } from "../lib/types";
import { MAX_PHOTOS, type PublicEvaluation } from "../lib/share";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const BUCKET = "tradein-photos";
const num = (v: unknown) => Number(v) || 0;

function throwIf(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ---------- loja ----------

export async function createShare(evaluationId: string): Promise<{ token: string; expires_at: string }> {
  const { data, error } = await db.rpc("tradein_share_create", { p_evaluation_id: evaluationId });
  throwIf(error);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.token) throw new Error("Não foi possível criar o link.");
  return row;
}

export async function markShareSeen(evaluationId: string): Promise<void> {
  const { error } = await db.rpc("tradein_share_mark_seen", { p_evaluation_id: evaluationId });
  throwIf(error);
}

/** Fotos que o cliente mandou (links assinados de 1 hora). */
export async function listPhotos(token: string): Promise<{ name: string; url: string }[]> {
  const { data, error } = await db.storage.from(BUCKET).list(token, { limit: MAX_PHOTOS, sortBy: { column: "created_at", order: "asc" } });
  throwIf(error);
  const files = (data ?? []).filter((f: { name: string; id: string | null }) => f.id);
  if (!files.length) return [];
  const paths = files.map((f: { name: string }) => `${token}/${f.name}`);
  const signed = await db.storage.from(BUCKET).createSignedUrls(paths, 3600);
  throwIf(signed.error);
  return (signed.data ?? [])
    .filter((s: { signedUrl: string | null }) => s.signedUrl)
    .map((s: { path: string; signedUrl: string }) => ({ name: s.path, url: s.signedUrl }));
}

// ---------- público ----------

const lines = (v: unknown): AnswerLine[] =>
  Array.isArray(v) ? v.map((l: AnswerLine) => ({ ...l, amount: num(l.amount), value: num(l.value) })) : [];

function toPublic(d: PublicEvaluation | null): PublicEvaluation | null {
  if (!d) return null;
  return {
    ...d,
    base_price: num(d.base_price),
    discount_total: num(d.discount_total),
    offer: num(d.offer),
    round_to: num(d.round_to) || 10,
    answers: lines(d.answers),
    rules: (d.rules ?? []).map((r: TradeRule) => ({ ...r, amount: num(r.amount), active: true, store_id: "" })),
    review: d.review ? { ...d.review, answers: lines(d.review.answers), offer: num(d.review.offer), discount_total: num(d.review.discount_total) } : null,
    accepted_value: d.accepted_value === null ? null : num(d.accepted_value),
  };
}

async function call(fn: string, args: Record<string, unknown>): Promise<PublicEvaluation | null> {
  const { data, error } = await db.rpc(fn, args);
  throwIf(error);
  return toPublic(data);
}

export const publicGet = (token: string) => call("tradein_public_get", { p_token: token });
export const publicReview = (token: string, ruleIds: string[], note: string) =>
  call("tradein_public_review", { p_token: token, p_rule_ids: ruleIds, p_note: note || null });
export const publicAccept = (token: string) => call("tradein_public_accept", { p_token: token });

/** Sobe as fotos (convertidas para WebP) e avisa o banco, que reconta. */
export async function publicUploadPhotos(token: string, files: File[]): Promise<PublicEvaluation | null> {
  for (const original of files) {
    const file = await convertToWebP(original, { maxDimension: 1600, quality: 0.75 });
    const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : null;
    if (!ext) throw new Error("Formato de foto não aceito. Use JPG ou PNG.");
    if (file.size > 3 * 1024 * 1024) throw new Error("Foto muito grande (máximo 3 MB).");
    const { error } = await db.storage.from(BUCKET).upload(`${token}/${crypto.randomUUID()}.${ext}`, file, {
      contentType: file.type, upsert: false,
    });
    if (error) throw new Error(/row-level|policy|403/i.test(error.message) ? "Limite de fotos atingido ou link vencido." : error.message);
  }
  return call("tradein_public_photos_sent", { p_token: token });
}
