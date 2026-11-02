// Service worker : les fichiers à empreinte (assets/…-HASH.js) ne changent
// jamais, on les sert depuis le cache sans attendre le réseau. La page, elle,
// passe par le réseau d'abord : « cache d'abord » servirait indéfiniment une
// ancienne version après chaque mise à jour.
const CACHE = 'hameau-v2';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Seulement les fichiers de l'app : jamais les appels à Supabase, dont une
  // réponse en cache afficherait des sessions périmées comme si de rien n'était.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.includes('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (r) =>
          r ??
          fetch(req).then((rep) => {
            if (rep.ok) {
              const copie = rep.clone();
              void caches.open(CACHE).then((c) => c.put(req, copie));
            }
            return rep;
          }),
      ),
    );
    return;
  }

  e.respondWith(
    fetch(req)
      .then((rep) => {
        if (rep.ok) {
          const copie = rep.clone();
          void caches.open(CACHE).then((c) => c.put(req, copie));
        }
        return rep;
      })
      .catch(() => caches.match(req).then((r) => r ?? caches.match('./'))),
  );
});

// Un clic sur la notification « objectif atteint » ramène dans l'app.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      const ouverte = fenetres.find((f) => 'focus' in f);
      return ouverte ? ouverte.focus() : self.clients.openWindow('./');
    }),
  );
});
