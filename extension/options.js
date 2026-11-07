import { SITES_PAR_DEFAUT, lireSites, originesAAutoriser } from './logique.js';

const $ = (id) => document.getElementById(id);

async function charger() {
  const r = await chrome.storage.sync.get({ sites: SITES_PAR_DEFAUT, debloquerEnPause: false });
  $('sites').value = (Array.isArray(r.sites) ? r.sites : SITES_PAR_DEFAUT).join('\n');
  $('pause').checked = r.debloquerEnPause === true;
}

$('formulaire').addEventListener('submit', async (e) => {
  e.preventDefault();
  const { sites, ecartes } = lireSites($('sites').value);
  // Chrome ne redirige que les sites auxquels l'extension a accès : on le demande ici, tout de suite (c'est un clic),
  // pour les sites ajoutés à la main. Les trois de départ sont déjà autorisés par le manifeste. L'enregistrement ne
  // l'attend pas : la liste est gardée quoi que réponde la personne.
  const origines = originesAAutoriser(sites);
  const demande = origines.length > 0 ? chrome.permissions.request({ origins: origines }).catch(() => false) : Promise.resolve(true);
  await chrome.storage.sync.set({ sites, debloquerEnPause: $('pause').checked });
  $('sites').value = sites.join('\n');
  const n = `${sites.length} site${sites.length > 1 ? 's' : ''}`;
  $('message').textContent = ecartes.length === 0 ? `Enregistré : ${n}.` : `Enregistré : ${n}. Écarté : ${ecartes.map((x) => `« ${x.saisie} » (${x.raison})`).join(', ')}.`;
  if (!(await demande)) $('message').textContent += ' Chrome n’a pas autorisé l’accès aux sites ajoutés : ils ne seront pas bloqués (enregistre de nouveau et accepte).';
});
$('defaut').addEventListener('click', () => {
  $('sites').value = SITES_PAR_DEFAUT.join('\n');
  $('message').textContent = 'Liste remise : à enregistrer.';
});
void charger();
