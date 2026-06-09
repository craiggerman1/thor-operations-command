-- Speed up Action Centre manager queues, close-outs and National review lookups.
-- Additive index-only migration; no data or policy changes.

create index if not exists action_items_active_queue_idx
  on public.action_items(status, assigned_region_id, due_at, updated_at desc)
  where status <> 'closed';

create index if not exists action_items_source_active_idx
  on public.action_items(source_page, status, created_at desc)
  where status <> 'closed';

create index if not exists national_requests_action_review_idx
  on public.national_requests(source_action_id, request_type, status, created_at desc);

create index if not exists national_requests_open_review_idx
  on public.national_requests(status, request_type, created_at desc)
  where status = 'awaiting_review';

create index if not exists action_evidence_files_action_purpose_idx
  on public.action_evidence_files(action_id, purpose, created_at desc);
