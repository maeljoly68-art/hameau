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

// Un clic sur une notification ramène dans l'app, sur l'onglet qu'elle annonce (« ./?onglet=cours » pour le rappel du
// jour). Si l'app est déjà ouverte, on la montre et on lui dit où aller ; sinon, on l'ouvre à cet endroit.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const cible = (e.notification.data && e.notification.data.url) || './';
  const onglet = new URL(cible, self.registration.scope).searchParams.get('onglet');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((fenetres) => {
      const ouverte = fenetres.find((f) => 'focus' in f);
      if (!ouverte) return self.clients.openWindow(cible);
      if (onglet) ouverte.postMessage({ type: 'hameau-ouvrir', onglet });
      return ouverte.focus();
    }),
  );
});

// Un rappel poussé par le serveur (voir supabase/functions/rappel-push) : « 3 pages à apprendre par cœur ».
// Sur iPhone, une notification push DOIT s'afficher (sinon Safari retire l'abonnement) : d'où le message par défaut.
self.addEventListener('push', (e) => {
  let charge = {};
  try {
    charge = e.data ? e.data.json() : {};
  } catch {
    charge = {};
  }
  e.waitUntil(
    self.registration.showNotification(charge.titre || 'Hameau', {
      body: charge.corps || 'Ton rappel du jour t’attend.',
      icon: 'icone-192.png',
      badge: 'icone-192.png',
      tag: 'hameau-rappel-du-jour', // un nouveau rappel remplace l'ancien au lieu de s'empiler
      data: { url: charge.url || './' },
    }),
  );
});
