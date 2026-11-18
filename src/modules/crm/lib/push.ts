// Avisos no celular (Web Push): o que o aparelho suporta e conversão da chave VAPID.

export type PushSupport = "ok" | "ios-install" | "unsupported";

export interface PushEnv {
  userAgent: string;
  standalone: boolean; // aberto como app instalado (Tela de Início)
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
}

export function isIos(userAgent: string): boolean {
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile/.test(userAgent));
}

/**
 * iPhone/iPad só recebem push com o site instalado na Tela de Início (iOS 16.4+): no Safari comum
 * não existe PushManager. Nos outros, basta o navegador ter service worker + push + notificação.
 */
export function pushSupport(env: PushEnv): PushSupport {
  const apis = env.hasServiceWorker && env.hasPushManager && env.hasNotification;
  if (isIos(env.userAgent) && !env.standalone) return "ios-install";
  return apis ? "ok" : "unsupported";
}

export function currentPushEnv(): PushEnv {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const win = typeof window !== "undefined" ? window : undefined;
  return {
    userAgent: nav?.userAgent ?? "",
    standalone: Boolean(win?.matchMedia?.("(display-mode: standalone)").matches || (nav as { standalone?: boolean } | undefined)?.standalone),
    hasServiceWorker: Boolean(nav && "serviceWorker" in nav),
    hasPushManager: Boolean(win && "PushManager" in win),
    hasNotification: Boolean(win && "Notification" in win),
  };
}

/** Chave pública VAPID (base64url) → bytes, formato que o pushManager.subscribe pede. */
export function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
