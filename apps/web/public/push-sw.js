/* global self */
// Web push handling, loaded into the generated service worker with importScripts.
self.addEventListener('push', (event) => {
  let data;
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'PetCare', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icon-192.png',
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if ('focus' in client)
          return client.focus().then(() => client.navigate && client.navigate(url));
      }
      return self.clients.openWindow(url);
    }),
  );
});
