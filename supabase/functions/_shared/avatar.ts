// Foto de perfil do WhatsApp. O link (pps.whatsapp.net) expira: o parâmetro
// "oe" traz a validade em hexadecimal (segundos Unix). Funções puras, testadas
// em src/__tests__/business-rules/crm-avatar.test.ts.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Validade do link da foto, ou null se o link não informa. */
export function avatarExpiresAt(url: string | null | undefined): Date | null {
  if (!url) return null;
  const m = /[?&]oe=([0-9a-f]+)/i.exec(url);
  if (!m) return null;
  const secs = parseInt(m[1], 16);
  return Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000) : null;
}

/** Link ainda serve (com 1 h de folga)? Links sem validade contam como válidos. */
export function avatarUsable(url: string | null | undefined, now = new Date()): boolean {
  if (!url) return false;
  const exp = avatarExpiresAt(url);
  return !exp || exp.getTime() - now.getTime() > 60 * 60 * 1000;
}

/**
 * Precisa buscar a foto de novo? Sim quando não há foto válida (ou vence em menos
 * de 1 dia) e a última tentativa foi há mais de 1 dia (quem não tem foto não é
 * consultado a cada mensagem).
 */
export function needsAvatarRefresh(url: string | null | undefined, checkedAt: string | null | undefined, now = new Date()): boolean {
  const exp = avatarExpiresAt(url);
  const fresh = Boolean(url) && (!exp || exp.getTime() - now.getTime() > DAY_MS);
  if (fresh) return false;
  if (!checkedAt) return true;
  return now.getTime() - new Date(checkedAt).getTime() > DAY_MS;
}
