-- Evidence attachments for Action Centre close-outs and blocked manager updates.
-- Files are stored privately in Supabase Storage and served through signed URLs by server routes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'action-evidence',
  'action-evidence',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.action_evidence_files (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action_id uuid references public.action_items(id) on delete cascade,
  national_request_id uuid references public.national_requests(id) on delete set null,
  bucket text not null default 'action-evidence',
  object_path text not null,
  file_name text not null,
  content_type text not null,
  file_size integer not null default 0,
  uploaded_by uuid references public.profiles(id) on delete set null,
  manager_note text,
  purpose text not null default 'closeout'
);

create index if not exists action_evidence_files_action_idx
  on public.action_evidence_files(action_id, created_at desc);

create index if not exists action_evidence_files_request_idx
  on public.action_evidence_files(national_request_id, created_at desc);

alter table public.action_evidence_files enable row level security;
revoke all on table public.action_evidence_files from anon;
revoke all on table public.action_evidence_files from authenticated;
grant select, insert, update, delete on table public.action_evidence_files to service_role;

drop policy if exists toc_service_role_all on public.action_evidence_files;
create policy toc_service_role_all
on public.action_evidence_files
for all
to service_role
using (true)
with check (true);
