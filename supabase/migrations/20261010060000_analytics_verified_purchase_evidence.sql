-- Read-only analytics projection of the immutable purchase-completion evidence.
-- Must follow the purchase-completion and Gate D migrations. No backfill or flags.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create or replace function public.get_analytics_verified_purchase(
  p_order_id uuid, p_provider_account text, p_provider_event_id text
) returns table (
  order_id uuid, buyer_user_id uuid, track_id uuid, license_type text,
  checkout_session_id text, payment_intent_id text, amount_minor integer,
  currency text, payment_mode text, paid_at timestamptz,
  payment_event_id uuid, verified_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  -- Gate D tables deliberately have no direct service-role grants. Expose only
  -- this bounded projection, with both an EXECUTE grant and an explicit guard.
  perform commerce_private.require_service_role();
  return query
  select c.order_id, c.buyer_user_id, c.track_id, x.license_snapshot->>'slug',
    e.checkout_session_id, e.payment_intent_id, e.amount_minor,
    e.currency, e.payment_mode, o.paid_at, e.id, e.processed_at
  from public.order_delivery_contracts c
  join commerce_private.contract_context x on x.contract_id = c.id
  join commerce_private.payment_events e on e.contract_id = c.id
  join commerce_private.order_states s on s.contract_id = c.id
  join public.orders o on o.id = c.order_id
  join public.user_profiles u on u.id = c.buyer_user_id
  where c.order_id = p_order_id
    and x.provider_account = p_provider_account and e.provider_account = p_provider_account
    and e.provider = 'stripe' and e.provider_event_id = p_provider_event_id
    and e.payment_state = 'PAID' and e.verification_method = 'stripe_signature'
    and e.event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded')
    and not e.livemode and e.payment_mode = 'test' and c.payment_mode = e.payment_mode
    and e.amount_minor = c.amount_minor and e.currency = c.currency and e.refunded_minor = 0
    and s.payment_received_event_id is not null
    and o.stripe_checkout_session_id = e.checkout_session_id and o.stripe_payment_intent_id = e.payment_intent_id
    and o.buyer_user_id = c.buyer_user_id and o.track_id = c.track_id and o.license_type_id = c.license_type_id
    and o.amount_cents = c.amount_minor and o.currency = c.currency
    and o.paid_at is not null and o.status in ('paid','fulfilled','refunded') and u.role = 'buyer'
    -- Gate D evidence must never count as an ordinary marketplace conversion.
    and not exists (select 1 from commerce_private.acceptance_grants g where g.order_id = c.order_id);
end;
$$;
revoke all on function public.get_analytics_verified_purchase(uuid,text,text) from public, anon, authenticated;
grant execute on function public.get_analytics_verified_purchase(uuid,text,text) to service_role;
commit;
