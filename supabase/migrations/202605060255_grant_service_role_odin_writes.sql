grant select, insert, update on table public.odin_items to service_role;
grant select, insert, update on table public.odin_activity_log to service_role;
grant select, insert, update on table public.odin_memory to service_role;
grant select, insert, update on table public.odin_interactions to service_role;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'odin_items'
      and policyname = 'odin_items_service_role_write'
  ) then
    create policy odin_items_service_role_write
    on public.odin_items
    for all
    to service_role
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'odin_activity_log'
      and policyname = 'odin_activity_log_service_role_write'
  ) then
    create policy odin_activity_log_service_role_write
    on public.odin_activity_log
    for all
    to service_role
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'odin_memory'
      and policyname = 'odin_memory_service_role_write'
  ) then
    create policy odin_memory_service_role_write
    on public.odin_memory
    for all
    to service_role
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'odin_interactions'
      and policyname = 'odin_interactions_service_role_write'
  ) then
    create policy odin_interactions_service_role_write
    on public.odin_interactions
    for all
    to service_role
    using (true)
    with check (true);
  end if;
end $$;
