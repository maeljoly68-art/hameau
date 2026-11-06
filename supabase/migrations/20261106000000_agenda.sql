-- Emploi du temps de l'université. Additive et rejouable : rien de ce qui existe n'est retiré.
--
-- · l'adresse du flux iCalendar : c'est un SECRET (quiconque la connaît lit l'emploi du temps), donc
--   dans la ligne de réglages du compte, que la RLS réserve à son propriétaire. https seulement : un
--   « javascript: » collé là finirait dans une requête.
-- · pour chaque cours, les mots qui rattachent les créneaux du flux à ce cours.
alter table public.reglages_cours
  add column if not exists agenda_url text
  check (agenda_url is null or (agenda_url ~ '^https://[^[:space:]]+$' and char_length(agenda_url) <= 500));

alter table public.cours
  add column if not exists motifs text not null default ''
  check (char_length(motifs) <= 300);
