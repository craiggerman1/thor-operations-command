-- Repair older audit_log tables so TOC can show the real acting profile.
-- Safe to run more than once.

alter table public.audit_log
  add column if not exists actor_id uuid,
  add column if not exists actor_profile_id uuid;

update public.audit_log
set actor_profile_id = coalesce(actor_profile_id, actor_id)
where actor_profile_id is null;

