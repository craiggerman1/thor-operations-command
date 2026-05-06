-- Odin Command foundation for TOC.
-- Odin reads TOC through server APIs and writes recommendations, alerts and briefs here.

create extension if not exists pgcrypto;

create table if not exists public.odin_items (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('alert', 'recommendation', 'brief', 'follow_up', 'draft_message', 'call_log', 'action_request')),
  title text not null,
  summary text not null default '',
  region text not null default 'National',
  source_type text not null default 'toc',
  source_id text,
  severity text not null default 'blue' check (severity in ('green', 'amber', 'red', 'blue')),
  confidence numeric not null default 75 check (confidence >= 0 and confidence <= 100),
  approval_required boolean not null default true,
  status text not null default 'pending' check (status in ('pending', 'approved', 'done', 'dismissed', 'rejected')),
  noticed text not null default '',
  why_it_matters text not null default '',
  recommended_action text not null default '',
  assigned_to text not null default 'National',
  due_at timestamptz,
  created_by text not null default 'odin',
  approved_by uuid,
  approved_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists odin_items_status_idx on public.odin_items(status);
create index if not exists odin_items_region_idx on public.odin_items(region);
create index if not exists odin_items_type_idx on public.odin_items(item_type);
create index if not exists odin_items_created_at_idx on public.odin_items(created_at desc);

create table if not exists public.odin_activity_log (
  id uuid primary key default gen_random_uuid(),
  odin_item_id uuid references public.odin_items(id) on delete set null,
  actor_profile_id uuid,
  actor_type text not null default 'toc_user',
  action text not null,
  note text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists odin_activity_item_idx on public.odin_activity_log(odin_item_id);
create index if not exists odin_activity_created_at_idx on public.odin_activity_log(created_at desc);

alter table public.odin_items enable row level security;
alter table public.odin_activity_log enable row level security;

revoke all on table public.odin_items from anon;
revoke all on table public.odin_items from authenticated;
revoke all on table public.odin_activity_log from anon;
revoke all on table public.odin_activity_log from authenticated;

drop policy if exists toc_service_role_all on public.odin_items;
create policy toc_service_role_all on public.odin_items
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists toc_service_role_all on public.odin_activity_log;
create policy toc_service_role_all on public.odin_activity_log
  for all
  to service_role
  using (true)
  with check (true);

