import { useEffect, useRef } from 'react';
import type { Session } from '../core/types.ts';

/** Petit carillon synthétisé : aucun fichier son à télécharger ni à mettre en cache. */
export function carillon() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1);
    });
    window.setTimeout(() => void ctx.close(), 1600);
  } catch {
    // Pas de son possible : la notification et le message suffisent.
  }
}

export async function notifier(titre: string, corps: string) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try {
    // Passer par le service worker : c'est la seule voie qui marche dans une
    // app installée sur iPhone, et elle marche aussi ailleurs.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(titre, { body: corps, icon: 'icone-192.png', tag: 'hameau-objectif' });
    else new Notification(titre, { body: corps });
  } catch {
    // Refus du système : rien de plus à faire.
  }
}

/**
 * Prévient une fois quand l'objectif de la session est atteint. Un minuteur
 * calé sur l'échéance plutôt qu'une vérification chaque seconde, et le
 * souvenir de la session déjà annoncée, pour ne pas sonner à chaque rendu.
 */
export function useAlerteObjectif(session: Session | null, prevenir: (message: string) => void) {
  const annoncee = useRef<string | null>(null);
  useEffect(() => {
    if (!session || session.objectif === null) return;
    const echeance = Date.parse(session.debut) + session.objectif * 60_000;
    const reste = echeance - Date.now();
    // Objectif dépassé depuis longtemps (app rouverte bien après) : on ne
    // sonne pas pour un événement passé.
    if (reste < -60_000 || annoncee.current === session.id) return;
    const id = window.setTimeout(
      () => {
        annoncee.current = session.id;
        const message = `Objectif de ${session.objectif} min atteint !`;
        carillon();
        void notifier('Hameau', `${message} Fais une pause ou continue sur ta lancée.`);
        prevenir(message);
      },
      Math.max(0, reste),
    );
    return () => window.clearTimeout(id);
  }, [session, prevenir]);
}
