// Tourne sur la page de Hameau seulement. Deux choses :
//  - l'application prévient (message de la page) qu'un chrono a commencé, fini ou changé de pause : on demande alors
//    au service de vérifier tout de suite, sans attendre les 30 secondes. Le message ne porte AUCUNE donnée : l'état
//    vient toujours de la base, jamais d'une page ;
//  - l'application demande si l'extension est là (pour le dire dans les Réglages et pendant le chrono) : on répond avec sa
//    version et son état (connectée à un compte ? en train de bloquer ?), jamais avec une donnée du compte.
window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== window.location.origin || !e.data) return;
  if (e.data.source === 'hameau-session') void chrome.runtime.sendMessage({ type: 'verifier' }).catch(() => undefined);
  else if (e.data.source === 'hameau-ping') {
    chrome.runtime.sendMessage({ type: 'statut' }).then(
      (st) => window.postMessage({ source: 'hameau-extension', version: chrome.runtime.getManifest().version, connecte: st?.connecte === true, bloque: st?.bloque === true, enCours: st?.enCours === true }, window.location.origin),
      // Le service ne répond pas : on dit au moins que l'extension est là.
      () => window.postMessage({ source: 'hameau-extension', version: chrome.runtime.getManifest().version }, window.location.origin),
    );
  }
});
