// Autenticação do webhook da Evolution API.
// Módulo puro (sem imports de Deno) para ser testado pelo Vitest.

export const WEBHOOK_SECRET_HEADER = "x-evolution-webhook-secret";

export type WebhookAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; error: string };

interface HeaderReader {
  get(name: string): string | null;
}

/** Comparação em tempo constante para não vazar o segredo por tempo de resposta. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Fail-closed: sem segredo configurado no servidor, o webhook não aceita nada.
 * Com segredo, exige o header exato.
 */
export function checkWebhookAuth(headers: HeaderReader, envSecret: string | undefined): WebhookAuthResult {
  if (!envSecret) {
    return { ok: false, status: 500, error: "Webhook indisponível" };
  }
  const received = headers.get(WEBHOOK_SECRET_HEADER);
  if (!received || !safeEqual(received, envSecret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}

export const INTERNAL_HEADER = "x-crm-internal";

/**
 * Reenvio interno de mensagem antiga (sincronizar o CRM com a Evolution): `replay: true` no
 * corpo só vale com o segredo interno do cron (CRM_CRON_SECRET) no header x-crm-internal.
 * Em replay a mensagem é gravada sem IA, etiquetas, aviso no celular nem assistente da equipe.
 */
export function checkReplay(headers: HeaderReader, body: { replay?: unknown; [key: string]: unknown } | null, cronSecret: string | undefined):
  { ok: true; replay: boolean } | { ok: false; status: 401; error: string } {
  if (body?.replay !== true) return { ok: true, replay: false };
  const received = headers.get(INTERNAL_HEADER);
  if (!cronSecret || !received || !safeEqual(received, cronSecret)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true, replay: true };
}
