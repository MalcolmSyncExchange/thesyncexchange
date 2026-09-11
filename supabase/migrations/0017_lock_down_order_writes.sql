-- Lock down order creation so buyers cannot directly insert arbitrary pending orders.
-- Orders must be created by trusted server-side checkout code, which derives price
-- from approved tracks and active license options before sending buyers to Stripe.

begin;

drop policy if exists "Buyers can create pending orders for themselves" on public.orders;

revoke insert on table public.orders from authenticated;
revoke update on table public.orders from authenticated;

comment on table public.orders is
  'Orders are created and fulfilled by trusted server-side code. Authenticated buyers may read their own orders but cannot directly insert or update order price/payment state.';

commit;
