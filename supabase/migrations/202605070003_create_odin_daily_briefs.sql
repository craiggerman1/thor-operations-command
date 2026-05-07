create table if not exists public.odin_daily_briefs (
  id uuid primary key default gen_random_uuid(),
  brief_date date not null,
  brief_type text not null check (brief_type in ('morning', 'midday', 'end_of_day', 'weekly')),
  region text not null default 'National',
  title text not null,
  summary text not null,
  severity text not null default 'blue' check (severity in ('blue', 'amber', 'red')),
  status text not null default 'current' check (status in ('draft', 'current', 'archived')),
  priority_items jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  generated_by text not null default 'odin',
  source text not null default 'toc',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brief_date, brief_type, region)
);

alter table public.odin_daily_briefs enable row level security;

drop policy if exists toc_service_role_all on public.odin_daily_briefs;
create policy toc_service_role_all
  on public.odin_daily_briefs
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists odin_daily_briefs_date_type_idx
  on public.odin_daily_briefs (brief_date desc, brief_type, region);

create index if not exists odin_daily_briefs_severity_idx
  on public.odin_daily_briefs (severity);
