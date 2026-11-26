import { describe, expect, it, vi } from "vitest";
import { isChunkLoadError, reloadForNewVersion } from "@/lib/staleBuild";

describe("versão nova publicada com o sistema aberto", () => {
  it("reconhece as falhas de carregamento de tela dos navegadores", () => {
    expect(isChunkLoadError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/index-BmFaYkhC.js"))).toBe(true);
    expect(isChunkLoadError(new TypeError("error loading dynamically imported module"))).toBe(true);
    expect(isChunkLoadError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isChunkLoadError("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of \"text/html\". Strict MIME type checking is enforced for module scripts per HTML spec. 'text/html' is not a valid JavaScript MIME type.")).toBe(true);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });

  it("recarrega uma vez e não entra em loop", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string): void => void store.set(k, v) };
    const reload = vi.fn();
    expect(reloadForNewVersion({ storage, now: 1_000_000, reload })).toBe(true);
    expect(reloadForNewVersion({ storage, now: 1_010_000, reload })).toBe(false); // 10 s depois: não repete
    expect(reloadForNewVersion({ storage, now: 1_040_000, reload })).toBe(true); // passou 30 s: pode de novo
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("sem armazenamento (aba privada bloqueada) ainda recarrega", () => {
    const reload = vi.fn();
    expect(reloadForNewVersion({ storage: null, now: 5, reload })).toBe(false); // 5 ms desde 0: dentro do intervalo
    expect(reloadForNewVersion({ storage: null, now: 60_000, reload })).toBe(true);
  });
});
