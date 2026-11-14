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
