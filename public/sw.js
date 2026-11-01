// Service worker minimal : réseau d'abord, cache en secours. « Cache d'abord »
// servirait indéfiniment une ancienne version après chaque mise à jour.
const CACHE = 'hameau-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Seulement les fichiers de l'app : jamais les appels à Supabase, dont une
  // réponse en cache afficherait des sessions périmées comme si de rien n'était.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
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
