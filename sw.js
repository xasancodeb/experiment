// Sway service worker: shows push notifications and opens the question when one is tapped.
// It does not cache anything, so the site always loads fresh.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) {}
  e.waitUntil(self.registration.showNotification(d.title || 'Sway', {
    body: d.body || '',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || undefined,
    data: { url: d.url || './', q: d.tag || null }
  }));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var d = e.notification.data || {};
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (all) {
    for (var i = 0; i < all.length; i++) {
      if ('focus' in all[i]) { all[i].postMessage({ q: d.q }); return all[i].focus(); }
    }
    return self.clients.openWindow(d.url);
  }));
});
