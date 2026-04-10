create table if not exists public.review_notes (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.track_audit_log (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.review_notes enable row level security;
alter table public.track_audit_log enable row level security;

comment on table public.review_notes is 'Admin reviewer notes for track moderation and submission review.';
comment on table public.track_audit_log is 'Audit history for moderation, compliance, and artist lifecycle changes.';
