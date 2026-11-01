-- Imitation minimale de Supabase pour vérifier la migration sur un
-- PostgreSQL nu : schéma auth, rôles et auth.uid() lu dans un réglage.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as
$$ select nullif(current_setting('test.uid', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant usage on schema public to anon, authenticated;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated;
