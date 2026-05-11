create table if not exists public.operations_setup_status (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  current_step integer not null default 1 check (current_step >= 1 and current_step <= 5),
  completed_at timestamptz,
  force_run_next_login boolean not null default false,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, region_id)
);

create table if not exists public.site_schedule_staff (
  id uuid primary key default gen_random_uuid(),
  site_schedule_id uuid not null references public.site_schedules(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  role text not null default 'Wash Hand',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_schedule_id, staff_profile_id)
);

alter table public.site_schedules
  add column if not exists wash_asset text not null default '';

create index if not exists operations_setup_status_profile_region_idx on public.operations_setup_status(profile_id, region_id);
create index if not exists operations_setup_status_force_idx on public.operations_setup_status(force_run_next_login);
create index if not exists site_schedule_staff_schedule_idx on public.site_schedule_staff(site_schedule_id);
create index if not exists site_schedule_staff_staff_idx on public.site_schedule_staff(staff_profile_id);

alter table public.operations_setup_status enable row level security;
alter table public.site_schedule_staff enable row level security;

revoke all on table public.operations_setup_status from anon;
revoke all on table public.operations_setup_status from authenticated;
revoke all on table public.site_schedule_staff from anon;
revoke all on table public.site_schedule_staff from authenticated;

drop policy if exists toc_service_role_operations_setup_status_all on public.operations_setup_status;
create policy toc_service_role_operations_setup_status_all on public.operations_setup_status
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists toc_service_role_site_schedule_staff_all on public.site_schedule_staff;
create policy toc_service_role_site_schedule_staff_all on public.site_schedule_staff
  for all
  to service_role
  using (true)
  with check (true);
