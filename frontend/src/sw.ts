/// <reference lib="webworker" />

import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Receive incoming push notifications
self.addEventListener("push", (event: PushEvent) => {
  let title = "Dumo Youth Network";
  let body = "You have a new notification.";
  let url = "/";

  if (event.data) {
    try {
      const data = event.data.json();

      if (typeof data.title === "string") {
        title = data.title;
      }

      if (typeof data.body === "string") {
        body = data.body;
      }

      if (
        typeof data.url === "string" &&
        data.url.startsWith("/") &&
        !data.url.startsWith("//")
      ) {
        url = data.url;
      }
    } catch {
      body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/dyn-favicon-192.png",
      badge: "/dyn-favicon-32.png",
      tag: "dyn-notification",
      data: { url },
    })
  );
});

// Open Dumo Network when a notification is clicked
self.addEventListener("notificationclick", (event: NotificationEvent) => {
  event.notification.close();

  const requestedUrl = event.notification.data?.url;
  const path =
    typeof requestedUrl === "string" &&
    requestedUrl.startsWith("/") &&
    !requestedUrl.startsWith("//")
      ? requestedUrl
      : "/";

  const targetUrl = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientsList) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })()
  );
});