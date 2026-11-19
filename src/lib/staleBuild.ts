// Versão nova publicada com o sistema aberto: os arquivos da versão antiga (assets/index-XXXX.js)
// deixam de existir e abrir uma tela ainda não carregada falha ("Failed to fetch dynamically
// imported module"). A saída é recarregar a página uma vez para pegar a versão nova.

const KEY = "stale-build-reload-at";
const MIN_INTERVAL_MS = 30_000; // evita ficar recarregando em loop se o erro for outro

const CHUNK_ERROR = new RegExp(
  [
    "Failed to fetch dynamically imported module", // Chrome / Edge
    "error loading dynamically imported module", // Firefox
    "Importing a module script failed", // Safari
    "Unable to preload CSS",
    "Loading chunk [\\w-]+ failed",
    "Loading CSS chunk",
    "is not a valid JavaScript MIME type",
  ].join("|"),
  "i",
);

export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = typeof err === "string" ? err : `${(err as Error).name ?? ""}: ${(err as Error).message ?? ""}`;
  return CHUNK_ERROR.test(msg);
}

interface Env { storage: Pick<Storage, "getItem" | "setItem"> | null; now: number; reload: () => void }

/** Recarrega uma vez (no máximo a cada 30 s). Devolve true se recarregou. */
export function reloadForNewVersion(env: Env = defaultEnv()): boolean {
  let last = 0;
  try { last = Number(env.storage?.getItem(KEY) ?? 0) || 0; } catch { /* armazenamento bloqueado */ }
  if (env.now - last < MIN_INTERVAL_MS) return false;
  try { env.storage?.setItem(KEY, String(env.now)); } catch { /* segue mesmo assim */ }
  env.reload();
  return true;
}

function defaultEnv(): Env {
  let storage: Storage | null = null;
  try { storage = window.sessionStorage; } catch { storage = null; }
  return { storage, now: Date.now(), reload: () => window.location.reload() };
}

/** Liga a recarga automática para falhas de carregamento fora do React (pré-carga do Vite, import() solto). */
export function installStaleBuildRecovery() {
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForNewVersion()) event.preventDefault();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason) && reloadForNewVersion()) event.preventDefault();
  });
}
