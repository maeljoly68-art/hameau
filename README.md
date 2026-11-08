# Hameau

Suivi du temps de travail, en petit jeu : tu lances une session, tu l’arrêtes,
tu notes ce que tu as fait — et chaque minute de concentration te donne des
points qui font grandir un village isométrique.

Une seule app pour le **téléphone, l’iPad et l’ordinateur** : c’est une
application web installable (PWA). Pas d’App Store, pas de compte
développeur Apple, rien à télécharger sur Windows.

## Le jeu

| | |
|---|---|
| **Points** | 1 point par minute, +5 par bloc ininterrompu de 25 min. Rien sous 5 min. Plafond à 4 h par session (un chrono oublié la nuit ne rapporte pas 600 points). |
| **Objectif de session** | Libre, 25, 50 ou 90 min : le chrono monte, l'anneau se remplit vers l'objectif avec le compte à rebours, et un carillon (plus une notification si activée) annonce la fin. En session libre, l'anneau suit le prochain bonus de 25 min. |
| **Pause** | Une session se met en pause et reprend : le chrono se fige, et le temps de pause est déduit de la durée, donc des points, des stats et des succès. Terminer pendant une pause est permis : la pause s'arrête avec la session. |
| **Objectif du jour** | Réglable (30 min à 6 h). Il sert d'échelle à l'anneau « Aujourd'hui » et au calendrier de régularité. |
| **Niveaux** | Calculés sur les points *gagnés* (dépenser ne fait jamais reculer). Chaque niveau demande ~1 h de plus que le précédent. |
| **Village** | Le terrain s'agrandit de 5×5 à 11×11 avec les niveaux. 16 bâtiments, du parterre de fleurs (10 pts) au château (niveau 14). **Déplacer** un bâtiment ne coûte rien (son niveau et les points investis suivent) ; démolir rend les points. Tu peux nommer ton hameau. Une **petite flèche verte** flotte au-dessus d'un bâtiment que tu peux améliorer maintenant (assez de points, village assez grand, pas déjà au niveau 3) ; la toucher ouvre sa fiche (`ameliorables` dans `src/core/village.ts`, hauteur du toit de chaque bâtiment dans `src/ui/village/hauteurs.ts`, un test oblige à renseigner celle d'un nouveau bâtiment). |
| **Saisons** | Le village suit le calendrier : feuillage roux et feuilles qui tombent en automne, neige sur les toits et flocons en hiver, arbres en fleurs et pétales au printemps. Feux d'artifice au passage de niveau. |
| **Vivant** | Chaque habitant se promène à son gré (un tour au hasard, différent de celui des autres, qui repasse parfois par le feu ou chez un voisin avant de rentrer), les nuages passent, les lucioles sortent les nuits douces. Pendant une session, le feu s'embrase, le moulin tourne, la forge fume, les abeilles bourdonnent. Le ciel suit l'heure (aube, jour, soir, nuit). |
| **Succès** | 14 succès déduits de l'historique (séries, heures cumulées, marathon, lève-tôt…). Rien n'est stocké : supprimer une session retire honnêtement ce qu'elle avait donné. |
| **Stats** | Calendrier de régularité (un an sur ordinateur), 14 derniers jours avec la ligne d'objectif, comparaison à la semaine précédente au même jour, et « quand es-tu le plus concentré » : la durée MOYENNE des sessions par moment de la journée, à partir de 3 sessions — pas le total, qui désignerait seulement le moment le plus fréquent. |
| **Série** | Jours d'affilée avec au moins 25 min. La série d'hier tient tant que la journée n'est pas finie ; le record est gardé. |

## Sillage

L'onglet **Tâches** relie Hameau à [Sillage](https://maeljoly68-art-jdtpromaelfx.maeljoly68.workers.dev), avec le compte Sillage de la personne (une connexion par appareil, le mot de passe n'est pas gardé). Hameau n'a aucun droit de plus que dans Sillage : ce sont les règles d'accès de Sillage qui s'appliquent.

- **Habitudes du jour** (les tâches récurrentes de Sillage) : celles attendues aujourd'hui, à cocher — mêmes règles que Sillage (jours prévus, ou « n fois par semaine »).
- **Tâches** : dans l'ordre de Sillage (retard, échéance, importance). Ajouter une tâche ici l'ajoute dans Sillage ; la cocher la marque faite.
- **Lancer une session sur une tâche** : son estimation devient l'objectif, et la fin de session propose de la marquer faite.
- **Temps de travail** : chaque session close part dans `focus_externe` (source `hameau`), le circuit que le portail de Sillage lit déjà. L'envoi se fait par différences : une session corrigée ou supprimée ici l'est aussi là-bas.



- **Premiers pas** : une liste qui se coche toute seule d'après tes données (première session, premier bâtiment, nom du hameau, installation, raccourci).
- **Fin de session** : les dernières descriptions de la même catégorie sont proposées en un toucher.
- **Annuler** : supprimer une session ou démolir un bâtiment se rattrape pendant quelques secondes, sans confirmation à valider par réflexe.
- **Historique** : recherche sans accents ni majuscules, filtre par catégorie, une couleur stable par catégorie.
- **Mode focus** : ambiance « feu de camp » (bruit brun et crépitements, synthétisés sur l'appareil).
- **Thème** : automatique, sombre ou clair, par appareil.
- **Export** : CSV pour Excel (séparateur « ; », accents conservés, formules neutralisées) ou sauvegarde JSON complète.
- **Mise à jour** : une app laissée ouverte des heures prévient quand une nouvelle version est publiée.

## Cours et calendrier

L'onglet **Cours** garde, dans le compte, ce qui était jusque-là enregistré « sur cet appareil » dans les pages de cours : la progression de chaque chapitre, les notes, les dates de partiel. Il en tire le calendrier du jour et des semaines à venir.

- **Cours → pages** : une page est une unité qu'on apprend — un tableau de l'artefact (une fiche, un TD, les flashcards…), enregistré comme un chapitre. Son numéro est son rang dans le cours ; sa durée de première lecture vient de sa taille (environ 30 mots à la minute, plus longue pour un TD). Elle porte son niveau dans le cycle, son dernier et son prochain passage. Un cours porte la date de son partiel et l'adresse de l'artefact d'origine ; **en pause**, il reste dans la liste mais sort du calendrier (ni séance, ni alerte, ni partiel affiché).
- **Cycle d'apprentissage** (`src/core/revision.ts`) : lu une fois, un chapitre est revu dès le lendemain, puis après 3, 7, 14, 30 et 60 jours. La note donnée à chaque révision règle l'écart : « À revoir » ramène à demain et redescend de deux crans, « Difficile » divise l'écart par deux, « Facile » saute un cran.
- **Ma semaine** (`src/core/semaine.ts`, `src/ui/pages/Semaine.tsx`) : une carte de l'onglet Cours qui répond à « qu'est-ce que j'ai à faire cette semaine ? », page par page. En tête, le bilan par cours (« Lire + écrire · pages 7 à 17 · Apprendre par cœur · pages 4 à 11 · Réviser · pages 1 à 4 », avec les minutes), puis les sept jours : les jours passés montrent ce qui a été fait (lu depuis le journal des passages), aujourd'hui le fait et le reste, les jours à venir leurs séances (par bloc de pages, comme « À faire aujourd'hui »). Flèches pour changer de semaine (les semaines passées ne montrent que le fait). **S'avancer** : « Le faire maintenant » sur une séance d'un jour à venir la valide aujourd'hui, avec le même geste que d'habitude (lire puis écrire de mémoire, se noter) ; une lecture d'avance compte comme lue aujourd'hui et la suite du calendrier avance. Une séance d'apprentissage ou de révision faite avant l'échéance compte comme un rappel en plus (réussie, elle ne fait pas monter le cran, comme le rappel du jour) ; une séance qui dépend de pages pas encore lues dit « Il faut d'abord lire ces pages » et n'a pas de bouton. **Aller plus loin que prévu** : « + J'ai avancé plus loin » déclare des pages jamais lues (du cours, de la page 8 à la 10, par exemple) lues aujourd'hui ; le calendrier se recalcule, elles ne sont plus à lire, elles reviennent dès le lendemain pour être apprises, et les semaines suivantes s'allègent (l'avance prise est annoncée en minutes de lecture). Aucune nouvelle table : tout passe par l'état des pages et le journal, donc tout se recalcule.
- **Calendrier** (`src/core/planning.ts`) : le partiel le plus proche passe en premier ; les chapitres neufs se lisent dans l'ordre, jamais dans les 3 derniers jours ; chaque chapitre a un dernier passage dans les 4 jours qui précèdent le partiel ; la journée n'est jamais chargée au-delà du temps disponible. Si ce temps ne suffit pas, l'écart est chiffré. Le calendrier n'est **pas** enregistré : il se recalcule depuis l'état réel des chapitres, pour ne jamais diverger de ce qu'on a vraiment fait.
- **En pages** (`src/core/pages.ts`) : le calendrier dit « Pages 1 à 7 · ≈ 55 min » plutôt qu'un chapitre pour une heure. Les séances d'un jour sont regroupées par cours et par sorte de travail (lire, revoir, relire, dernier passage) ; regrouper ne change pas le calendrier, seulement la façon de le lire et de le valider.
- **Valider la séance** : une lecture se valide d'un coup, avec « Plus vite / Comme prévu / Plus lent » ; une révision, avec la note ; une relecture, avec « Relu ». **Ce qu'on ne valide pas n'est pas perdu** : le calendrier se recalcule depuis l'état réel, donc une révision non faite revient « en retard de N j » et une lecture non faite se replace. Et ce qui est déjà fait aujourd'hui compte sur le temps d'aujourd'hui : valider ne fait pas apparaître une autre séance à la place.
- **Lire + écrire, apprendre par cœur, réviser** : on apprend dès la première fois. Jour 0, « Lire + écrire » : on lit, puis on ferme la fiche et on écrit de mémoire ce qu'on a retenu (le temps annoncé compte ce rappel : +30 % de la lecture). Le lendemain, « Apprendre par cœur » : même exercice, obligatoire, ici ou sur papier, AVANT de comparer et de se noter ; ces pages passent toutes dans le rappel du jour. Ensuite « Réviser », de plus en plus espacé. « Relire » revoit une page sans la noter.
- **Confiance avant la note** : avant de comparer à la fiche, on dit si l'on pense savoir. Le bilan montre l'écart avec la note : on se surestime (l'illusion de savoir) ou non.
- **Carnet d'erreurs** : une erreur notée en une ligne revient 6 jours après (puis tous les 3 jours tant qu'on dit « encore flou »), jusqu'à « je sais ». Deux par jour au plus.
- **Cartes question/réponse** par page : le rappel pose de vraies questions. Ajout une par une ou en liste (« question :: réponse », une par ligne). On répond à chaque question dans un champ placé juste à côté (sous la question sur un écran étroit) : répondre à une seule suffit à compter comme « écrit » pour une page à apprendre, les réponses tapées vont au journal (« question → ta réponse »), et à l'étape de comparaison ta réponse s'affiche en face de la bonne (`texteDuRappel`, `src/core/cartes.ts`).
- **Fiche de la veille** : un écran par cours qui rassemble erreurs, pages mot pour mot (avec leurs cartes), pages fragiles et notes ; proposée 1 à 2 jours avant le partiel, copiable en texte.
- **Points d'apprentissage** : page apprise 4, rappel/révision 3 (+2 si réussi), relecture 1, examen blanc 10 (+2), plafond 60 par jour, +1 par jour de série (7 au plus) ; ils s'ajoutent aux points du temps de travail.
- **Meilleurs moments** : les notes par moment de la journée (matin, midi, après-midi, soir, nuit) disent quand tu apprends le mieux ; Hameau le rappelle pour les pages fragiles, il ne fixe pas d'heure.
- **Rappel quotidien sur le téléphone** (Réglages) : une notification push par jour, à l'heure choisie. Le titre dit COMBIEN de choses t'attendent (« 3 choses t'attendent aujourd'hui »), puis une ligne par chose, la plus pressante en premier : partiel proche (fiche de la veille), pages à apprendre par cœur, pages à réviser, erreurs de retour, pratique du jour pas encore faite (« Rattrapage TOEIC (5 min) »), rappels du mois. Rien n'est envoyé un jour où il n'y a rien à dire. **Relance du soir** (réglable, active par défaut) : trois heures plus tard (pas après 20 h, elle sortirait de la journée), « Il te reste 2 choses » avec ce qui attend encore, rien s'il ne reste rien ; elle remplace le rappel du matin au lieu de s'empiler. Un clic sur la notification ouvre l'onglet Cours (`?onglet=cours`, ou un message du service worker si l'app est déjà ouverte ; `src/core/onglets.ts`). Sur iPhone : ajouter Hameau à l'écran d'accueil, puis l'ouvrir depuis l'icône. Côté serveur : migrations `20261112` (abonnements, réglage) et `20261115` (`notifications_a_envoyer`, `notifications_marquer`, relance), fonction Edge `supabase/functions/rappel-push` (envoi Web Push signé VAPID), appelée tous les quarts d'heure par pg_cron ; `supabase/installation-notifications.sql` (Supabase seulement : extensions, coffre, planificateur) se lance une fois. Les clés VAPID sont créées au premier appel et vivent dans le coffre (Vault) : aucune clé secrète dans le dépôt ni dans le navigateur.
- **Mot pour mot** : une page (ou tout un cours) peut être marquée « à savoir mot pour mot » (formules, articles, dialogues, chiffres clés). Son cycle est resserré (1, 2, 4, 7, 14, 30 jours au lieu de 1, 3, 7, 14, 30, 60) et elle reste en apprentissage un retour de plus.
- **Journal des passages** (`passages`, `src/core/passages.ts`) : chaque page apprise, révisée, relue, rappelée ou passée en examen blanc laisse une ligne (note, temps, score, vitesse, ce qu'on a écrit de tête). Le calendrier ne s'en sert pas — il se recalcule depuis l'état des pages — mais le journal dit ce que l'état ne dit pas : les **pages fragiles** (au moins deux notes basses parmi les quatre dernières ; deux bons passages de suite la libèrent) passent devant (×1,5), et le **bilan de la semaine** (jours actifs, pages apprises, révisions, notes, vitesse, pages en retard, et « à ce rythme, tout serait appris le … » avant chaque partiel). Un passage qui ne s'écrit pas n'empêche jamais de valider.
- **Rappel du jour** (`src/core/rappel.ts`, réglage `rappel`, 3 pages par défaut) : quelques révisions du jour, de cours mélangés (c'est l'entrelacement), se font de tête — on écrit l'essentiel, on ouvre la fiche pour comparer, puis on se note — plutôt que d'un geste : relire donne l'impression de savoir, se rappeler dit si on sait. Un jour chargé en cours (4 h et plus), s'il reste de la place, des **pages fragiles** s'ajoutent en micro-révision (3 minutes la page) ; réussie, une révision faite avant l'échéance ne fait pas monter le cran (`apresRappelAnticipe`) : réviser trop tôt ne vaut pas un cran.
- **Score → note** : « 14 sur 20 » donne la note (90 % facile, 70 % bien, 50 % difficile, en dessous à revoir), pour un quiz, des flashcards ou un sujet corrigé.
- **Examen blanc** : entre 14 et 4 jours avant un partiel, un sujet, un TD ou des exercices du cours sont placés le jour qui laisse le plus de temps (le plus tard à temps égal), à la durée de l'épreuve quand l'emploi du temps la donne (90 min sinon), plafonnée au temps du jour. Au chrono ; on donne le temps réel et le score. Un par cours, un seul tous les 21 jours.
- **Rappels mensuels** (`rappels`, `src/core/rappels.ts`) : un rappel est dû à partir de son jour du mois et revient chaque jour, en bandeau sur tous les onglets, tant qu'on ne l'a pas marqué fait ; il revient au jour dit du mois suivant (par exemple « remplir mon rapport du mois sur Studea », le 1er).
- **Ta vitesse** (`src/core/vitesse.ts`, réglage `vitesse`) : toutes les durées sont multipliées par elle. Elle se règle à la main et se précise à chaque séance validée (un ressenti pèse 30 %) ou chronométrée (un chrono mesure : 50 %, borné ; un chrono hors de 0,2 à 5 fois la durée prévue est une erreur — minuteur oublié — et ne compte pas).
- **Relecture les jours de cours** (réglage `relecture`) : un bloc de minutes **prises sur** le temps du jour (1 h 30 dont 30 min), avant toute lecture neuve, pour relire sans note les pages déjà vues des cours dont le partiel est le plus proche. Jamais une page que le cycle demande ce jour-là (c'est la révision, notée), jamais deux jours de suite la même page ; relire ne fait pas avancer le cycle.
- **Pratique quotidienne** (`src/core/pratique.ts`, colonne `cours.pratique_min`, table `pratiques`, migration `20261113000000_pratique_quotidienne.sql`) : l'artefact d'erreurs d'un cours (le TOEIC, bientôt le TAGE MAGE) à ouvrir CHAQUE jour, un minimum de minutes (5 par défaut), jusqu'au partiel. Ce n'est pas une séance du calendrier mais une habitude : une carte distincte en tête d'« Aujourd'hui » (anneau de progression, sept derniers jours, série, bouton pour ouvrir l'artefact), un badge sur la carte du cours, et le réglage dans la page du cours (« Pratique quotidienne », minutes par jour). Les minutes du jour sont celles du chrono lancé depuis la carte (catégorie « <cours> · erreurs », pauses déduites) plus celles déclarées à la main (« J'ai fait mes 5 min »), jamais recopiées l'une dans l'autre ; une session qui tourne encore ne compte pas, et la minute est arrondie. La série compte les jours de suite où le minimum est atteint : la journée en cours ne la casse pas tant qu'elle n'est pas finie, un jour libre (réglage du temps disponible) ne la casse pas non plus. Le planificateur retire ces minutes de chaque journée (sans rendre de temps à un jour libre), jusqu'au partiel ; le rappel quotidien par notification ajoute « Pratique du jour : TOEIC 5 min » tant qu'elle n'est pas faite.
- **Étude libre** (`src/core/revisionLibre.ts`, colonne `cours.revision_libre_min`, minutes déclarées dans `pratiques.sorte = 'revision'`, migration `20261114000000_revision_libre.sql`) : pour un cours sans artefact (Contrôle de gestion, Droit du numérique) ou en plus de ses pages (Finance), des séances d'étude sans page — relire son cours, refaire des exercices, écrire de mémoire. Les jours se comptent À REBOURS depuis le partiel (la veille, J−3, J−6, J−10, J−15, J−21, J−28, J−36 : de plus en plus rapprochées, et fixes d'un jour à l'autre puisqu'accrochées à la date du partiel). Une séance qui tombe un jour libre ou trop court recule d'un ou deux jours ; le partiel le plus proche choisit ses jours en premier ; le temps est mis de côté AVANT les pages (comme la pratique quotidienne). Dans « À faire aujourd'hui » : « Fait » déclare les minutes, « Lancer le chrono » démarre une session « <cours> · révision », comptée toute seule. Réglage par cours (« Étude libre », minutes par séance de 10 à 180) ; sans date de partiel, pas de séances.
- **Groupes repliables** (`src/ui/Repliable.tsx`) : les questions d'une page (cartes, fiche de la veille, rappel de plusieurs pages) se masquent ou se montrent d'un clic sur un petit triangle, avec leur compte (« 12 questions »).
- **Notes** : par page, avec un passage cité facultatif.
- **Chrono** : « Lancer le chrono » démarre une session dans la catégorie du cours, avec la durée prévue pour objectif ; à la fin, la fenêtre propose de valider la séance, et le temps réel précise ta vitesse.
- Réservé au compte (les tables `cours`, `chapitres`, `notes_chapitres`, `reglages_cours`, protégées par RLS ; la pause est la colonne `cours.en_pause`, migration `20261107000000_cours_en_pause.sql` ; le journal est la table `passages`, migration `20261108000000_passages.sql`, et les rappels mensuels la table `rappels`, migration `20261109000000_rappels.sql`) : le calendrier doit être le même sur tous les appareils.

## Emploi du temps de l'université

« Brancher mon emploi du temps », dans l'onglet **Cours**, lit le fichier d'export (.ics) de « Mon emploi du temps » de l'université. Le calendrier d'étude s'en sert ainsi :

- **Cours du jour** : les créneaux d'aujourd'hui et de chaque jour du calendrier, avec leur salle. Une barre sous le numéro du jour dit à quel point il est chargé.
- **Jours chargés** (`capaciteDuJour`, `src/core/planning.ts`) : jusqu'à 4 h de cours dans la journée, le temps de révision ne bouge pas ; il baisse ensuite progressivement, jusqu'à −50 % (réglable de 0 à 90 %) pour 8 h. Une journée légère ne passe donc pas pour un oubli : l'écran dit « 8 h de cours : temps de révision ramené de 1 h à 30 min ».
- **Partiel probable** (`partielProbable`, `src/core/agenda.ts`) : dans cet emploi du temps, l'examen d'une matière s'affiche comme un « CM » de plus, le dernier de la matière (Finance : celui du 17 décembre est dans la salle d'examen). Hameau le **propose**, jamais sans confirmation, sur la page du cours ; il en faut deux CM au moins (un seul est le premier cours), et pas plus de quatre mois devant.
- **Cours pas commencé** : sans date de partiel, un cours n'entre au calendrier que le mois qui précède son premier cours (`JOURS_AVANT_DEBUT`) ; lire un de ses chapitres l'y fait entrer plus tôt.
- **Rattachement** : chaque cours a des « mots » (par exemple « droit spécial des sociétés »). Un créneau lui appartient quand son intitulé les contient **en mots entiers** (« finance » ne prend pas « financement ») ; le plus précis l'emporte, puis l'ordre des cours. Sans mots réglés, le nom du cours sert.

Le lien est dans la ligne `reglages_cours` du compte (colonne `agenda_url`, RLS propriétaire, https seulement), les mots dans `cours.motifs` : migration `20261106000000_agenda.sql`. **Le lien est un secret** : quiconque le connaît lit l'emploi du temps. Il n'est jamais dans le dépôt, jamais réaffiché après l'avoir enregistré, jamais dans un message d'erreur.

Le navigateur lit le fichier **directement chez l'université**, sans relais : son serveur autorise la lecture depuis n'importe quelle origine (en-têtes CORS). S'il cessait de le faire, l'application le dit (« l'université n'autorise plus sa lecture depuis l'application ») et il faudrait un relais côté serveur. Le dernier emploi du temps lu reste sur l'appareil, pour s'afficher aussitôt et hors ligne ; il est relu au-delà de 30 minutes.

## Rester concentré pendant le chrono (extension Chrome, ordinateur)

L'extension `extension/` (Manifest V3, sans dépendance) fait trois choses tant qu'une session Hameau est ouverte **sur le compte**, qu'elle ait été lancée d'ici, du téléphone ou de l'iPad :

- **Elle demande « tu es sûr ? » quand on change de page.** Aller sur un AUTRE site (docs.google.com → mail.google.com compte pour un seul site), depuis un onglet, un lien en nouvel onglet ou un onglet vide, ouvre une page « Tu es en plein chrono » avec « Rester concentré » (retour à la page d'origine, ou à Hameau) et « Continuer quand même », qui ne s'ouvre qu'après un délai réglable (5 s par défaut). Continuer donne un laissez-passer pour CE site (10 min par défaut, réglable) ; il s'oublie à la fin du chrono. Ne demandent jamais rien : Hameau et sa base, les sites de travail de la liste (`claude.ai` au départ), les pages déjà bloquées (la page de blocage, plus ferme, répond), et tout ce qui n'est pas du web. Pendant une pause, rien n'est demandé. La fenêtre de l'extension compte les fois où l'on est resté concentré et celles où l'on a continué.
- **Elle ferme les pages que l'on choisit** : un site entier (`youtube.com`, sous-domaines compris) ou une adresse (`youtube.com/shorts`, `reddit.com/r/memes`) ; on peut coller une adresse copiée du navigateur. La page de blocage n'a aucun bouton pour passer, et ramène à l'adresse demandée dès que le chrono s'arrête.

- **Elle retient sur quels sites on travaille.** Pendant le chrono, elle mesure le temps passé sur chaque SITE (le nom de domaine sans « www », jamais l'adresse d'une page : ni chemin, ni paramètre, ni ancre) et l'envoie au compte (table `sessions_sites`, migration `20261116`, une ligne par session, navigateur, site et titre, au total CUMULÉ : un renvoi réécrit la ligne, il ne s'ajoute pas). Ce qui compte : l'onglet visible de la fenêtre au premier plan, tant qu'on n'est pas inactif depuis cinq minutes (`chrome.idle`) et que le chrono n'est pas en pause ; un segment de mesure ne dépasse pas deux minutes sans nouvelle de l'extension (le service s'endort : on ne compte pas ce qu'on n'a pas vu). Jamais retenus : la navigation privée, les pages qui ne sont pas du web, les adresses IP et `localhost`, Hameau et sa base, et les sites que la personne exclut dans les Options (« Sites à ne jamais retenir »). Le **titre** des pages n'est gardé que si on le coche (désactivé par défaut). Le suivi se coupe d'une case dans les Options ; la déconnexion de l'extension efface la mesure en cours. Hameau l'affiche dans l'Historique (« Sites : claude.ai 38 min · docs.exemple.org 12 min », les trois premiers, ceux vus moins de trente secondes écartés) et dans les Statistiques (carte « Où tu as travaillé (7 jours) », par jour de début de session). Côté application : `src/core/sites.ts` (pur, `tests/sites.test.ts`), `src/data/sites.ts` (lecture, soixante jours, tolère la table absente), `src/ui/useSites.ts` ; côté extension : la logique pure est dans `extension/logique.js` (`avancer`, `cloturer`, `lignesAEnvoyer`…) et l'orchestration dans `extension/background.js` (`suivre`). Une base sans la table : l'extension n'insiste pas (une nouvelle tentative au bout de dix minutes) et l'application n'affiche simplement rien.
- **Comment elle sait** : elle se connecte au compte (e-mail et mot de passe, une fois, dans sa fenêtre ; seul le jeton est gardé, jamais le mot de passe) et lit la session ouverte (`sessions` où `fin` est nul) toutes les 30 secondes. Quand l'application tourne dans Chrome, elle la prévient dès qu'un chrono commence, finit ou change de pause (message `hameau-session` sans aucune donnée, relayé par `extension/relais.js`).
- **Comment elle intervient** : la confirmation écoute les navigations (`webNavigation`) et envoie l'onglet vers la page de confirmation ; le blocage utilise des règles `declarativeNetRequest` (redirection de la page, pas des images d'autres sites), et les onglets déjà ouverts sur ces sites sont renvoyés vers la page de blocage. Chrome ne redirige qu'un site auquel l'extension a accès : YouTube, LinkedIn et Instagram sont dans le manifeste, les autres se demandent à l'enregistrement de la liste (page Options).
- **Garde-fous** : Hameau, GitHub Pages et la base ne se bloquent jamais (sinon on ne pourrait plus arrêter son chrono) ; base injoignable, le blocage tient jusqu'à une heure puis se lève (dans le doute, on ne bloque pas) ; option « tout relâcher pendant les pauses » ; la question se coupe d'un interrupteur. Elle aide à tenir sa parole, elle n'empêche pas de la désactiver dans Chrome. Le chrono est connu à 30 secondes près (immédiatement quand l'application est ouverte dans Chrome).
- **Sa fenêtre** (clic sur l'icône) a deux vues. « Chrono » : une carte avec le temps de travail en direct (pauses déduites, comme le chrono de Hameau), la matière, une pastille « Sites bloqués » / « En pause · sites bloqués » / « Sites libres », les sites du chrono avec leurs barres, et deux boutons (ouvrir Hameau, vérifier maintenant). « Paramètres » (la roue) : la liste des sites bloqués avec un bouton pour la modifier, « Se déconnecter », et la dernière vérification. Ni adresse e-mail ni lignes d'explication sur la vue principale ; un avertissement n'y apparaît que si la base ne répond pas. La logique pure (`secondesDeTravail`, `formatChronoCourt`, `situation`) est dans `extension/logique.js`.
- **Elle dit où elle en est** (parce qu'une extension qui ne bloque pas, sans le dire, ne se répare pas) : l'icône porte un badge — **ON** rouge quand les sites sont bloqués, **!** orange quand elle n'est pas connectée au compte (alors rien ne peut l'être), **II** en pause, **?** quand la base ne répond pas, rien sans chrono ; sa fenêtre affiche la dernière vérification (« il y a 12 s : un chrono est ouvert sur ce compte · 3 règles de blocage actives », ce qui permet de repérer un autre compte ou une base muette). À l'installation, la fenêtre de connexion s'ouvre dans un onglet (l'icône d'une extension fraîchement chargée est cachée dans le menu « puzzle »). Hameau lui demande son état (`hameau-ping`, réponse avec version, connectée ou non, bloquante ou non, jamais une donnée du compte) : pendant un chrono, la carte du chrono dit « L'extension n'est pas connectée à ton compte : elle ne bloque rien » ou « Sites bloqués par l'extension ✓ », et la carte des Réglages dit la même chose.
- **Installer** : Réglages → « Télécharger l'extension » (le zip est engendré au build par `scripts/zipper-extension.mjs`), dézipper, `chrome://extensions` → Mode développeur → « Charger l'extension non empaquetée ». Une extension chargée ainsi ne se met pas à jour toute seule : la carte des Réglages dit si l'extension est détectée dans ce navigateur et si une version plus récente est disponible (`src/core/extension.ts` : `VERSION_EXTENSION` doit rester égale à celle du manifeste, un test le vérifie). `extension/config.js` doit rester identique à `src/data/config.ts` (un test le vérifie aussi). La logique pure est dans `extension/logique.js` (`tests/extension.test.ts`) ; le zip est relu octet par octet (`tests/zip-extension.test.ts`).
- Sur iPhone et iPad, Safari ne sait pas faire cela : le mode « Concentration » d'iOS joue ce rôle.

## Raccourcis clavier (ordinateur)

<kbd>Espace</kbd> lance ou termine une session · <kbd>P</kbd> pause / reprise · <kbd>F</kbd> mode focus · <kbd>Échap</kbd> quitte · <kbd>Ctrl</kbd>+<kbd>Entrée</kbd> enregistre la fin de session.

## Voir le chrono partout

| Appareil | Comment |
|---|---|
| **Mode focus** | Plein écran, grand anneau, et l'écran reste allumé (pratique pour un iPad posé sur le bureau). |
| **Windows** | Edge ou Chrome → *Installer l’application*. Pendant une session, **⧉ Mini-chrono** ouvre une petite fenêtre toujours au premier plan. Le chrono s’affiche aussi dans le titre de la fenêtre / barre des tâches. |
| **iPhone / iPad** | Safari → Partager → *Sur l’écran d’accueil*. L’app s’ouvre en plein écran. |
| **Écran verrouillé iOS** | Une app web ne peut pas créer d’« activité en direct » (réservé à l’App Store). Le **raccourci Apple** contourne ça : il démarre la session *et* le minuteur de l’Horloge, qui, lui, s’affiche sur l’écran verrouillé et dans la Dynamic Island. Guide pas à pas dans l’app, onglet Réglages. |

Les sessions sont synchronisées en temps réel : lancée sur l’iPhone, elle
apparaît sur le PC ; on peut l’arrêter depuis n’importe quel appareil. Une
seule session peut être ouverte à la fois (la base l’impose).

## Mise en place

### Supabase

Pour mettre la base à jour à la main : ouvrir `supabase/A-COLLER-DANS-SUPABASE.sql`, le coller dans l'éditeur SQL du projet `hameau`, « Run ». Il est engendré depuis les migrations (`scripts/fichier-a-coller.sh`) et rejouable sans risque.


Projet `hameau` (région Paris). L'URL et la clé publiable sont dans
`src/data/config.ts` — publiques par conception, la sécurité repose sur les
règles RLS. La migration est dans `supabase/migrations/` (rejouable).

Authentication → URL Configuration : **Site URL** =
`https://maeljoly68-art.github.io/hameau/` (sinon les emails de confirmation
renvoient vers `localhost`). Le lien du **mot de passe oublié** ramène à cette
même adresse : elle doit aussi figurer dans **Redirect URLs**, faute de quoi
Supabase renvoie vers le Site URL.

Les e-mails (confirmation, mot de passe oublié) partent par le service intégré
de Supabase : il envoie très peu de messages par heure et, tant qu'aucun SMTP
personnalisé n'est branché (Authentication → Emails → SMTP Settings), peut se
limiter aux adresses des membres de l'organisation. Pour que des amis du
classement puissent aussi réinitialiser leur mot de passe, il faut un SMTP
(Resend ou Brevo ont une offre gratuite).

Le projet gratuit se met en pause après une semaine sans aucune activité ; il
se relance d'un clic depuis le tableau de bord Supabase.

### Hébergement

GitHub Pages (dépôt public, Settings → Pages → Source : GitHub Actions).
Chaque poussée sur `main` vérifie puis publie sur
https://maeljoly68-art.github.io/hameau/.

### Développer

```sh
npm install
cp .env.exemple .env.local   # facultatif : pour la synchro
npm run dev
```

Avant de pousser :

```sh
npm run verif                 # types, lint, tests, build
npm run verif:sql             # migration à neuf, rejouée, scénario (PostgreSQL requis : PGHOST, PGUSER…)
```

## Organisation

```
src/core/      calculs purs (points, objectifs, niveaux, séries, succès, village) — testés dans tests/
src/data/      stockage : local (localStorage) ou Supabase, même interface
src/ui/        React : village SVG, chrono en anneau, mode focus, mini-chrono, pages (chargées à la demande)
supabase/      migration : tables, RLS, fonctions des raccourcis
tests/sql/     scénario joué sur un vrai PostgreSQL
```

## Performances

- La bibliothèque Supabase (la moitié du poids de l'app) n'est chargée qu'après le premier affichage.
- Le dernier état connu est gardé sur l'appareil : le village s'affiche aussitôt à l'ouverture, puis se met à jour.
- Le village n'est pas redessiné quand le chrono avance : seul le chrono l'est.
- Historique, statistiques et réglages sont téléchargés quand le navigateur est inactif, pas au démarrage.
- React est dans un fichier à part : il reste en cache d'une version de l'app à l'autre.
- La connexion à Supabase est ouverte pendant que l'app démarre, avant la première requête.
