-- Repair TOC audit_log shape if the table was created before the final audit schema.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

alter table public.audit_log
  add column if not exists actor_id uuid,
  add column if not exists actor_role text,
  add column if not exists action text,
  add column if not exists entity_table text,
  add column if not exists entity_id text,
  add column if not exists scope text,
  add column if not exists details jsonb not null default '{}'::jsonb;

update public.audit_log
set action = 'legacy.audit.entry'
where action is null;

alter table public.audit_log
  alter column action set not null,
  alter column details set default '{}'::jsonb;

alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon;
revoke all on table public.audit_log from authenticated;
drop policy if exists toc_service_role_all on public.audit_log;
create policy toc_service_role_all on public.audit_log
  for all
  to service_role
  using (true)
  with check (true);

