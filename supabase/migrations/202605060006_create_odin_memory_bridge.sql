-- Odin persistent memory and gateway interaction log.
-- These tables are backend-only. The browser never receives service keys or direct table access.

create extension if not exists pgcrypto;

create table if not exists public.odin_memory (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  source_type text not null default 'toc',
  source_id text,
  region text not null default 'National',
  title text not null default '',
  summary text not null default '',
  facts jsonb not null default '{}'::jsonb,
  last_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists odin_memory_region_idx on public.odin_memory(region);
create index if not exists odin_memory_source_idx on public.odin_memory(source_type, source_id);
create index if not exists odin_memory_updated_at_idx on public.odin_memory(updated_at desc);

create table if not exists public.odin_interactions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null,
  source_type text not null default 'toc',
  source_id text,
  region text not null default 'National',
  requested_by uuid,
  actor_type text not null default 'toc_user',
  prompt text not null default '',
  context_payload jsonb not null default '{}'::jsonb,
  gateway_request jsonb not null default '{}'::jsonb,
  gateway_response jsonb not null default '{}'::jsonb,
  structured_response jsonb not null default '{}'::jsonb,
  odin_item_id uuid references public.odin_items(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists odin_interactions_session_idx on public.odin_interactions(session_key);
create index if not exists odin_interactions_region_idx on public.odin_interactions(region);
create index if not exists odin_interactions_created_at_idx on public.odin_interactions(created_at desc);

alter table public.odin_memory enable row level security;
alter table public.odin_interactions enable row level security;

revoke all on table public.odin_memory from anon;
revoke all on table public.odin_memory from authenticated;
revoke all on table public.odin_interactions from anon;
revoke all on table public.odin_interactions from authenticated;

drop policy if exists toc_service_role_all on public.odin_memory;
create policy toc_service_role_all on public.odin_memory
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists toc_service_role_all on public.odin_interactions;
create policy toc_service_role_all on public.odin_interactions
  for all
  to service_role
  using (true)
  with check (true);
