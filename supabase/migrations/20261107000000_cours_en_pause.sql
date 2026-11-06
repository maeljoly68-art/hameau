-- Cours en pause. Additive et rejouable : rien de ce qui existe n'est retiré.
--
-- Un cours en pause reste dans la liste, avec ses chapitres, ses notes et sa progression, mais sort du
-- calendrier : ni séance, ni alerte, ni partiel affiché. C'est un état du cours, pas une suppression.
alter table public.cours
  add column if not exists en_pause boolean not null default false;
