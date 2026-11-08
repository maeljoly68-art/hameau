import { CONFIRMATION_DEFAUT, DELAIS_S, PASSES_MIN, SITES_DE_TRAVAIL_DEFAUT, SITES_PAR_DEFAUT, confirmationValide, lireSites, originesAAutoriser } from './logique.js';

const $ = (id) => document.getElementById(id);

const libelleDelai = (s) => (s === 0 ? 'tout de suite' : `${s} secondes`);
const libellePasse = (m) => (m < 60 ? `${m} minutes` : m === 60 ? '1 heure' : `${m / 60} heures`);
for (const s of DELAIS_S) $('delai').add(new Option(libelleDelai(s), String(s)));
for (const m of PASSES_MIN) $('passe').add(new Option(libellePasse(m), String(m)));

async function charger() {
  const r = await chrome.storage.sync.get({ sites: SITES_PAR_DEFAUT, debloquerEnPause: false, confirmation: CONFIRMATION_DEFAUT, autorises: SITES_DE_TRAVAIL_DEFAUT });
  const c = confirmationValide(r.confirmation);
  $('sites').value = (Array.isArray(r.sites) ? r.sites : SITES_PAR_DEFAUT).join('\n');
  $('autorises').value = (Array.isArray(r.autorises) ? r.autorises : SITES_DE_TRAVAIL_DEFAUT).join('\n');
  $('pause').checked = r.debloquerEnPause === true;
  $('confirmation').checked = c.active;
  $('delai').value = String(c.delaiS);
  $('passe').value = String(c.passeMin);
}

$('formulaire').addEventListener('submit', async (e) => {
  e.preventDefault();
  const bloques = lireSites($('sites').value);
  const travail = lireSites($('autorises').value);
  const confirmation = confirmationValide({ active: $('confirmation').checked, delaiS: Number($('delai').value), passeMin: Number($('passe').value) });
  // Chrome ne redirige que les sites auxquels l'extension a accès : on le demande ici, tout de suite (c'est un clic),
  // pour les sites ajoutés à la main. Les trois de départ sont déjà autorisés par le manifeste. L'enregistrement ne
  // l'attend pas : la liste est gardée quoi que réponde la personne.
  const origines = originesAAutoriser(bloques.sites);
  const demande = origines.length > 0 ? chrome.permissions.request({ origins: origines }).catch(() => false) : Promise.resolve(true);
  await chrome.storage.sync.set({ sites: bloques.sites, autorises: travail.sites, confirmation, debloquerEnPause: $('pause').checked });
  $('sites').value = bloques.sites.join('\n');
  $('autorises').value = travail.sites.join('\n');
  const ecartes = [...bloques.ecartes, ...travail.ecartes];
  const n = `${bloques.sites.length} page${bloques.sites.length > 1 ? 's' : ''} bloquée${bloques.sites.length > 1 ? 's' : ''}`;
  $('message').textContent = ecartes.length === 0 ? `Enregistré : ${n}.` : `Enregistré : ${n}. Écarté : ${ecartes.map((x) => `« ${x.saisie} » (${x.raison})`).join(', ')}.`;
  if (!(await demande)) $('message').textContent += ' Chrome n’a pas autorisé l’accès aux sites ajoutés : ils ne seront pas bloqués (enregistre de nouveau et accepte).';
});
$('defaut').addEventListener('click', () => {
  $('sites').value = SITES_PAR_DEFAUT.join('\n');
  $('message').textContent = 'Liste remise : à enregistrer.';
});
void charger();
