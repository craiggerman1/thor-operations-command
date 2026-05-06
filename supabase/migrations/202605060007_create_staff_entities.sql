create table if not exists public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  preferred_name text,
  role text not null default 'Wash Hand',
  status text not null default 'active' check (status in ('active', 'inactive', 'watch')),
  primary_region_id uuid references public.regions(id) on delete set null,
  skills text[] not null default '{}',
  preferred_windows jsonb not null default '{}'::jsonb,
  reliability_notes text not null default '',
  availability_sheet_name text,
  induction_sheet_name text,
  contact_mobile text,
  contact_whatsapp text,
  emergency_contact jsonb not null default '{}'::jsonb,
  contact_visible_to_odin boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.staff_profile_regions (
  staff_profile_id uuid not null references public.staff_profiles(id) on delete cascade,
  region_id uuid not null references public.regions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (staff_profile_id, region_id)
);

create index if not exists staff_profiles_primary_region_idx on public.staff_profiles(primary_region_id);
create index if not exists staff_profiles_status_idx on public.staff_profiles(status);
create index if not exists staff_profile_regions_region_idx on public.staff_profile_regions(region_id);

alter table public.staff_profiles enable row level security;
alter table public.staff_profile_regions enable row level security;

revoke all on table public.staff_profiles from anon;
revoke all on table public.staff_profiles from authenticated;
revoke all on table public.staff_profile_regions from anon;
revoke all on table public.staff_profile_regions from authenticated;

drop policy if exists toc_service_role_staff_profiles_all on public.staff_profiles;
create policy toc_service_role_staff_profiles_all on public.staff_profiles
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists toc_service_role_staff_profile_regions_all on public.staff_profile_regions;
create policy toc_service_role_staff_profile_regions_all on public.staff_profile_regions
  for all
  to service_role
  using (true)
  with check (true);
