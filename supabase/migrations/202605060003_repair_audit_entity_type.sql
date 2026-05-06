-- Repair older audit_log tables that require entity_type.
-- Safe to run more than once.

alter table public.audit_log
  add column if not exists entity_type text;

update public.audit_log
set entity_type = coalesce(entity_type, entity_table, action, 'toc.audit')
where entity_type is null;

alter table public.audit_log
  alter column entity_type set default 'toc.audit',
  alter column entity_type set not null;

