-- Runs once when the local/CI Postgres container first initializes its data
-- directory (postgres image's docker-entrypoint-initdb.d convention).
--
-- Migration 0001 (RLS lockdown) grants/revokes privileges from Supabase's
-- `anon`/`authenticated` roles so the exact same migration files apply
-- unchanged everywhere (docs/03 §4 "Portability note"). Those roles don't
-- exist outside Supabase, so a vanilla Postgres needs stand-ins before
-- migrations can run. NOLOGIN: nothing ever connects as these roles here,
-- they exist only to be the target of GRANT/REVOKE.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
