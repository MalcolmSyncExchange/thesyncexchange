alter table public.orders
  add column if not exists checkout_created_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists agreement_generated_at timestamptz,
  add column if not exists fulfilled_at timestamptz,
  add column if not exists refunded_at timestamptz;

update public.orders
set checkout_created_at = coalesce(checkout_created_at, created_at)
where stripe_checkout_session_id is not null;

update public.orders
set paid_at = coalesce(paid_at, updated_at)
where status in ('paid', 'fulfilled', 'refunded');

update public.orders
set agreement_generated_at = coalesce(agreement_generated_at, updated_at)
where agreement_url is not null;

update public.orders
set fulfilled_at = coalesce(fulfilled_at, updated_at)
where status = 'fulfilled';

update public.orders
set refunded_at = coalesce(refunded_at, updated_at)
where status = 'refunded';

create index if not exists orders_checkout_created_idx on public.orders(checkout_created_at desc);
create index if not exists orders_paid_at_idx on public.orders(paid_at desc);
create index if not exists orders_fulfilled_at_idx on public.orders(fulfilled_at desc);

comment on column public.orders.checkout_created_at is 'Timestamp when a Stripe Checkout Session was successfully created for this order.';
comment on column public.orders.paid_at is 'Timestamp when Stripe reported successful payment for this order.';
comment on column public.orders.agreement_generated_at is 'Timestamp when the downloadable agreement artifact was generated.';
comment on column public.orders.fulfilled_at is 'Timestamp when the order was fully fulfilled for buyer delivery.';
comment on column public.orders.refunded_at is 'Timestamp when the order was marked refunded.';
