// Le widget du bureau Windows (windows/hameau-widget.ps1) : ce qu'il affiche pour chaque état du chrono, testé dans
// PowerShell quand il est là (il l'est sur les machines de l'intégration continue), et ce qu'on peut vérifier sans lui.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { RACINE_WIDGET, construireZip, fichiersDe } from '../scripts/zipper-extension.mjs';

const CHEMIN = new URL('../windows/hameau-widget.ps1', import.meta.url).pathname;
const OCTETS = readFileSync(CHEMIN);
const SCRIPT = OCTETS.toString('utf8');
const LANCEUR = readFileSync(new URL('../windows/Lancer le widget Hameau.cmd', import.meta.url), 'utf8');

test('le widget parle au même projet que l’application, et ne contient aucun secret', () => {
  const config = readFileSync(new URL('../src/data/config.ts', import.meta.url), 'utf8');
  const url = /\$URL_RPC = '(https:\/\/[^']+)\/rest\/v1\/rpc\/hameau_raccourci'/.exec(SCRIPT)?.[1];
  const cle = /\$CLE_PUBLIQUE = '([^']+)'/.exec(SCRIPT)?.[1];
  assert.ok(url && config.includes(`url: '${url}'`), 'l’adresse du projet');
  assert.ok(cle && config.includes(`cle: '${cle}'`), 'la clé publiable');
  assert.ok(!/sb_secret_|service_role/.test(SCRIPT));
  assert.ok(!/[0-9a-f]{64}/.test(SCRIPT), 'le jeton est gardé dans %APPDATA%, jamais dans le script');
});

test('PowerShell 5 lit les accents : le script commence par la marque UTF-8', () => {
  // Sans elle, Windows PowerShell 5 lit le fichier en Windows-1252 : « Démarrer » deviendrait « DÃ©marrer ».
  assert.deepEqual([...OCTETS.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test('le lanceur ouvre le script sans console, en STA (WPF l’exige), sans bloquer sur la politique d’exécution', () => {
  assert.match(LANCEUR, /powershell\.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -STA -File "%~dp0hameau-widget\.ps1"/);
  assert.ok([...LANCEUR].every((ch) => ch.charCodeAt(0) < 128), 'un .cmd reste en ASCII');
  assert.ok(LANCEUR.split('\n').slice(0, -1).every((l) => l.endsWith('\r')), 'fins de ligne Windows');
});

test('le zip du widget contient le script et son lanceur, sous un dossier', () => {
  const fichiers = fichiersDe(new URL('../windows', import.meta.url).pathname);
  const noms = fichiers.map((f) => f.nom).sort();
  assert.deepEqual(noms, ['Lancer le widget Hameau.cmd', 'hameau-widget.ps1']);
  const zip = construireZip(fichiers, RACINE_WIDGET);
  assert.ok(zip.includes(Buffer.from(`${RACINE_WIDGET}/hameau-widget.ps1`)));
});

const pwsh = process.env.PWSH || 'pwsh';
const disponible = spawnSync(pwsh, ['-NoProfile', '-Command', '1'], { encoding: 'utf8' }).status === 0;

test('dans PowerShell : la syntaxe, et ce que montre la fenêtre pour chaque état du chrono', { skip: disponible ? false : 'PowerShell absent sur cette machine' }, () => {
  const essai = String.raw`
$ErrorActionPreference = 'Stop'
$erreurs = $null
[void][System.Management.Automation.Language.Parser]::ParseFile($env:WIDGET, [ref]$null, [ref]$erreurs)
if ($erreurs) { throw "syntaxe : $($erreurs[0].Message)" }
. $env:WIDGET -Essai
function Verifier($nom, $obtenu, $attendu) { if ($obtenu -ne $attendu) { throw "$nom : « $obtenu » au lieu de « $attendu »" } }
Verifier 'zéro' (Format-Duree 0) '0:00'
Verifier 'secondes' (Format-Duree 59) '0:59'
Verifier 'heures' (Format-Duree 3725) '1:02:05'
$t = [datetimeoffset]::Parse('2026-11-26T18:00:00Z')
$a = Get-Affichage ([pscustomobject]@{ etat = 'en_cours'; depuis = '2026-11-26T17:50:00+00:00'; secondes = 600; objectif = 50 }) $t
Verifier 'en cours' $a.Temps '10:00'
Verifier 'objectif' $a.Statut 'En cours · objectif 50 min'
Verifier 'part' ([math]::Round($a.Part, 2)) 0.2
Verifier 'action en cours' $a.Action 'pause'
# PowerShell 7 change la date du JSON en [datetime] : même résultat
$b = Get-Affichage ([pscustomobject]@{ etat = 'en_cours'; depuis = [datetime]::Parse('2026-11-26T17:50:00Z').ToUniversalTime(); objectif = $null }) $t
Verifier 'date déjà convertie' $b.Temps '10:00'
Verifier 'sans objectif' $b.Part -1
$j = '{"etat":"en_cours","depuis":"2026-11-26T16:52:30.5+00:00","secondes":4049,"objectif":90}' | ConvertFrom-Json
Verifier 'réponse JSON réelle' (Get-Affichage $j $t).Temps '1:07:29'
$p = Get-Affichage ([pscustomobject]@{ etat = 'en_pause'; secondes = 3990; minutes = 66 }) $t
Verifier 'pause figée' $p.Temps '1:06:30'
Verifier 'pause' $p.Statut 'En pause'
Verifier 'action pause' $p.Action 'reprendre'
Verifier 'aucune' (Get-Affichage ([pscustomobject]@{ etat = 'aucune' }) $t).Statut 'Pas de chrono'
Verifier 'démarrer' (Get-Affichage ([pscustomobject]@{ etat = 'aucune' }) $t).Action 'demarrer'
Verifier 'attente' (Get-Affichage $null $t).Statut 'Connexion…'
Verifier 'jeton' (Get-Affichage (ConvertFrom-Reponse 401 '{"message":"jeton inconnu"}') $t).Statut 'Jeton à mettre (clic droit)'
Verifier 'serveur' (ConvertFrom-Reponse 500 'oups').erreur 'serveur'
Verifier 'réponse lisible' (ConvertFrom-Reponse 200 '{"etat":"aucune"}').etat 'aucune'
Verifier 'hors ligne' (Get-Affichage ([pscustomobject]@{ erreur = 'reseau' }) $t).Statut 'Hors ligne'
'tout est conforme'
`;
  const r = spawnSync(pwsh, ['-NoProfile', '-NonInteractive', '-Command', essai], { encoding: 'utf8', env: { ...process.env, WIDGET: CHEMIN } });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  assert.match(r.stdout, /tout est conforme/);
});
