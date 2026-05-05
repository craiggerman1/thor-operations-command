-- Thor Operations Command security foundation.
-- Apply from Supabase SQL Editor after checking the table list matches production.
-- The TOC app reads and writes operational data through server routes using the
-- service role key. Browser users should not query these tables directly.

create extension if not exists pgcrypto;

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null,
  entity_table text,
  entity_id text,
  scope text,
  details jsonb not null default '{}'::jsonb
);

comment on table public.audit_log is 'Server-written audit trail for TOC security and operational actions.';

do $$
declare
  table_name text;
  protected_tables text[] := array[
    'action_items',
    'app_settings',
    'audit_log',
    'calendar_jobs',
    'chat_messages',
    'compliance_items',
    'equipment_assets',
    'national_requests',
    'productivity_responses',
    'productivity_sites',
    'profile_regions',
    'profiles',
    'regions',
    'stock_order_items',
    'stock_orders',
    'todo_items',
    'urgent_broadcasts'
  ];
begin
  foreach table_name in array protected_tables loop
    if to_regclass(format('public.%I', table_name)) is not null then
      execute format('alter table public.%I enable row level security', table_name);
      execute format('revoke all on table public.%I from anon', table_name);
      execute format('revoke all on table public.%I from authenticated', table_name);
      execute format('drop policy if exists toc_service_role_all on public.%I', table_name);
      execute format(
        'create policy toc_service_role_all on public.%I for all to service_role using (true) with check (true)',
        table_name
      );
    end if;
  end loop;
end $$;

