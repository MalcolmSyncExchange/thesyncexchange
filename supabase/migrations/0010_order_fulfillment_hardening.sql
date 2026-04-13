alter table public.orders
  add column if not exists agreement_path text,
  add column if not exists agreement_content_type text,
  add column if not exists agreement_size_bytes integer,
  add column if not exists agreement_generation_error text,
  add column if not exists last_webhook_event_id text,
  add column if not exists last_webhook_event_type text,
  add column if not exists last_webhook_processed_at timestamptz,
  add column if not exists last_webhook_error text;

update public.orders
set agreement_path = coalesce(agreement_path, format('orders/%s/license-agreement.pdf', id))
where agreement_url is not null
   or agreement_generated_at is not null;

create index if not exists orders_last_webhook_processed_idx on public.orders(last_webhook_processed_at desc);

comment on column public.orders.agreement_path is 'Private storage object path for the generated agreement artifact.';
comment on column public.orders.agreement_content_type is 'Content type recorded when the agreement artifact was generated.';
comment on column public.orders.agreement_size_bytes is 'Artifact size in bytes for the generated agreement document.';
comment on column public.orders.agreement_generation_error is 'Last agreement generation error recorded for this order, if any.';
comment on column public.orders.last_webhook_event_id is 'Most recent Stripe webhook event id processed for this order.';
comment on column public.orders.last_webhook_event_type is 'Most recent Stripe webhook event type processed for this order.';
comment on column public.orders.last_webhook_processed_at is 'Timestamp when the most recent Stripe webhook event finished processing for this order.';
comment on column public.orders.last_webhook_error is 'Most recent Stripe webhook processing error recorded for this order.';

create table if not exists public.order_activity_log (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('system', 'stripe_webhook', 'admin', 'buyer')),
  event_type text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists order_activity_log_order_created_idx on public.order_activity_log(order_id, created_at desc);
create index if not exists order_activity_log_event_type_idx on public.order_activity_log(event_type);
create unique index if not exists order_activity_log_dedupe_key_idx
  on public.order_activity_log(dedupe_key)
  where dedupe_key is not null;

alter table public.order_activity_log enable row level security;

drop policy if exists "Admins can read order activity" on public.order_activity_log;
drop policy if exists "Buyers can read own order activity" on public.order_activity_log;

create policy "Admins can read order activity"
on public.order_activity_log
for select
to authenticated
using (public.is_admin());

create policy "Buyers can read own order activity"
on public.order_activity_log
for select
to authenticated
using (
  exists (
    select 1
    from public.orders
    where public.orders.id = public.order_activity_log.order_id
      and public.orders.buyer_user_id = auth.uid()
  )
);

comment on table public.order_activity_log is 'Operational audit trail for order lifecycle, webhook processing, agreement generation, and manual admin actions.';
