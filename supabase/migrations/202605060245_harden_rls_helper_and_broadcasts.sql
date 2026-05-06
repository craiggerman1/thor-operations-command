revoke execute on function public.rls_auto_enable() from public;
revoke execute on function public.rls_auto_enable() from anon;
revoke execute on function public.rls_auto_enable() from authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'broadcasts'
      and policyname = 'broadcasts_service_role_only'
  ) then
    create policy broadcasts_service_role_only
    on public.broadcasts
    for all
    to service_role
    using (true)
    with check (true);
  end if;
end $$;
