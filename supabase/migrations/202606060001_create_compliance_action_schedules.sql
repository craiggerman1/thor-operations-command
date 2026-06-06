-- Recurring compliance action schedules for admin-created manager actions.
-- Each row targets one region so region visibility remains explicit and auditable.

create table if not exists public.compliance_action_schedules (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  title text not null,
  detail text,
  directive_type text not null default 'Scheduled Directive',
  priority text not null default 'normal',
  cadence text not null check (cadence in ('weekly', 'monthly', 'annual')),
  interval_months integer not null default 1 check (interval_months >= 1 and interval_months <= 24),
  region_id uuid references public.regions(id) on delete set null,
  next_due_at timestamptz not null,
  last_generated_at timestamptz,
  active boolean not null default true
);

alter table public.compliance_items
  add column if not exists recurrence_schedule_id uuid references public.compliance_action_schedules(id) on delete set null,
  add column if not exists scheduled_for timestamptz;

create index if not exists compliance_action_schedules_due_idx
  on public.compliance_action_schedules(active, next_due_at);

create index if not exists compliance_action_schedules_region_idx
  on public.compliance_action_schedules(region_id);

create index if not exists compliance_items_recurrence_idx
  on public.compliance_items(recurrence_schedule_id, status, scheduled_for);

alter table public.compliance_action_schedules enable row level security;
revoke all on table public.compliance_action_schedules from anon;
revoke all on table public.compliance_action_schedules from authenticated;
grant select, insert, update, delete on table public.compliance_action_schedules to service_role;
grant select, insert, update on table public.compliance_items to service_role;

drop policy if exists toc_service_role_all on public.compliance_action_schedules;
create policy toc_service_role_all
on public.compliance_action_schedules
for all
to service_role
using (true)
with check (true);
