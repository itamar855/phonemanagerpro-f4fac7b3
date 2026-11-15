import { describe, expect, it } from "vitest";
import { avatarExpiresAt, avatarUsable, needsAvatarRefresh } from "../../../supabase/functions/_shared/avatar";
import { avatarUsable as clientUsable } from "../../modules/crm/lib/avatar";

const now = new Date("2026-11-15T14:00:00Z");
const link = (d: Date) => `https://pps.whatsapp.net/v/t61/abc.jpg?ccb=11-4&oh=01_x&oe=${Math.floor(d.getTime() / 1000).toString(16).toUpperCase()}&_nc_sid=5e03e0`;
const inDays = (n: number) => new Date(now.getTime() + n * 86400_000);

describe("foto de perfil do WhatsApp", () => {
  it("lê a validade do link", () => {
    expect(avatarExpiresAt(link(inDays(10)))?.getTime()).toBe(Math.floor(inDays(10).getTime() / 1000) * 1000);
    expect(avatarExpiresAt("https://exemplo.com/foto.jpg")).toBeNull();
    expect(avatarExpiresAt(null)).toBeNull();
  });

  it("link vencido não é exibido (servidor e tela concordam)", () => {
    for (const fn of [avatarUsable, clientUsable]) {
      expect(fn(link(inDays(10)), now)).toBe(true);
      expect(fn(link(inDays(-1)), now)).toBe(false);
      expect(fn(null, now)).toBe(false);
      expect(fn("https://exemplo.com/foto.jpg", now)).toBe(true);
    }
  });

  it("só busca de novo quando precisa, no máximo 1 vez por dia", () => {
    expect(needsAvatarRefresh(null, null, now)).toBe(true);
    expect(needsAvatarRefresh(link(inDays(10)), null, now)).toBe(false);
    expect(needsAvatarRefresh(link(inDays(0.5)), null, now)).toBe(true); // vence em menos de 1 dia
    expect(needsAvatarRefresh(null, new Date(now.getTime() - 3600_000).toISOString(), now)).toBe(false); // tentou há 1 h
    expect(needsAvatarRefresh(null, inDays(-2).toISOString(), now)).toBe(true);
  });
});
