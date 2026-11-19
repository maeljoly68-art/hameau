#!/usr/bin/env node
// Convertit un canevas « Design » de Claude en UNE page que la liseuse de Hameau sait afficher.
//
//   node scripts/cours/convertir.mjs <dossier du canevas> <sortie.html>
//
// Le dossier est celui que l'outil Artifact remplit : project/canvas.json (l'index) et project/*.dc.html (une
// planche par fichier). Sur claude.ai, un canevas se regarde planche par planche dans un éditeur graphique ; ici,
// les planches sont mises bout à bout, dans l'ordre du canevas, chacune dans une <section> qui porte son nom
// (l'ancre que Hameau relie à une page de cours). Les liens d'une planche à l'autre deviennent des ancres.
//
// Une planche figée garde son HTML tel quel. Une planche vivante (flashcards, quiz, « Teste-toi ») garde son gabarit
// et son code : c'est le moteur de Hameau (src/liseuse/moteur-dc.js) qui les fait tourner à l'affichage.
//
// Certaines planches ont leur propre encre (« ink:… ») qui garde les traits dans le navigateur, sans les partager
// entre appareils : on la retire, la liseuse de Hameau fournit la sienne, synchronisée.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FORMAT = 1;
const MARGE = 24;

const echapper = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Les règles d'une planche, portées par sa section : « a{…} » ne doit pas colorer les liens des autres planches. */
export function porterCss(css, portee) {
  const propre = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let sortie = '';
  let i = 0;
  while (i < propre.length) {
    const ouvre = propre.indexOf('{', i);
    if (ouvre < 0) break;
    const tete = propre.slice(i, ouvre).trim();
    let profondeur = 1;
    let j = ouvre + 1;
    while (j < propre.length && profondeur > 0) {
      if (propre[j] === '{') profondeur++;
      else if (propre[j] === '}') profondeur--;
      j++;
    }
    const corps = propre.slice(ouvre + 1, j - 1);
    if (/^@(media|supports|container)/.test(tete)) sortie += `${tete}{${porterCss(corps, portee)}}`;
    else if (tete.startsWith('@')) sortie += `${tete}{${corps}}`;
    else if (tete) {
      let surLaPlanche = false;
      const selecteurs = tete
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
          if (/^(html|body|:root)$/.test(s)) {
            surLaPlanche = true;
            return portee;
          }
          return `${portee} ${s.replace(/^(html|body)\s+/, '')}`;
        });
      // « body{margin:0} » n'a pas de sens pour une section : le fond, oui (il colore toute la largeur de la planche).
      const declarations = surLaPlanche ? corps.replace(/(^|;)\s*margin\s*:[^;]*/g, '$1') : corps;
      sortie += `${selecteurs.join(',')}{${declarations}}`;
    }
    i = j;
  }
  return sortie;
}

/** Ce qu'il reste d'une planche une fois son encre locale retirée. */
export function sansEncre(balisage, code) {
  const html = balisage.replace(/<!-- ink:(\w+) -->[\s\S]*?<!-- \/ink:\1 -->/g, '').replace(/ id="ink-page"/g, '');
  let logique = code;
  if (/\/\/ ink:start[\s\S]*?\/\/ ink:end/.test(code)) {
    if (!/\bbaseVals\s*\(/.test(code)) throw new Error('encre sans baseVals() : la planche ne saurait plus quoi afficher');
    logique = code.replace(/\/\/ ink:start[\s\S]*?\/\/ ink:end/, 'renderVals() { return this.baseVals() || {}; }');
  }
  return { html, logique };
}

export function lienInterne(href) {
  const m = /(?:^|\/)([A-Za-z0-9_][A-Za-z0-9_.-]*)\.dc\.html(?:#.*)?$/.exec(href.trim());
  return m ? `#${m[1]}` : href;
}

function analyser(fichier, cadre, source) {
  const id = fichier.replace(/\.dc\.html$/, '');
  const helmet = /<helmet>([\s\S]*?)<\/helmet>/.exec(source)?.[1] ?? '';
  const liens = [...helmet.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  const css = [...helmet.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  let balisage = (/<x-dc>([\s\S]*)<\/x-dc>/.exec(source)?.[1] ?? '').replace(/<helmet>[\s\S]*?<\/helmet>/, '');
  const code = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(source)?.[1] ?? '';
  const { html, logique } = sansEncre(balisage, code);
  balisage = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\b(href|xlink:href)="([^"{]*?\.dc\.html(?:#[^"]*)?)"/g, (_, attr, href) => `${attr}="${lienInterne(href)}"`)
    // Un lien vers l'extérieur s'ouvre à côté : la liseuse ne doit pas être remplacée par le site.
    .replace(/<a\b(?![^>]*\btarget=)([^>]*\bhref="https?:[^"]*")/g, '<a target="_blank" rel="noopener noreferrer"$1')
    .trim();
  const vivante = /\{\{|<sc-(for|if)\b|<dc-import\b/.test(balisage);
  const texte = balisage.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
  return {
    id,
    titre: cadre.title || /<title>([\s\S]*?)<\/title>/.exec(source)?.[1]?.trim() || id,
    largeur: Math.round(cadre.w || 900),
    fluide: cadre.expand === 'fill',
    liens,
    css,
    balisage,
    logique: logique.trim(),
    vivante,
    vide: !vivante && texte.length === 0,
  };
}

export function convertir(dossier) {
  const canevas = JSON.parse(readFileSync(join(dossier, 'project', 'canvas.json'), 'utf8'));
  const premierePage = Array.isArray(canevas.pages) && canevas.pages.length > 0 ? canevas.pages[0].id : null;
  const planches = [];
  const absentes = [];
  for (const fichier of canevas.order ?? Object.keys(canevas.boards ?? {})) {
    const cadre = canevas.boards?.[fichier];
    if (!cadre) continue;
    // Les autres pages du canevas sont des brouillons (un plan de travail vide, une version abandonnée).
    if (premierePage && cadre.page && cadre.page !== premierePage) continue;
    const chemin = join(dossier, 'project', fichier);
    if (!existsSync(chemin)) {
      absentes.push(fichier);
      continue;
    }
    const p = analyser(fichier, cadre, readFileSync(chemin, 'utf8'));
    if (!p.vide) planches.push(p);
  }
  if (planches.length === 0) throw new Error(`aucune planche lisible dans ${dossier}`);

  const largeur = Math.max(...planches.map((p) => p.largeur)) + 2 * MARGE;
  const polices = [...new Set(planches.flatMap((p) => p.liens))];
  const css = planches.map((p) => porterCss(p.css, `.planche[data-page="${p.id}"]`)).join('\n');
  const sections = planches
    .map((p) => {
      const attributs = `class="planche${p.fluide ? ' fluide' : ''}" id="${echapper(p.id)}" data-page="${echapper(p.id)}" data-titre="${echapper(p.titre)}" style="width:${p.largeur}px"`;
      if (!p.vivante) return `<section ${attributs}>\n${p.balisage}\n</section>`;
      const code = p.logique.replace(/<\/script/gi, '<\\/script');
      return `<section ${attributs}>\n<template data-dc>\n${p.balisage}\n</template>\n<script type="text/x-dc-logic">\n${code}\n</script>\n</section>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="hameau-format" content="${FORMAT}">
<meta name="hameau-largeur" content="${largeur}">
<title>${echapper(canevas.title ?? 'Cours')}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${polices.join('\n')}
<style>
html{-webkit-text-size-adjust:100%;text-size-adjust:100%}
body{margin:0;background:#D7DBE2}
#document{box-sizing:border-box;width:${largeur}px;margin:0 auto;padding:${MARGE}px ${MARGE}px 200px;display:flex;flex-direction:column;align-items:center;gap:40px}
.planche{position:relative;flex:none;overflow:hidden;border-radius:8px;box-shadow:0 1px 3px rgba(20,24,32,.12),0 12px 32px rgba(20,24,32,.12);scroll-margin-top:16px}
${css}
</style>
</head>
<body>
<main id="document">
${sections}
</main>
</body>
</html>
`;
  return { html, planches: planches.map((p) => ({ id: p.id, titre: p.titre, vivante: p.vivante })), absentes, largeur };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [dossier, sortie] = process.argv.slice(2);
  if (!dossier || !sortie) {
    console.error('Usage : node scripts/cours/convertir.mjs <dossier du canevas> <sortie.html>');
    process.exit(1);
  }
  const r = convertir(dossier);
  writeFileSync(sortie, r.html);
  console.log(`${sortie} : ${r.planches.length} planches, ${Math.round(r.html.length / 1024)} Ko, largeur ${r.largeur}px`);
  for (const p of r.planches) console.log(`  ${p.vivante ? '◆' : '·'} ${p.id} — ${p.titre}`);
  if (r.absentes.length) console.log(`  absentes du canevas publié : ${r.absentes.join(', ')}`);
}
