create table if not exists public.generated_licenses (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  license_type_id uuid references public.license_types(id) on delete set null,
  agreement_number text not null,
  status text not null default 'generated' check (status in ('pending', 'generated', 'failed')),
  terms_snapshot_json jsonb not null default '{}'::jsonb,
  pdf_storage_path text,
  pdf_content_type text,
  pdf_size_bytes integer,
  html_snapshot text,
  generation_error text,
  generated_at timestamptz not null default timezone('utc', now()),
  downloaded_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint generated_licenses_order_id_key unique (order_id),
  constraint generated_licenses_agreement_number_key unique (agreement_number)
);

create index if not exists generated_licenses_buyer_generated_idx on public.generated_licenses(buyer_id, generated_at desc);
create index if not exists generated_licenses_status_idx on public.generated_licenses(status);

drop trigger if exists update_generated_licenses_updated_at on public.generated_licenses;
create trigger update_generated_licenses_updated_at
before update on public.generated_licenses
for each row
execute function public.update_updated_at_column();

alter table public.generated_licenses enable row level security;

drop policy if exists "Buyers can read own generated licenses" on public.generated_licenses;
drop policy if exists "Admins can read generated licenses" on public.generated_licenses;

create policy "Buyers can read own generated licenses"
on public.generated_licenses
for select
to authenticated
using (buyer_id = auth.uid());

create policy "Admins can read generated licenses"
on public.generated_licenses
for select
to authenticated
using (public.is_admin());

comment on table public.generated_licenses is 'One generated sync-license artifact per completed order, including the frozen purchase-time terms snapshot and secure storage path.';
comment on column public.generated_licenses.terms_snapshot_json is 'Frozen purchase-time license terms snapshot used to render the generated agreement artifact.';
comment on column public.generated_licenses.pdf_storage_path is 'Private Supabase Storage path for the generated sync license PDF.';
comment on column public.generated_licenses.html_snapshot is 'Rendered HTML snapshot used as the source agreement markup for the generated artifact.';
comment on column public.generated_licenses.generation_error is 'Most recent agreement generation failure message for this order, if generation failed.';
