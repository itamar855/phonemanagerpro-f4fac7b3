// Mesma regra de supabase/functions/_shared/avatar.ts (o link da foto do WhatsApp
// expira; o parâmetro "oe" traz a validade em hexadecimal).

export function avatarUsable(url: string | null | undefined, now = new Date()): boolean {
  if (!url) return false;
  const m = /[?&]oe=([0-9a-f]+)/i.exec(url);
  if (!m) return true;
  const secs = parseInt(m[1], 16);
  return !Number.isFinite(secs) || secs * 1000 - now.getTime() > 60 * 60 * 1000;
}
