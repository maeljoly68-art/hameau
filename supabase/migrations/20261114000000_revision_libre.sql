-- Révision libre : des séances d'étude placées au calendrier pour un cours qui n'a pas (ou pas assez) de pages
-- (Contrôle de gestion, Droit du numérique, Finance). Additive et rejouable : rien de ce qui existe n'est retiré.

-- Minutes d'une séance de révision libre ; absente : pas de séances libres pour ce cours.
alter table public.cours add column if not exists revision_libre_min smallint;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cours_revision_libre_bornee' and conrelid = 'public.cours'::regclass) then
    alter table public.cours add constraint cours_revision_libre_bornee check (revision_libre_min is null or revision_libre_min between 10 and 180);
  end if;
end;
$$;

-- Les minutes déclarées à la main servent maintenant à deux choses : l'artefact d'erreurs (par défaut, comme avant)
-- et une séance de révision libre.
alter table public.pratiques add column if not exists sorte text not null default 'erreurs';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pratiques_sorte_connue' and conrelid = 'public.pratiques'::regclass) then
    alter table public.pratiques add constraint pratiques_sorte_connue check (sorte in ('erreurs', 'revision'));
  end if;
end;
$$;
