-- Thor company induction intake for prospective workers.
-- Public form submissions are accepted only through the TOC server route.

create extension if not exists pgcrypto;

create table if not exists public.worker_induction_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  status text not null default 'ready_for_documents' check (status in ('ready_for_documents', 'documents_issued', 'manager_contacted', 'archived')),
  preferred_region text not null,
  region_id uuid references public.regions(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text not null,
  address text,
  suburb text,
  state text,
  postcode text,
  availability_notes text,
  licence_type text,
  has_transport boolean not null default false,
  work_rights_confirmed boolean not null default false,
  safety_acknowledged boolean not null default false,
  privacy_acknowledged boolean not null default false,
  induction_version text not null default 'thor-company-induction-v1',
  manager_notes text,
  issued_documents_at timestamptz,
  archived_at timestamptz
);

comment on table public.worker_induction_submissions is 'Prospective worker company induction completions awaiting regional manager document issue.';

create index if not exists worker_induction_submissions_region_status_idx
  on public.worker_induction_submissions(region_id, status, completed_at desc);

create index if not exists worker_induction_submissions_email_idx
  on public.worker_induction_submissions(lower(email));

alter table public.worker_induction_submissions enable row level security;
revoke all on table public.worker_induction_submissions from anon;
revoke all on table public.worker_induction_submissions from authenticated;
drop policy if exists toc_service_role_all on public.worker_induction_submissions;
create policy toc_service_role_all on public.worker_induction_submissions
  for all to service_role using (true) with check (true);
