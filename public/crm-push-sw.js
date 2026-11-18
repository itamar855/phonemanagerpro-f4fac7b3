/* Avisos do CRM (Web Push). Carregado dentro do service worker do PWA (workbox importScripts). */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "Nova mensagem no CRM";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.tag || "crm",
      renotify: true,
      data: { url: data.url || "/crm/inbox" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/crm/inbox", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // já tem o app aberto: leva para a conversa nele
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin && "focus" in c) {
        await c.focus();
        if ("navigate" in c) { try { await c.navigate(url); } catch (e) { /* aba sem controle do SW */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
