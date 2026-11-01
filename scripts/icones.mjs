// Génère les icônes PNG depuis public/icone.svg. iOS ignore les icônes SVG
// pour l'écran d'accueil : sans PNG, il prendrait une capture de la page.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const svg = readFileSync(new URL('../public/icone.svg', import.meta.url), 'utf8');
const navigateur = await chromium.launch();
for (const taille of [180, 192, 512]) {
  const page = await navigateur.newPage({ viewport: { width: taille, height: taille } });
  await page.setContent(`<style>html,body{margin:0}</style>${svg.replace('<svg ', `<svg width="${taille}" height="${taille}" `)}`);
  await page.screenshot({ path: new URL(`../public/icone-${taille}.png`, import.meta.url).pathname, omitBackground: false });
  await page.close();
}
await navigateur.close();
console.log('Icônes générées.');
