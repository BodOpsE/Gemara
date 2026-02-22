const CACHE_NAME = 'daf-hayomi-v9';
const ASSETS = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('/api/')) return; // Don't cache API calls
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

// Listen for notification trigger from the app
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SCHEDULE_REMINDER') {
    const delay = e.data.delay || 0;
    if (delay > 0) {
      setTimeout(() => {
        self.registration.showNotification('דַּף הַיּוֹמִי', {
          body: "You haven't learned today — 5 minutes before bed?",
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          tag: 'daily-reminder',
          renotify: true
        });
      }, delay);
    }
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({type: 'window'}).then(cs => {
    if (cs.length > 0) return cs[0].focus();
    return clients.openWindow('/');
  }));
});
