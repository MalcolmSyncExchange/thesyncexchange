-- Gate D / D1. Retained acceptance evidence and database-enforced guards only.
-- This migration creates no fixture, grant, order, artifact, or executable
-- application capability. All global commerce capabilities remain unchanged.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regnamespace('commerce_private') is null
     or to_regclass('commerce_private.capabilities') is null
     or to_regclass('commerce_private.asset_versions') is null
     or to_regclass('commerce_private.qa_fixture_designations') is null
     or to_regclass('commerce_private.payment_events') is null
     or to_regclass('commerce_private.fulfillment_jobs') is null
     or to_regclass('public.order_delivery_contracts') is null
     or to_regclass('public.order_asset_entitlements') is null
     or to_regclass('public.order_receipts') is null
     or to_regclass('public.artist_transaction_records') is null
     or to_regclass('auth.sessions') is null
     or to_regprocedure('commerce_private.can_deliver(uuid,uuid)') is null
     or to_regprocedure('commerce_private.require_service_role()') is null then
    raise exception 'Reviewed Phase 2A/2B and Supabase Auth prerequisites are missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'commerce_private' and table_name = 'capabilities'
      and column_name = 'payment_adapter_enabled'
  ) then
    raise exception 'Reviewed Phase 2B payment-adapter capability is missing';
  end if;

  if to_regclass('commerce_private.acceptance_grants') is not null
     or to_regclass('commerce_private.acceptance_grant_audit') is not null then
    raise exception 'Gate D acceptance schema already exists: reconcile the migration ledger, do not replay';
  end if;

  if not exists (
    select 1 from commerce_private.capabilities
    where singleton and not foundation_enabled and not asset_preparation_enabled
      and not receipt_generation_enabled and not entitlement_activation_enabled
      and not transaction_projection_enabled and not payment_adapter_enabled
  ) then
    raise exception 'Gate D installation requires all six commerce capabilities OFF';
  end if;
end
$$;

create table commerce_private.acceptance_grants (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete restrict
    check (buyer_user_id = '8ffc95e8-0e8f-428e-ac26-925d6bc98fcd'::uuid),
  buyer_session_id uuid,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  track_id uuid not null references public.tracks(id) on delete restrict,
  license_type_id uuid not null references public.license_types(id) on delete restrict,
  asset_version_id uuid not null references commerce_private.asset_versions(id) on delete restrict,
  amount_minor integer not null check (amount_minor > 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  provider text not null default 'stripe' check (provider = 'stripe'),
  provider_account text not null check (provider_account ~ '^acct_[A-Za-z0-9]{1,240}$'),
  deployment_target text not null default 'production' check (deployment_target = 'production'),
  release_mode text not null default 'production_beta' check (release_mode = 'production_beta'),
  payment_mode text not null default 'test' check (payment_mode = 'test'),
  attempt_id uuid unique,
  reservation_lease_token uuid,
  reservation_lease_epoch bigint not null default 0 check (reservation_lease_epoch >= 0),
  reservation_lease_until timestamptz,
  stripe_idempotency_key text unique
    check (stripe_idempotency_key is null or stripe_idempotency_key ~ '^[A-Za-z0-9:_-]{16,240}$'),
  stripe_parameters_sha256 text
    check (stripe_parameters_sha256 is null or stripe_parameters_sha256 ~ '^[a-f0-9]{64}$'),
  checkout_session_id text unique
    check (checkout_session_id is null or checkout_session_id ~ '^cs_test_[A-Za-z0-9]{1,240}$'),
  payment_intent_id text unique
    check (payment_intent_id is null or payment_intent_id ~ '^pi_[A-Za-z0-9]{1,240}$'),
  provider_expires_at timestamptz,
  verified_payment_event_id uuid unique references commerce_private.payment_events(id) on delete restrict,
  delivery_contract_id uuid unique references public.order_delivery_contracts(id) on delete restrict,
  entitlement_id uuid unique references public.order_asset_entitlements(id) on delete restrict,
  receipt_id uuid unique references public.order_receipts(id) on delete restrict,
  artist_transaction_record_id uuid unique references public.artist_transaction_records(id) on delete restrict,
  receipt_bucket_id text not null default 'order-receipts' check (receipt_bucket_id = 'order-receipts'),
  receipt_object_path text generated always as ('gate-d/' || id::text || '/receipt-v1.pdf') stored,
  receipt_object_id uuid unique references storage.objects(id) on delete restrict,
  receipt_object_version text,
  receipt_sha256 text check (receipt_sha256 is null or receipt_sha256 ~ '^[a-f0-9]{64}$'),
  receipt_byte_size bigint check (receipt_byte_size is null or receipt_byte_size between 1 and 1048576),
  receipt_sealed_at timestamptz,
  state text not null default 'available'
    check (state in ('available','reserved','checkout_bound','revocation_requested','paid_verified','consumed','expired','revoked')),
  security_hold_state text not null default 'none' check (security_hold_state in ('none','applied')),
  security_hold_reason text check (security_hold_reason is null or security_hold_reason ~ '^[a-z0-9_]{1,80}$'),
  security_hold_at timestamptz,
  provider_reconciliation_result text
    check (provider_reconciliation_result is null or provider_reconciliation_result in ('unpaid_expired','paid','session_absent')),
  provider_reconciled_at timestamptz,
  approval_reference text not null check (length(approval_reference) between 1 and 200),
  operator_reference text not null check (length(operator_reference) between 1 and 200),
  safe_error_code text check (safe_error_code is null or safe_error_code ~ '^[a-z0-9_]{1,80}$'),
  audit_sequence bigint not null default 1 check (audit_sequence >= 1),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 minutes'),
  reserved_at timestamptz,
  checkout_creation_requested_at timestamptz,
  checkout_bound_at timestamptz,
  revocation_requested_at timestamptz,
  payment_verified_at timestamptz,
  consumed_at timestamptz,
  expired_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  check (expires_at = created_at + interval '60 minutes'),
  check ((attempt_id is null) = (buyer_session_id is null)),
  check ((attempt_id is null) = (stripe_idempotency_key is null)),
  check ((reservation_lease_token is null) = (reservation_lease_until is null)),
  check ((attempt_id is null and reservation_lease_epoch = 0)
      or (attempt_id is not null and reservation_lease_epoch >= 1)),
  check ((checkout_session_id is null) = (checkout_bound_at is null)),
  check ((verified_payment_event_id is null and payment_intent_id is null and payment_verified_at is null)
      or (verified_payment_event_id is not null and payment_intent_id is not null and payment_verified_at is not null)),
  check ((security_hold_state = 'none' and security_hold_reason is null and security_hold_at is null)
      or (security_hold_state = 'applied' and security_hold_reason is not null and security_hold_at is not null)),
  check ((provider_reconciliation_result is null) = (provider_reconciled_at is null)),
  check ((receipt_object_id is null and receipt_object_version is null and receipt_sha256 is null
          and receipt_byte_size is null and receipt_sealed_at is null)
      or (receipt_object_id is not null and receipt_object_version is not null and receipt_sha256 is not null
          and receipt_byte_size is not null and receipt_sealed_at is not null)),
  check ((state = 'available' and attempt_id is null and reserved_at is null and checkout_session_id is null
          and verified_payment_event_id is null and delivery_contract_id is null and entitlement_id is null)
      or state <> 'available'),
  check ((state = 'reserved' and attempt_id is not null and reserved_at is not null
          and checkout_session_id is null and verified_payment_event_id is null)
      or state <> 'reserved'),
  check ((state = 'checkout_bound' and checkout_session_id is not null and provider_expires_at is not null
          and delivery_contract_id is not null and entitlement_id is not null and verified_payment_event_id is null)
      or state <> 'checkout_bound'),
  check ((state = 'revocation_requested' and attempt_id is not null and revocation_requested_at is not null
          and verified_payment_event_id is null and
          ((checkout_session_id is null and checkout_bound_at is null)
           or (checkout_session_id is not null and checkout_bound_at is not null and provider_expires_at is not null)))
      or state <> 'revocation_requested'),
  check ((state in ('paid_verified','consumed') and checkout_session_id is not null
          and delivery_contract_id is not null and entitlement_id is not null
          and verified_payment_event_id is not null and payment_intent_id is not null)
      or state not in ('paid_verified','consumed')),
  check ((state = 'consumed' and consumed_at is not null) or (state <> 'consumed' and consumed_at is null)),
  check ((state = 'expired' and expired_at is not null) or (state <> 'expired' and expired_at is null)),
  check ((state = 'revoked' and revoked_at is not null) or (state <> 'revoked' and revoked_at is null))
);

create unique index acceptance_grants_one_nonterminal
  on commerce_private.acceptance_grants ((1))
  where state in ('available','reserved','checkout_bound','revocation_requested','paid_verified');
create index acceptance_grants_checkout_lookup
  on commerce_private.acceptance_grants(checkout_session_id)
  where checkout_session_id is not null;
create index acceptance_grants_order_lookup on commerce_private.acceptance_grants(order_id);

create table commerce_private.acceptance_grant_audit (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid not null references commerce_private.acceptance_grants(id) on delete restrict,
  sequence bigint not null check (sequence > 0),
  event_type text not null check (event_type in (
    'grant_created','grant_reserved','reservation_recovered','checkout_creation_requested','checkout_bound',
    'checkout_binding_failed','payment_verified','terminal_payment_preserved','webhook_replayed',
    'webhook_conflict_rejected','jobs_created','job_started','job_completed','job_failed',
    'receipt_object_adopted','checkout_session_expired','revocation_requested',
    'provider_reconciliation_started','provider_reconciliation_completed','security_hold_applied',
    'grant_validation_failed','acceptance_invariant_failed','reconciliation_required',
    'acceptance_completed','grant_consumed','grant_expired','grant_revoked'
  )),
  actor_class text not null check (actor_class in ('database_owner','authenticated_buyer','service_worker','stripe_webhook','operator')),
  actor_user_id uuid references auth.users(id) on delete restrict,
  old_state text check (old_state is null or old_state in ('available','reserved','checkout_bound','revocation_requested','paid_verified','consumed','expired','revoked')),
  new_state text check (new_state is null or new_state in ('available','reserved','checkout_bound','revocation_requested','paid_verified','consumed','expired','revoked')),
  order_id uuid references public.orders(id) on delete restrict,
  checkout_session_id text check (checkout_session_id is null or checkout_session_id ~ '^cs_test_[A-Za-z0-9]{1,240}$'),
  payment_event_id uuid references commerce_private.payment_events(id) on delete restrict,
  job_id uuid references commerce_private.fulfillment_jobs(id) on delete restrict,
  safe_result_code text check (safe_result_code is null or safe_result_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz not null default now(),
  unique(grant_id,sequence)
);
create index acceptance_grant_audit_created on commerce_private.acceptance_grant_audit(grant_id,created_at);

create function commerce_private.guard_acceptance_grant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Gate D grants are retained' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    if new.audit_sequence <> 1 or new.state <> 'available' then
      raise exception 'Gate D grant must begin available with audit sequence one' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.id is distinct from old.id
     or new.buyer_user_id is distinct from old.buyer_user_id
     or new.order_id is distinct from old.order_id
     or new.seller_user_id is distinct from old.seller_user_id
     or new.track_id is distinct from old.track_id
     or new.license_type_id is distinct from old.license_type_id
     or new.asset_version_id is distinct from old.asset_version_id
     or new.amount_minor is distinct from old.amount_minor
     or new.currency is distinct from old.currency
     or new.provider is distinct from old.provider
     or new.provider_account is distinct from old.provider_account
     or new.deployment_target is distinct from old.deployment_target
     or new.release_mode is distinct from old.release_mode
     or new.payment_mode is distinct from old.payment_mode
     or new.approval_reference is distinct from old.approval_reference
     or new.operator_reference is distinct from old.operator_reference
     or new.created_at is distinct from old.created_at
     or new.expires_at is distinct from old.expires_at
     or new.receipt_bucket_id is distinct from old.receipt_bucket_id then
    raise exception 'Gate D immutable binding changed' using errcode = '23514';
  end if;

  if (old.buyer_session_id is not null and new.buyer_session_id is distinct from old.buyer_session_id)
     or (old.attempt_id is not null and new.attempt_id is distinct from old.attempt_id)
     or (old.stripe_idempotency_key is not null and new.stripe_idempotency_key is distinct from old.stripe_idempotency_key)
     or (old.stripe_parameters_sha256 is not null and new.stripe_parameters_sha256 is distinct from old.stripe_parameters_sha256)
     or (old.checkout_session_id is not null and new.checkout_session_id is distinct from old.checkout_session_id)
     or (old.payment_intent_id is not null and new.payment_intent_id is distinct from old.payment_intent_id)
     or (old.provider_expires_at is not null and new.provider_expires_at is distinct from old.provider_expires_at)
     or (old.verified_payment_event_id is not null and new.verified_payment_event_id is distinct from old.verified_payment_event_id)
     or (old.delivery_contract_id is not null and new.delivery_contract_id is distinct from old.delivery_contract_id)
     or (old.entitlement_id is not null and new.entitlement_id is distinct from old.entitlement_id)
     or (old.receipt_id is not null and new.receipt_id is distinct from old.receipt_id)
     or (old.artist_transaction_record_id is not null and new.artist_transaction_record_id is distinct from old.artist_transaction_record_id)
     or (old.receipt_object_id is not null and new.receipt_object_id is distinct from old.receipt_object_id)
     or (old.receipt_object_version is not null and new.receipt_object_version is distinct from old.receipt_object_version)
     or (old.receipt_sha256 is not null and new.receipt_sha256 is distinct from old.receipt_sha256)
     or (old.receipt_byte_size is not null and new.receipt_byte_size is distinct from old.receipt_byte_size)
     or (old.receipt_sealed_at is not null and new.receipt_sealed_at is distinct from old.receipt_sealed_at) then
    raise exception 'Gate D write-once evidence changed' using errcode = '23514';
  end if;

  if new.audit_sequence not in (old.audit_sequence, old.audit_sequence + 1) then
    raise exception 'Invalid Gate D audit sequence change' using errcode = '23514';
  end if;

  if not (
    new.state = old.state
    or (old.state = 'available' and new.state in ('reserved','expired','revoked'))
    or (old.state = 'reserved' and new.state in ('checkout_bound','revocation_requested','expired'))
    or (old.state = 'checkout_bound' and new.state in ('paid_verified','revocation_requested','expired'))
    or (old.state = 'revocation_requested' and new.state in ('revoked','paid_verified'))
    or (old.state = 'paid_verified' and new.state = 'consumed')
  ) then
    raise exception 'Illegal Gate D state transition' using errcode = '23514';
  end if;

  if old.state in ('reserved','checkout_bound') and new.state = 'expired'
     and (new.provider_reconciliation_result is distinct from 'unpaid_expired' or new.provider_reconciled_at is null) then
    raise exception 'Provider reconciliation required before Gate D expiry' using errcode = '23514';
  end if;
  if old.state = 'revocation_requested' and new.state = 'revoked'
     and (new.provider_reconciliation_result is distinct from 'unpaid_expired' or new.provider_reconciled_at is null) then
    raise exception 'Provider reconciliation required before Gate D revocation' using errcode = '23514';
  end if;
  if old.state = 'revocation_requested' and new.state = 'paid_verified'
     and new.security_hold_state <> 'applied' then
    raise exception 'Revocation-race payment requires a security hold' using errcode = '23514';
  end if;

  new.updated_at := now();
  return new;
end
$$;

create trigger guard_acceptance_grant
before insert or update or delete on commerce_private.acceptance_grants
for each row execute function commerce_private.guard_acceptance_grant();

create function commerce_private.audit_initial_acceptance_grant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into commerce_private.acceptance_grant_audit(
    grant_id,sequence,event_type,actor_class,old_state,new_state,order_id,safe_result_code
  ) values (
    new.id,1,'grant_created','database_owner',null,'available',new.order_id,'created'
  );
  return new;
end
$$;

create trigger audit_initial_acceptance_grant
after insert on commerce_private.acceptance_grants
for each row execute function commerce_private.audit_initial_acceptance_grant();

create function commerce_private.guard_acceptance_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  raise exception 'Gate D audit is append-only' using errcode = '23514';
end
$$;

create trigger immutable_acceptance_grant_audit
before update or delete on commerce_private.acceptance_grant_audit
for each row execute function commerce_private.guard_acceptance_audit();

create function commerce_private.guard_gate_d_receipt_storage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare referenced boolean;
begin
  select exists (
    select 1 from commerce_private.acceptance_grants g
    where g.receipt_bucket_id = old.bucket_id
      and g.receipt_object_path = old.name
      and g.receipt_id is not null
  ) into referenced;
  if referenced and (
    tg_op = 'DELETE'
    or new.id is distinct from old.id
    or new.bucket_id is distinct from old.bucket_id
    or new.name is distinct from old.name
    or new.version is distinct from old.version
    or new.metadata is distinct from old.metadata
  ) then
    raise exception 'Gate D receipt object is immutable' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create trigger guard_gate_d_receipt_storage
before update or delete on storage.objects
for each row execute function commerce_private.guard_gate_d_receipt_storage();

alter table commerce_private.acceptance_grants enable row level security;
alter table commerce_private.acceptance_grant_audit enable row level security;

revoke all on commerce_private.acceptance_grants,
  commerce_private.acceptance_grant_audit
from public,anon,authenticated,service_role;

revoke all on function commerce_private.guard_acceptance_grant(),
  commerce_private.audit_initial_acceptance_grant(),
  commerce_private.guard_acceptance_audit(),
  commerce_private.guard_gate_d_receipt_storage()
from public,anon,authenticated,service_role;

comment on table commerce_private.acceptance_grants is
  'Gate D single-use TEST acceptance authority. Retained, private, and never a global commerce capability.';
comment on table commerce_private.acceptance_grant_audit is
  'Typed append-only Gate D acceptance audit. Contains no bearer secret or unrestricted JSON.';

commit;
