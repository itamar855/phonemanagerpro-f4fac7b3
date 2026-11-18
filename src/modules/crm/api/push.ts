import { invokeFn } from "./db";
import { urlBase64ToUint8Array } from "../lib/push";

/** Service worker do app publicado (no modo de desenvolvimento não existe: devolve null em vez de esperar para sempre). */
export async function appServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await appServiceWorker();
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Pede a permissão, inscreve este aparelho e registra no servidor. */
export async function enablePush(): Promise<PushSubscription> {
  const reg = await appServiceWorker();
  if (!reg) throw new Error("Abra o sistema pelo endereço publicado (ou pelo app instalado) para ativar os avisos.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permissão de notificação negada. Libere nas configurações do navegador.");
  const { public_key } = await invokeFn<{ public_key: string }>("crm-push", { action: "public_key" });
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(public_key) });
  await invokeFn("crm-push", { action: "subscribe", subscription: sub.toJSON() });
  return sub;
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await invokeFn("crm-push", { action: "unsubscribe", endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe();
}

export async function testPush(endpoint?: string) {
  return invokeFn<{ sent: number }>("crm-push", { action: "test", endpoint });
}
