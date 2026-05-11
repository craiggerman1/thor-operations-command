create table if not exists public.operation_sites (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  site_name text not null,
  region_id uuid references public.regions(id) on delete set null,
  address text not null default '',
  site_contact_name text not null default '',
  site_contact_phone text not null default '',
  site_contact_email text not null default '',
  required_induction boolean not null default true,
  required_crew_count integer not null default 2 check (required_crew_count >= 0 and required_crew_count <= 20),
  site_rules text not null default '',
  hazards text not null default '',
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive', 'watch')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_schedules (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.operation_sites(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  schedule_name text not null default '',
  start_date date not null default current_date,
  end_date date,
  job_time time not null default '07:00',
  recurrence text not null default 'Weekly' check (recurrence in ('None', 'Daily', 'Weekly', 'Fortnightly', '4 weekly', 'Custom')),
  recurrence_interval_weeks integer not null default 1 check (recurrence_interval_weeks >= 1 and recurrence_interval_weeks <= 52),
  required_crew_count integer not null default 2 check (required_crew_count >= 0 and required_crew_count <= 20),
  job_title text not null default 'Scheduled wash',
  notes text not null default '',
  status text not null default 'active' check (status in ('active', 'inactive')),
  last_generated_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calendar_job_staff (
  id uuid primary key default gen_random_uuid(),
  calendar_job_id uuid not null references public.calendar_jobs(id) on delete cascade,
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  role text not null default 'Wash Hand',
  assignment_status text not null default 'assigned' check (assignment_status in ('assigned', 'tentative', 'declined', 'removed')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_job_id, staff_profile_id)
);

create table if not exists public.staff_availability_cache (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  staff_name text not null,
  region_id uuid references public.regions(id) on delete set null,
  source_slug text not null default 'staff-availability',
  source_name text not null default '',
  day_name text not null,
  window_name text not null,
  status text not null default '',
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_name, region_id, source_slug, day_name, window_name)
);

create table if not exists public.staff_induction_cache (
  id uuid primary key default gen_random_uuid(),
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  staff_name text not null,
  site_id uuid references public.operation_sites(id) on delete set null,
  site_name text not null,
  region_id uuid references public.regions(id) on delete set null,
  source_slug text not null default 'inductions',
  source_name text not null default '',
  status text not null default '',
  expiry text not null default '',
  source_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_name, site_name, region_id, source_slug)
);

alter table public.calendar_jobs
  add column if not exists site_id uuid references public.operation_sites(id) on delete set null,
  add column if not exists required_crew_count integer not null default 2 check (required_crew_count >= 0 and required_crew_count <= 20),
  add column if not exists source_schedule_id uuid references public.site_schedules(id) on delete set null;

create index if not exists operation_sites_region_status_idx on public.operation_sites(region_id, status);
create index if not exists operation_sites_client_site_idx on public.operation_sites(client_name, site_name);
create index if not exists site_schedules_site_status_idx on public.site_schedules(site_id, status);
create index if not exists site_schedules_region_status_idx on public.site_schedules(region_id, status);
create index if not exists calendar_job_staff_job_idx on public.calendar_job_staff(calendar_job_id);
create index if not exists calendar_job_staff_staff_idx on public.calendar_job_staff(staff_profile_id);
create index if not exists staff_availability_cache_staff_idx on public.staff_availability_cache(staff_profile_id, staff_name);
create index if not exists staff_availability_cache_region_idx on public.staff_availability_cache(region_id);
create index if not exists staff_induction_cache_staff_idx on public.staff_induction_cache(staff_profile_id, staff_name);
create index if not exists staff_induction_cache_site_idx on public.staff_induction_cache(site_id, site_name);
create index if not exists calendar_jobs_site_idx on public.calendar_jobs(site_id);
create index if not exists calendar_jobs_source_schedule_idx on public.calendar_jobs(source_schedule_id);

alter table public.operation_sites enable row level security;
alter table public.site_schedules enable row level security;
alter table public.calendar_job_staff enable row level security;
alter table public.staff_availability_cache enable row level security;
alter table public.staff_induction_cache enable row level security;

revoke all on table public.operation_sites from anon;
revoke all on table public.operation_sites from authenticated;
revoke all on table public.site_schedules from anon;
revoke all on table public.site_schedules from authenticated;
revoke all on table public.calendar_job_staff from anon;
revoke all on table public.calendar_job_staff from authenticated;
revoke all on table public.staff_availability_cache from anon;
revoke all on table public.staff_availability_cache from authenticated;
revoke all on table public.staff_induction_cache from anon;
revoke all on table public.staff_induction_cache from authenticated;

drop policy if exists toc_service_role_operation_sites_all on public.operation_sites;
create policy toc_service_role_operation_sites_all on public.operation_sites
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists toc_service_role_site_schedules_all on public.site_schedules;
create policy toc_service_role_site_schedules_all on public.site_schedules
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists toc_service_role_calendar_job_staff_all on public.calendar_job_staff;
create policy toc_service_role_calendar_job_staff_all on public.calendar_job_staff
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists toc_service_role_staff_availability_cache_all on public.staff_availability_cache;
create policy toc_service_role_staff_availability_cache_all on public.staff_availability_cache
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists toc_service_role_staff_induction_cache_all on public.staff_induction_cache;
create policy toc_service_role_staff_induction_cache_all on public.staff_induction_cache
  for all
  to service_role
  using (true)
  with check (true);
