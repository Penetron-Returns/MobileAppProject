-- Client name search for the Nerova connector (clients_search with `name`): the API prefilters with
-- ILIKE '%…%' on clients.name (case-insensitive, wildcard windows) and ranks the candidates in memory.
-- A trigram GIN index lets Postgres answer those ILIKE patterns without scanning every client of every business.
-- pg_trgm ships with Supabase; it lives in the `extensions` schema like the other extensions here.

create extension if not exists pg_trgm with schema extensions;

create index if not exists clients_name_trgm_idx
  on public.clients using gin (name extensions.gin_trgm_ops);
