-- 008_private_is_admin.sql
-- Resolves Supabase security advisor: "Signed-In Users Can Execute SECURITY
-- DEFINER Function" (lint 0029) on public.is_admin().
--
-- PostgREST exposes every function in the `public` schema at /rest/v1/rpc/*.
-- is_admin() only needs to be callable by RLS policy expressions, not by API
-- clients. Moving it to a non-exposed schema removes the API surface while
-- keeping every dependent policy working — Postgres stores policy expressions
-- by function OID, so ALTER FUNCTION ... SET SCHEMA does not break them.

begin;

create schema if not exists app_private;

revoke all on schema app_private from public;
grant usage on schema app_private to authenticated;

alter function public.is_admin() set schema app_private;

-- RLS policy expressions run with the privileges of the querying role, so
-- `authenticated` must keep EXECUTE. No policy evaluates it as `anon`.
revoke execute on function app_private.is_admin() from public;
grant execute on function app_private.is_admin() to authenticated;

commit;
