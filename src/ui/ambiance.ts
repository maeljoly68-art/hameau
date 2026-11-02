// Ambiance « feu de camp » du mode focus : un bruit brun (grave, doux, qui
// couvre les bruits de fond sans fatiguer) et des crépitements. Tout est
// synthétisé : aucun fichier son à télécharger ni à mettre en cache.

export interface Ambiance {
  arreter(): void;
}

/** À appeler dans un geste de l'utilisateur (un clic) : iOS refuse le son sinon. */
export function demarrerAmbiance(): Ambiance | null {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const taux = ctx.sampleRate;

  // Bruit brun en boucle. Le raccord est fondu : sans ça, la boucle claque
  // toutes les dix secondes, exactement ce qu'on veut éviter en se concentrant.
  const longueur = taux * 10;
  const fondu = Math.floor(taux * 0.5);
  const brut = new Float32Array(longueur + fondu);
  let dernier = 0;
  for (let i = 0; i < brut.length; i++) {
    dernier = (dernier + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    brut[i] = dernier * 3.5;
  }
  const tampon = ctx.createBuffer(1, longueur, taux);
  const donnees = tampon.getChannelData(0);
  for (let i = 0; i < longueur; i++) {
    donnees[i] = i < fondu ? brut[i] * (i / fondu) + brut[longueur + i] * (1 - i / fondu) : brut[i];
  }

  const source = ctx.createBufferSource();
  source.buffer = tampon;
  source.loop = true;
  const grave = ctx.createBiquadFilter();
  grave.type = 'lowpass';
  grave.frequency.value = 650;
  const volume = ctx.createGain();
  volume.gain.setValueAtTime(0, ctx.currentTime);
  volume.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 2);
  source.connect(grave).connect(volume).connect(ctx.destination);
  source.start();

  let actif = true;
  let minuteur = 0;
  const crepiter = () => {
    if (!actif) return;
    const n = Math.floor(taux * 0.03);
    const b = ctx.createBuffer(1, n, taux);
    const c = b.getChannelData(0);
    for (let i = 0; i < n; i++) c[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 4;
    const s = ctx.createBufferSource();
    s.buffer = b;
    const aigu = ctx.createBiquadFilter();
    aigu.type = 'highpass';
    aigu.frequency.value = 1500 + Math.random() * 2500;
    const g = ctx.createGain();
    g.gain.value = 0.04 + Math.random() * 0.12;
    s.connect(aigu).connect(g).connect(volume);
    s.start();
    // Des grappes rapprochées, parfois un silence : un feu ne crépite pas au métronome.
    minuteur = window.setTimeout(crepiter, 80 + Math.random() * (Math.random() < 0.2 ? 900 : 350));
  };
  crepiter();

  return {
    arreter() {
      actif = false;
      window.clearTimeout(minuteur);
      const t = ctx.currentTime;
      volume.gain.cancelScheduledValues(t);
      volume.gain.setValueAtTime(volume.gain.value, t);
      volume.gain.linearRampToValueAtTime(0, t + 0.6);
      window.setTimeout(() => void ctx.close(), 800);
    },
  };
}
