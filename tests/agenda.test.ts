import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HORIZON_PARTIEL,
  MAX_CRENEAUX,
  chargeParJour,
  creneauxParJour,
  creneauxValides,
  emploiDuTemps,
  heure,
  lireICalendrier,
  motifsDe,
  normaliser,
  partielProbable,
  plageHeures,
  premierJour,
  prochainCreneau,
  rattacher,
  salleCourte,
  typeDeCreneau,
  type Creneau,
  type CoursPourAgenda,
} from '../src/core/agenda.ts';

// Le format est celui du vrai flux de l'université : heures en UTC (« Z »), virgules et points-virgules échappés.
let n = 0;
const ev = (debut: string, fin: string, titre: string, plus: string[] = []) => ['BEGIN:VEVENT', `DTSTART:${debut}`, `DTEND:${fin}`, `SUMMARY:${titre}`, `UID:test-${++n}@exemple`, ...plus, 'END:VEVENT'].join('\r\n');
const cal = (...evs: string[]) => ['BEGIN:VCALENDAR', ...evs, 'END:VCALENDAR', ''].join('\r\n');
const lire = (...evs: string[]) => lireICalendrier(cal(...evs))!;

const cr = (jour: string, debut: number, fin: number, titre: string, extra: Partial<Creneau> = {}): Creneau => ({ id: `${jour}-${debut}-${titre}`, jour, debut, fin, titre, lieu: '', type: typeDeCreneau(titre), journee: false, ...extra });
const h = (hh: number, mm = 0) => hh * 60 + mm;

test('un créneau du flux est lu en heure de Strasbourg : l’hiver à UTC+1, l’été à UTC+2', () => {
  const [hiver] = lire(ev('20261106T124500Z', '20261106T144500Z', 'Droit spécial des sociétés CM')).creneaux;
  assert.deepEqual([hiver.jour, hiver.debut, hiver.fin, hiver.type, hiver.titre], ['2026-11-06', h(13, 45), h(15, 45), 'cm', 'Droit spécial des sociétés CM']);
  // « rattrapage S6 », samedi 19 juin 2027, 8 h 30 – 12 h 30 à Strasbourg.
  const [ete] = lire(ev('20270619T063000Z', '20270619T103000Z', 'rattrapage S6')).creneaux;
  assert.deepEqual([ete.jour, ete.debut, ete.fin], ['2027-06-19', h(8, 30), h(12, 30)]);
});

test('au changement d’heure, la date et l’heure suivent le fuseau de l’université, pas l’UTC', () => {
  // 24 oct. 22 h 30 UTC = 25 oct. 0 h 30 à Paris (encore l’heure d’été).
  const [avant] = lire(ev('20261024T223000Z', '20261024T233000Z', 'Nuit')).creneaux;
  assert.deepEqual([avant.jour, avant.debut, avant.fin], ['2026-10-25', h(0, 30), h(1, 30)]);
  // Le même dimanche, 1 h 30 UTC = 2 h 30 : l’heure d’hiver est passée par là.
  const [apres] = lire(ev('20261025T013000Z', '20261025T023000Z', 'Matin')).creneaux;
  assert.deepEqual([apres.jour, apres.debut, apres.fin], ['2026-10-25', h(2, 30), h(3, 30)]);
  // Au printemps, le 28 mars 2027, 1 h UTC = 3 h (heure d’été).
  const [ressort] = lire(ev('20270328T010000Z', '20270328T020000Z', 'Printemps')).creneaux;
  assert.deepEqual([ressort.jour, ressort.debut], ['2027-03-28', h(3)]);
});

test('une heure « locale » est lue dans son fuseau, ou à Strasbourg faute de fuseau', () => {
  const evt = (dtstart: string, dtend: string) => ['BEGIN:VEVENT', dtstart, dtend, 'SUMMARY:Local', 'UID:loc', 'END:VEVENT'].join('\r\n');
  // 8 h à New York le 6 nov. 2026 (heure d’hiver, UTC−5) = 14 h à Paris.
  assert.deepEqual(lire(evt('DTSTART;TZID=America/New_York:20261106T080000', 'DTEND;TZID=America/New_York:20261106T090000')).creneaux.map((c) => [c.jour, c.debut, c.fin]), [['2026-11-06', h(14), h(15)]]);
  assert.deepEqual(lire(evt('DTSTART;TZID=Europe/Paris:20261106T134500', 'DTEND;TZID=Europe/Paris:20261106T154500')).creneaux.map((c) => [c.debut, c.fin]), [[h(13, 45), h(15, 45)]]);
  assert.deepEqual(lire(evt('DTSTART:20261106T134500', 'DTEND:20261106T154500')).creneaux.map((c) => [c.debut, c.fin]), [[h(13, 45), h(15, 45)]], 'sans fuseau');
  assert.deepEqual(lire(evt('DTSTART;TZID=Pas/UnFuseau:20261106T134500', 'DTEND;TZID=Pas/UnFuseau:20261106T154500')).creneaux.map((c) => [c.debut, c.fin]), [[h(13, 45), h(15, 45)]], 'fuseau inconnu');
});

test('une heure locale juste avant le retour à l’heure d’hiver reste du bon côté du changement', () => {
  // 1 h 30 « locale » le 25 oct. 2026 existe deux fois à Paris ; la première (heure d’été) est à 23 h 30 UTC la veille.
  // Lue comme si c’était de l’UTC, elle tomberait après le changement : il faut une deuxième passe pour la rattraper.
  const evt = ['BEGIN:VEVENT', 'DTSTART;TZID=Europe/Paris:20261025T013000', 'DTEND;TZID=Europe/Paris:20261025T020000', 'SUMMARY:Nuit du changement', 'UID:chg', 'END:VEVENT'].join('\r\n');
  const [c] = lire(evt).creneaux;
  assert.deepEqual([c.jour, c.debut, c.fin], ['2026-10-25', h(1, 30), h(2)]);
});

test('un créneau qui finit pile à minuit ne crée pas de morceau vide le lendemain', () => {
  // 22 h → minuit à Paris (UTC+1).
  const nuit = lire(ev('20261106T210000Z', '20261106T230000Z', 'Jusqu’à minuit')).creneaux;
  assert.deepEqual(nuit.map((c) => [c.jour, c.debut, c.fin]), [['2026-11-06', h(22), h(24)]]);
});

test('un créneau qui passe minuit est coupé par jour, une journée entière couvre ses jours', () => {
  // 22 h 30 → 0 h 30 à Paris (UTC+1).
  const nuit = lire(ev('20261106T213000Z', '20261106T233000Z', 'Veillée')).creneaux;
  assert.deepEqual(nuit.map((c) => [c.jour, c.debut, c.fin]), [['2026-11-06', h(22, 30), 1440], ['2026-11-07', 0, h(0, 30)]]);
  assert.equal(new Set(nuit.map((c) => c.id)).size, 2, 'deux identifiants distincts');
  // Du 24 au 27 décembre (fin exclue) : 24, 25 et 26.
  const vac = lire(['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261224', 'DTEND;VALUE=DATE:20261227', 'SUMMARY:Vacances', 'UID:vac', 'END:VEVENT'].join('\r\n')).creneaux;
  assert.deepEqual(vac.map((c) => [c.jour, c.journee]), [['2026-12-24', true], ['2026-12-25', true], ['2026-12-26', true]]);
  // Sans fin, une journée entière est un jour.
  assert.equal(lire(['BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261224', 'SUMMARY:Férié', 'UID:f', 'END:VEVENT'].join('\r\n')).creneaux.length, 1);
});

test('lignes repliées, caractères échappés, alarme imbriquée', () => {
  const brut = cal(
    ['BEGIN:VEVENT', 'DTSTART:20261104T074500Z', 'DTEND:20261104T094500Z', 'SUMMARY:Droit spécial des', '  sociétés CM', 'LOCATION:Amphi 3 (SCH  -SITE SCHILTIGHEIM\\, IUT LOUIS PASTEUR\\, AMPHI)\\;B1.12 TD', 'DESCRIPTION:Filières : GEA5\\nIntervenants : Dupont', 'UID:plie', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Rappel', 'SUMMARY:Alarme', 'END:VALARM', 'END:VEVENT'].join('\r\n'),
  );
  const [c] = lireICalendrier(brut)!.creneaux;
  assert.equal(c.titre, 'Droit spécial des sociétés CM');
  assert.equal(c.lieu, 'Amphi 3 (SCH -SITE SCHILTIGHEIM, IUT LOUIS PASTEUR, AMPHI);B1.12 TD');
  assert.equal(c.id, 'plie');
  // Des fins de ligne sans retour chariot (fichier enregistré sous Unix) donnent la même chose.
  assert.deepEqual(lireICalendrier(brut.replace(/\r\n/g, '\n'))!.creneaux, lireICalendrier(brut)!.creneaux);
});

test('les propriétés d’une alarme ne sont pas celles de l’événement', () => {
  const sansTitre = ['BEGIN:VEVENT', 'DTSTART:20261106T124500Z', 'DTEND:20261106T144500Z', 'UID:al', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'SUMMARY:Alarme', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  assert.equal(lire(sansTitre).creneaux[0].titre, 'Sans titre', 'le titre de l’alarme n’est pas celui du créneau');
  // Et l’événement suivant, lu après l’alarme, l’est bien.
  assert.equal(lire(sansTitre, ev('20261107T124500Z', '20261107T144500Z', 'Suivant')).creneaux.length, 2);
});

test('annulé, illisible, répétitif, sans fin : chacun traité à part', () => {
  const l = lire(
    ev('20261106T124500Z', '20261106T144500Z', 'Annulé', ['STATUS:CANCELLED']),
    ev('20261340T000000Z', '20261340T010000Z', 'Date impossible'),
    ['BEGIN:VEVENT', 'SUMMARY:Sans début', 'UID:sd', 'END:VEVENT'].join('\r\n'),
    ev('20261109T124500Z', '20261109T144500Z', 'Chaque lundi', ['RRULE:FREQ=WEEKLY;COUNT=10']),
    ['BEGIN:VEVENT', 'DTSTART:20261110T124500Z', 'SUMMARY:Sans fin', 'UID:sf', 'END:VEVENT'].join('\r\n'),
    ev('20261111T144500Z', '20261111T124500Z', 'Fin avant début'),
  );
  assert.deepEqual(l.creneaux.map((c) => c.titre), ['Chaque lundi', 'Sans fin', 'Fin avant début'], 'l’annulé ne compte pas, les illisibles non plus');
  assert.equal(l.ignores, 2, 'la date impossible et l’absence de début');
  assert.equal(l.recurrents, 1);
  assert.deepEqual(l.creneaux.slice(1).map((c) => c.fin - c.debut), [60, 60], 'une heure faute de fin');
  // Début et fin identiques : pas de créneau d’une minute, une heure comme sans fin.
  assert.equal(lire(ev('20261106T124500Z', '20261106T124500Z', 'Instantané')).creneaux[0].fin - h(13, 45), 60);
});

test('ce qui n’est pas un calendrier est refusé, un BOM est toléré', () => {
  assert.equal(lireICalendrier('<html><body>Connexion</body></html>'), null);
  assert.equal(lireICalendrier(''), null);
  assert.equal(lireICalendrier(String.fromCharCode(0xfeff) + cal(ev('20261106T124500Z', '20261106T144500Z', 'X')))!.creneaux.length, 1);
  assert.deepEqual(lireICalendrier(cal()), { creneaux: [], ignores: 0, recurrents: 0 });
});

test('le même identifiant lu deux fois ne donne qu’un créneau, et le nombre de créneaux est plafonné', () => {
  const e = ev('20261106T124500Z', '20261106T144500Z', 'Doublon');
  assert.equal(lire(e, e).creneaux.length, 1);
  const beaucoup = Array.from({ length: MAX_CRENEAUX + 5 }, (_, i) => `BEGIN:VEVENT\r\nDTSTART:20261106T124500Z\r\nDTEND:20261106T144500Z\r\nSUMMARY:E${i}\r\nUID:u${i}\r\nEND:VEVENT`);
  const l = lire(...beaucoup);
  assert.equal(l.creneaux.length, MAX_CRENEAUX);
  assert.equal(l.ignores, 5);
});

test('les créneaux sont rendus dans l’ordre du temps', () => {
  const l = lire(ev('20261107T124500Z', '20261107T144500Z', 'Samedi'), ev('20261106T154500Z', '20261106T164500Z', 'Soir'), ev('20261106T074500Z', '20261106T094500Z', 'Matin'));
  assert.deepEqual(l.creneaux.map((c) => c.titre), ['Matin', 'Soir', 'Samedi']);
});

test('CM, TD, TP ou SAÉ d’après l’intitulé', () => {
  const cas: [string, string][] = [
    ['Droit spécial des sociétés CM', 'cm'],
    ['Contrôle de gestion GEMA CM', 'cm'],
    ['Gest paie  CM', 'cm'],
    ['Finance TD3', 'td'],
    ['Communication corporate TD2 et TD3', 'td'],
    ['Travail en autonomie TD3', 'td'],
    ['TND 3 TP5', 'tp'],
    ['AnglaisTP5', 'tp'],
    ['AnglaisTD3', 'td'],
    ['SAE droit des sociétés TD3', 'sae'],
    ['SAE finance TD3', 'sae'],
    ['LV2 Lansad', 'autre'],
    ['Soutenances GEA3 J1', 'autre'],
    ['Eco industrielle PT S6', 'autre'],
    ['rattrapage S6', 'autre'],
  ];
  for (const [titre, type] of cas) assert.equal(typeDeCreneau(titre), type, titre);
});

test('normaliser : sans accents, sans ponctuation, sans casse', () => {
  assert.equal(normaliser('Économie  industrielle'), 'economie industrielle');
  assert.equal(normaliser('Achats-ventes GEMA CM'), 'achats ventes gema cm');
  assert.equal(normaliser('Œuvres & cæteris'), 'oeuvres caeteris');
  assert.equal(normaliser('  --  '), '');
});

test('les mots d’un cours : séparés par virgule, point-virgule ou ligne, sans doublon, plafonnés', () => {
  assert.deepEqual(motifsDe('Droit spécial des sociétés, SAE droit des sociétés ; droit SPECIAL des societes\n'), ['droit special des societes', 'sae droit des societes']);
  assert.deepEqual(motifsDe(' , ;; '), []);
  assert.equal(motifsDe(Array.from({ length: 30 }, (_, i) => `mot${i}`).join(',')).length, 10);
  assert.equal(motifsDe('a'.repeat(200))[0].length, 60);
});

const COURS: CoursPourAgenda[] = [
  { id: 'droit', titre: 'Droit des sociétés', motifs: 'Droit spécial des sociétés, SAE droit des sociétés', ordre: 0 },
  { id: 'achats', titre: 'Achats & Ventes', motifs: 'achats-ventes', ordre: 1 },
  { id: 'eco', titre: 'Économie industrielle', motifs: 'eco industrielle', ordre: 2 },
  { id: 'finance', titre: 'Investissement, financement & trésorerie', motifs: 'finance', ordre: 3 },
  { id: 'croissance', titre: 'Croissance économique & environnement', motifs: 'economie croissance, sae economie', ordre: 4 },
];

test('chaque créneau va au cours dont les mots le retrouvent, en mots entiers', () => {
  const titres = ['Droit spécial des sociétés CM', 'SAE droit des sociétés TD3', 'Achats-ventes GEMA TD3', 'SAE achats-ventes TD3', 'Eco industrielle S6', 'Finance TD3', 'SAE finance TD3', 'Financement des entreprises CM', 'Economie croissance CM', 'SAE economie TD3', 'Contrôle de gestion GEMA CM', 'LV2 Lansad'];
  const r = rattacher(titres.map((t, i) => cr('2026-11-06', h(8), h(10), t, { id: String(i) })), COURS);
  const de = (id: string) => (r.get(id) ?? []).map((c) => c.titre);
  assert.deepEqual(de('droit'), ['Droit spécial des sociétés CM', 'SAE droit des sociétés TD3']);
  assert.deepEqual(de('achats'), ['Achats-ventes GEMA TD3', 'SAE achats-ventes TD3']);
  assert.deepEqual(de('eco'), ['Eco industrielle S6']);
  assert.deepEqual(de('finance'), ['Finance TD3', 'SAE finance TD3'], '« finance » ne prend pas « Financement… »');
  assert.deepEqual(de('croissance'), ['Economie croissance CM', 'SAE economie TD3']);
});

test('rattachement : le mot le plus précis l’emporte, puis l’ordre ; sans mots réglés, le nom du cours sert', () => {
  const c = (titre: string) => cr('2026-11-06', h(8), h(10), titre);
  const large: CoursPourAgenda = { id: 'large', titre: 'Économie', motifs: 'economie', ordre: 0 };
  const precis: CoursPourAgenda = { id: 'precis', titre: 'Économie industrielle', motifs: 'economie industrielle', ordre: 1 };
  const r = rattacher([c('Economie industrielle CM'), c('Economie générale CM')], [large, precis]);
  assert.deepEqual(r.get('precis')!.map((x) => x.titre), ['Economie industrielle CM']);
  assert.deepEqual(r.get('large')!.map((x) => x.titre), ['Economie générale CM']);
  // Même précision : le premier cours (ordre le plus petit) l’emporte.
  const a: CoursPourAgenda = { id: 'a', titre: 'A', motifs: 'finance', ordre: 5 };
  const b: CoursPourAgenda = { id: 'b', titre: 'B', motifs: 'finance', ordre: 2 };
  const egal = rattacher([c('Finance CM')], [a, b]);
  assert.equal(egal.get('b')!.length, 1);
  assert.equal(egal.get('a')!.length, 0);
  // Pas de mots : le nom du cours.
  const nom = rattacher([c('Finance CM'), c('Autre chose')], [{ id: 'f', titre: 'Finance', motifs: '', ordre: 0 }]);
  assert.deepEqual(nom.get('f')!.map((x) => x.titre), ['Finance CM']);
});

test('une journée entière n’appartient à aucun cours', () => {
  const r = rattacher([cr('2026-12-25', 0, 1440, 'Finance : jour férié', { journee: true })], COURS);
  assert.equal(r.get('finance')!.length, 0);
});

test('la charge d’un jour : les créneaux qui se chevauchent comptent une fois, la journée entière pas du tout', () => {
  const j = '2026-11-06';
  const charge = (...c: Creneau[]) => chargeParJour(c).get(j);
  assert.equal(charge(cr(j, h(8, 15), h(10, 15), 'A')), 120);
  assert.equal(charge(cr(j, h(8, 15), h(10, 15), 'A'), cr(j, h(9), h(11), 'B')), 165, 'chevauchement');
  assert.equal(charge(cr(j, h(8, 15), h(10, 15), 'A'), cr(j, h(8, 15), h(10, 15), 'B')), 120, 'deux groupes en même temps');
  assert.equal(charge(cr(j, h(8, 15), h(10, 15), 'A'), cr(j, h(10, 15), h(12, 15), 'B')), 240, 'bout à bout');
  assert.equal(charge(cr(j, h(8, 15), h(10, 15), 'A'), cr(j, h(13, 45), h(15, 45), 'B'), cr(j, h(16), h(18), 'C')), 360, 'séparés');
  assert.equal(charge(cr(j, h(8), h(18), 'Long'), cr(j, h(9), h(10), 'Inclus')), 600, 'l’un dans l’autre');
  assert.equal(charge(cr(j, 0, 1440, 'Férié', { journee: true })), undefined);
  // Une journée de quatre cours de deux heures : 8 h.
  assert.equal(charge(cr(j, h(8, 15), h(10, 15), 'A'), cr(j, h(10, 30), h(12, 30), 'B'), cr(j, h(13, 45), h(15, 45), 'C'), cr(j, h(16), h(18), 'D')), 480);
});

const DROIT = [cr('2026-09-17', h(8, 15), h(10, 15), 'Droit spécial des sociétés CM'), cr('2026-10-09', h(8, 15), h(10, 15), 'Droit spécial des sociétés CM'), cr('2026-11-06', h(13, 45), h(15, 45), 'Droit spécial des sociétés CM'), cr('2026-12-04', h(8, 15), h(10, 15), 'Droit spécial des sociétés CM'), cr('2026-11-27', h(10, 30), h(12, 30), 'SAE droit des sociétés TD3')];

test('le partiel probable : le dernier CM de la matière, s’il est à venir', () => {
  assert.equal(partielProbable(DROIT, '2026-11-06')!.jour, '2026-12-04');
  assert.equal(partielProbable(DROIT, '2026-12-04')!.jour, '2026-12-04', 'le jour même');
  assert.equal(partielProbable(DROIT, '2026-12-05'), null, 'passé');
  // Un TD ou une SAÉ plus tard ne change rien : on cherche un CM.
  assert.equal(partielProbable([...DROIT, cr('2026-12-11', h(8), h(10), 'SAE droit des sociétés TD3')], '2026-11-06')!.jour, '2026-12-04');
});

test('pas de partiel deviné avec un seul CM, sans CM, ou trop loin', () => {
  assert.equal(partielProbable([DROIT[3]], '2026-11-06'), null, 'un seul CM : c’est le premier cours');
  assert.equal(partielProbable(DROIT.filter((c) => c.type !== 'cm'), '2026-11-06'), null);
  assert.equal(partielProbable([], '2026-11-06'), null);
  // Le 4 déc. est à 156 jours du 1er juillet : l’emploi du temps de l’examen n’est pas connu.
  assert.ok(156 > HORIZON_PARTIEL);
  assert.equal(partielProbable(DROIT, '2026-07-01'), null);
  // À la limite, il reste proposé.
  assert.equal(partielProbable(DROIT, '2026-08-06')!.jour, '2026-12-04');
  assert.equal(partielProbable(DROIT, '2026-08-05'), null, 'un jour de trop');
});

test('premier jour de cours, prochain créneau', () => {
  assert.equal(premierJour(DROIT), '2026-09-17');
  assert.equal(premierJour([]), null);
  assert.equal(premierJour([cr('2026-01-01', 0, 1440, 'Férié', { journee: true }), cr('2026-02-01', h(8), h(9), 'X')]), '2026-02-01');
  assert.equal(prochainCreneau(DROIT, '2026-11-06')!.jour, '2026-11-06', 'aujourd’hui compte');
  assert.equal(prochainCreneau(DROIT, '2026-11-07')!.jour, '2026-11-27');
  assert.equal(prochainCreneau(DROIT, '2027-01-01'), null);
});

test('créneaux d’un jour dans l’ordre des heures', () => {
  const m = creneauxParJour([cr('2026-11-06', h(16), h(18), 'Soir'), cr('2026-11-07', h(8), h(9), 'Autre'), cr('2026-11-06', h(8), h(10), 'Matin')]);
  assert.deepEqual(m.get('2026-11-06')!.map((c) => c.titre), ['Matin', 'Soir']);
  assert.deepEqual([...m.keys()], ['2026-11-06', '2026-11-07']);
});

test('affichage : heures, salle sans le site', () => {
  assert.equal(heure(h(8, 5)), '08:05');
  assert.equal(plageHeures({ debut: h(13, 45), fin: h(15, 45) }), '13:45–15:45');
  assert.equal(salleCourte('Amphi 3 (SCH  -SITE SCHILTIGHEIM, IUT LOUIS PASTEUR, AMPHI)'), 'Amphi 3');
  assert.equal(salleCourte('Amphi Michel Genevaux ( EX. Amphi 1) (SCH  -SITE SCHILTIGHEIM, IUT LOUIS PASTEUR, AMPHI)'), 'Amphi Michel Genevaux (Amphi 1)');
  assert.equal(salleCourte("Salle d'examen B1.25 (SCH  -SITE SCHILTIGHEIM, IUT LOUIS PASTEUR, SALLE)"), "Salle d'examen B1.25");
  assert.equal(salleCourte('B1.16 TD Rx Vp (SCH  -SITE SCHILTIGHEIM, IUT LOUIS PASTEUR, TD);B1.12 TD Vp (SCH  -SITE X, TD)'), 'B1.16 TD Rx Vp', 'la première salle');
  assert.equal(salleCourte(''), '');
});

test('le cache de l’appareil : seul ce qui est bien formé est relu', () => {
  const bon = cr('2026-11-06', h(8), h(10), 'Bon');
  assert.deepEqual(creneauxValides([bon, null, 3, { ...bon, jour: '2026-02-30' }, { ...bon, type: 'x' }, { ...bon, debut: 600, fin: 600 }, { ...bon, fin: 1500 }, { ...bon, debut: 1.5 }, { ...bon, debut: -5 }, { ...bon, titre: 4 }]), [bon]);
  assert.deepEqual(creneauxValides('pas une liste'), []);
  assert.deepEqual(creneauxValides(undefined), []);
});

test('tout ce qu’on tire du flux, d’un coup', () => {
  const creneaux = [
    cr('2026-11-06', h(8, 15), h(10, 15), 'Achats-ventes GEMA TD3', { id: 'a1' }),
    cr('2026-11-06', h(13, 45), h(15, 45), 'Droit spécial des sociétés CM', { id: 'd1' }),
    cr('2026-09-17', h(8, 15), h(10, 15), 'Droit spécial des sociétés CM', { id: 'd0' }),
    cr('2026-11-06', h(9), h(11), 'Communication corporate TD2 et TD3', { id: 'x1' }),
    cr('2026-12-25', 0, 1440, 'Noël', { id: 'n', journee: true }),
  ];
  const e = emploiDuTemps(creneaux, COURS);
  assert.deepEqual([...e.parJour.keys()], ['2026-09-17', '2026-11-06', '2026-12-25']);
  assert.deepEqual(e.parJour.get('2026-11-06')!.map((c) => c.id), ['a1', 'x1', 'd1'], 'dans l’ordre des heures');
  assert.equal(e.charge.get('2026-11-06'), 120 + 120 + 120 - 75, 'le chevauchement de 9 h à 10 h 15 ne compte qu’une fois');
  assert.equal(e.charge.has('2026-12-25'), false);
  assert.deepEqual(e.parCours.get('droit')!.map((c) => c.id), ['d0', 'd1']);
  assert.deepEqual(e.parCours.get('achats')!.map((c) => c.id), ['a1']);
  assert.deepEqual(e.parCours.get('eco'), []);
  assert.deepEqual([...e.coursDe].sort(), [['a1', 'achats'], ['d0', 'droit'], ['d1', 'droit']]);
  assert.equal(e.coursDe.has('x1'), false, 'une matière que Hameau ne suit pas n’appartient à aucun cours');
  assert.deepEqual([...e.debuts].sort(), [['achats', '2026-11-06'], ['droit', '2026-09-17']], 'seuls les cours qui ont des créneaux ont un début');
});
