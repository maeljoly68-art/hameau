-- Pages « à savoir mot pour mot » : une formule, un article, un dialogue, des chiffres clés.
-- La page suit un cycle de révision resserré et reste en apprentissage un retour de plus (voir src/core/revision.ts).
-- Colonne additive, non nulle, à faux par défaut : toutes les pages existantes gardent leur cycle ordinaire,
-- et l'application sait lire une base où la colonne n'existe pas encore.
alter table public.chapitres add column if not exists par_coeur boolean not null default false;
