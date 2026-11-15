/* eslint-disable @typescript-eslint/no-explicit-any -- cliente admin sem tipos gerados */
// Atualiza a foto de perfil dos contatos do CRM a partir do WhatsApp.
import { needsAvatarRefresh } from "./avatar.ts";
import { evolution, type EvolutionConfig } from "./evolution.ts";

interface AvatarRow { id: string; phone: string | null; avatar_url: string | null; avatar_checked_at: string | null }

/** Busca a foto dos contatos que precisam (sem foto ou com link vencendo). Nunca lança. */
export async function refreshAvatars(admin: any, cfg: EvolutionConfig, contacts: AvatarRow[], opts: { force?: boolean } = {}) {
  const due = contacts.filter((c) => c.phone && (opts.force || needsAvatarRefresh(c.avatar_url, c.avatar_checked_at)));
  let updated = 0;
  let evo: ReturnType<typeof evolution>;
  try { evo = evolution(cfg); } catch { return { checked: 0, updated: 0 }; }

  // 4 por vez para não sobrecarregar a Evolution
  for (let i = 0; i < due.length; i += 4) {
    await Promise.all(due.slice(i, i + 4).map(async (c) => {
      try {
        const url = await evo.profilePicture(String(c.phone).replace(/\D/g, ""));
        const patch: Record<string, unknown> = { avatar_checked_at: new Date().toISOString() };
        // sem foto agora: mantém a antiga só se ainda estiver válida
        if (url || !needsAvatarRefresh(c.avatar_url, null)) patch.avatar_url = url ?? c.avatar_url;
        else patch.avatar_url = null;
        const { error } = await admin.from("crm_contacts").update(patch).eq("id", c.id);
        if (!error && patch.avatar_url !== c.avatar_url) updated++;
      } catch (e) {
        console.error("[avatar]", c.id, (e as Error).message);
      }
    }));
  }
  return { checked: due.length, updated };
}
