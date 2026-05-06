create index if not exists audit_log_created_at_desc_idx
  on public.audit_log (created_at desc);

create index if not exists audit_log_action_idx
  on public.audit_log (action);

create index if not exists audit_log_actor_profile_id_idx
  on public.audit_log (actor_profile_id);

create index if not exists audit_log_entity_type_idx
  on public.audit_log (entity_type);
