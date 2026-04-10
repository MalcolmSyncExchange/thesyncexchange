insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agreements',
  'agreements',
  false,
  5242880,
  array[
    'text/html'
  ]
)
on conflict (id) do nothing;

comment on table public.orders is 'TODO: legal review required before agreement_url is treated as production contract output. Agreement artifacts are generated after payment and served through authenticated routes.';
