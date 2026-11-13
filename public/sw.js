// PKM ERP service worker — แสดงแจ้งเตือนเด้ง (Web Push) และเปิดหน้าที่เกี่ยวข้องเมื่อกด
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data ? event.data.text() : "" }; }
  const title = data.title || "PKM ERP";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "มีแจ้งเตือนใหม่",
    icon: "/icon.png",
    badge: "/icon.png",
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || "/work/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/work", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.location.origin) && "focus" in c) { await c.focus(); if ("navigate" in c) return c.navigate(url); return; }
    }
    return self.clients.openWindow(url);
  })());
});
