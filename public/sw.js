// Service Worker — Tele Agent PWA
const CACHE = 'tele-agent-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Recebe notificações push
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Tele Agent', {
      body: data.body || 'Nova mensagem recebida',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: data.tag || 'msg',
      data: data,
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open', title: 'Ver' },
        { action: 'close', title: 'Fechar' }
      ]
    })
  );
});

// Clique na notificação — abre o app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'close') return;
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.includes('/mobile')) return c.focus();
      }
      return clients.openWindow('/mobile');
    })
  );
});
