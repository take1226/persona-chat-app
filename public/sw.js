// public/sw.js
// iPhone Safari の Web Push (iOS 16.4+) に対応したService Worker

self.addEventListener('push', function(event) {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: 'メッセージ', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.persona_id || 'message',       // 同じペルソナの通知はまとめる
    renotify: true,                           // 同じtag でも毎回鳴らす
    data: {
      url: data.url || '/',
      persona_id: data.persona_id,
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'メッセージ', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // すでに開いているタブがあればフォーカス
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新しいタブで開く
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('install', function() {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});
