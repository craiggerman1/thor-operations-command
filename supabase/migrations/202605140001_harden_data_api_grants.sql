-- Build 0.432 - explicit Data API grants for Supabase public-schema changes.
--
-- Supabase is moving public-schema Data API exposure to an explicit GRANT model.
-- TOC's security model is server-mediated: browser users authenticate with
-- Supabase Auth, then TOC API routes enforce role/scope and use service_role
-- server-side for operational tables. Do not grant anon/authenticated table
-- access here unless a future table is intentionally read directly by browser
-- supabase-js and has a matching RLS policy.

grant usage on schema public to service_role;

grant all privileges on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke all privileges on all tables in schema public from anon;
revoke all privileges on all tables in schema public from authenticated;

alter default privileges in schema public
  grant select, insert, update, delete, truncate, references, trigger
  on tables to service_role;

alter default privileges in schema public
  grant usage, select
  on sequences to service_role;

alter default privileges in schema public
  revoke all
  on tables from anon;

alter default privileges in schema public
  revoke all
  on tables from authenticated;

do $$
declare
  table_record record;
begin
  for table_record in
    select tablename
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_record.tablename);
  end loop;
end $$;
