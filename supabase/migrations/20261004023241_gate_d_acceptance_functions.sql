-- Gate D / D1. Exact-grant RPC boundary. No data seed and no capability change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regclass('commerce_private.acceptance_grants') is null
     or to_regclass('commerce_private.acceptance_grant_audit') is null
     or to_regprocedure('commerce_private.require_service_role()') is null then
    raise exception 'Gate D schema migration is missing';
  end if;
  if exists (
    select 1 from commerce_private.acceptance_grants
  ) then
    raise exception 'Gate D function installation requires zero acceptance grants';
  end if;
  if not exists (
    select 1 from commerce_private.capabilities
    where singleton and not foundation_enabled and not asset_preparation_enabled
      and not receipt_generation_enabled and not entitlement_activation_enabled
      and not transaction_projection_enabled and not payment_adapter_enabled
  ) then
    raise exception 'Gate D function installation requires all six commerce capabilities OFF';
  end if;
end
$$;

create function commerce_private.gate_d_require_capabilities_off() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from commerce_private.capabilities
    where singleton and not foundation_enabled and not asset_preparation_enabled
      and not receipt_generation_enabled and not entitlement_activation_enabled
      and not transaction_projection_enabled and not payment_adapter_enabled
  ) then
    raise exception 'Gate D requires all six commerce capabilities OFF' using errcode = '42501';
  end if;
end
$$;

create function commerce_private.gate_d_append_audit(
  p_grant uuid,
  p_event text,
  p_actor text,
  p_actor_user uuid,
  p_old_state text,
  p_new_state text,
  p_checkout_session text,
  p_payment_event uuid,
  p_job uuid,
  p_result text
) returns void
language plpgsql security definer set search_path = '' as $$
declare next_sequence bigint; resolved_order uuid;
begin
  if p_event not in (
    'grant_created','grant_reserved','reservation_recovered','checkout_creation_requested','checkout_bound',
    'checkout_binding_failed','payment_verified','terminal_payment_preserved','webhook_replayed',
    'payment_evidence_conflict',
    'webhook_conflict_rejected','jobs_created','job_started','job_completed','job_failed',
    'receipt_object_adopted','checkout_session_expired','revocation_requested',
    'provider_reconciliation_started','provider_reconciliation_completed','security_hold_applied',
    'grant_validation_failed','acceptance_invariant_failed','reconciliation_required',
    'acceptance_completed','grant_consumed','grant_expired','grant_revoked'
  ) or p_actor not in ('database_system','authenticated_buyer','stripe_webhook','service_worker','operator','reconciliation')
     or (p_result is not null and p_result !~ '^[a-z0-9_]{1,80}$') then
    raise exception 'Invalid Gate D audit input' using errcode = '22023';
  end if;
  update commerce_private.acceptance_grants
  set audit_sequence = audit_sequence + 1
  where id = p_grant
  returning audit_sequence,order_id into strict next_sequence,resolved_order;
  insert into commerce_private.acceptance_grant_audit(
    grant_id,sequence,event_type,actor_class,actor_user_id,old_state,new_state,
    order_id,checkout_session_id,payment_event_id,job_id,safe_result_code
  ) values (
    p_grant,next_sequence,p_event,p_actor,p_actor_user,p_old_state,p_new_state,
    resolved_order,p_checkout_session,p_payment_event,p_job,p_result
  );
end
$$;

create function commerce_private.gate_d_apply_hold_core(
  p_grant uuid,
  p_reason text,
  p_actor text
) returns void
language plpgsql security definer set search_path = '' as $$
declare g commerce_private.acceptance_grants; next_revision integer;
begin
  if p_reason !~ '^[a-z0-9_]{1,80}$'
     or p_actor not in ('stripe_webhook','service_worker','operator','reconciliation') then
    raise exception 'Invalid Gate D hold input' using errcode = '22023';
  end if;
  select * into strict g from commerce_private.acceptance_grants where id = p_grant for update;
  if g.security_hold_state = 'none' then
    update commerce_private.acceptance_grants
    set security_hold_state = 'applied', security_hold_reason = p_reason,
        security_hold_at = now(), safe_error_code = p_reason
    where id = g.id;
    if g.delivery_contract_id is not null then
      update commerce_private.order_states
      set state = 'SECURITY_HOLD', revision = revision + 1, updated_at = now()
      where contract_id = g.delivery_contract_id
      returning revision into next_revision;
      if next_revision is not null then
        insert into commerce_private.state_history(
          contract_id,state,reason_code,event_id,revision,refunded_minor
        )
        select g.delivery_contract_id,'SECURITY_HOLD',p_reason,event_id,next_revision,refunded_minor
        from commerce_private.order_states where contract_id = g.delivery_contract_id
        on conflict(contract_id,revision) do nothing;
      end if;
      update public.order_asset_entitlements
      set state = 'suspended', reason_code = p_reason, updated_at = now()
      where contract_id = g.delivery_contract_id and state not in ('suspended','revoked');
    end if;
    perform commerce_private.gate_d_append_audit(
      g.id,'security_hold_applied',p_actor,null,g.state,g.state,g.checkout_session_id,
      g.verified_payment_event_id,null,p_reason
    );
  elsif g.security_hold_reason is distinct from p_reason then
    raise exception 'Conflicting Gate D security hold' using errcode = '23514';
  end if;
end
$$;

create function public.gate_d_reserve_acceptance(p_order_id uuid)
returns table(
  result_code text,
  grant_id uuid,
  attempt_id uuid,
  lease_epoch bigint,
  checkout_session_id text,
  provider_expires_at timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare
  g commerce_private.acceptance_grants;
  o public.orders;
  claimed_session text;
  session_uuid uuid;
  new_attempt uuid;
begin
  result_code := 'unavailable';
  grant_id := null; attempt_id := null; lease_epoch := null;
  checkout_session_id := null; provider_expires_at := null;

  if auth.role() is distinct from 'authenticated'
     or auth.uid() is distinct from '8ffc95e8-0e8f-428e-ac26-925d6bc98fcd'::uuid
     or not exists (
       select 1 from public.user_profiles
       where id = auth.uid() and role = 'buyer'
     ) then
    return next; return;
  end if;

  claimed_session := auth.jwt() ->> 'session_id';
  if claimed_session is null
     or claimed_session !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' then
    return next; return;
  end if;
  session_uuid := claimed_session::uuid;
  if not exists (
    select 1 from auth.sessions
    where id = session_uuid and user_id = auth.uid()
  ) then
    return next; return;
  end if;

  select * into g
  from commerce_private.acceptance_grants
  where order_id = p_order_id and buyer_user_id = auth.uid()
  for update;
  if not found then return next; return; end if;

  grant_id := g.id; attempt_id := g.attempt_id;
  lease_epoch := g.reservation_lease_epoch;
  checkout_session_id := g.checkout_session_id;
  provider_expires_at := g.provider_expires_at;

  select * into o from public.orders where id = g.order_id for share;
  if not found
     or o.buyer_user_id is distinct from g.buyer_user_id
     or o.track_id is distinct from g.track_id
     or o.license_type_id is distinct from g.license_type_id
     or o.amount_cents is distinct from g.amount_minor
     or o.currency is distinct from g.currency
     or g.provider <> 'stripe'
     or g.deployment_target <> 'production'
     or g.release_mode <> 'production_beta'
     or g.payment_mode <> 'test'
     or not exists (
       select 1 from public.tracks t
       where t.id = g.track_id and t.artist_user_id = g.seller_user_id and t.status = 'approved'
     )
     or not exists (
       select 1 from public.track_license_options x
       join public.license_types l on l.id = x.license_type_id and l.active
       where x.track_id = g.track_id and x.license_type_id = g.license_type_id and x.active
         and coalesce(x.price_cents,l.default_price_cents) = g.amount_minor
     )
     or not exists (
       select 1 from commerce_private.asset_versions a
       join commerce_private.qa_fixture_designations q
         on q.asset_version_id = a.id and q.buyer_user_id = g.buyer_user_id and q.revoked_at is null
       where a.id = g.asset_version_id and a.track_id = g.track_id
         and a.state = 'ready' and a.approval_state = 'approved' and a.retired_at is null
         and a.object_id is not null and a.object_version is not null and a.sha256 is not null
     ) then
    perform commerce_private.gate_d_append_audit(
      g.id,'grant_validation_failed','authenticated_buyer',auth.uid(),g.state,g.state,
      g.checkout_session_id,g.verified_payment_event_id,null,'binding_mismatch'
    );
    result_code := 'unavailable'; return next; return;
  end if;

  if now() >= g.expires_at then
    if g.state = 'available' then
      update commerce_private.acceptance_grants
      set state = 'expired', expired_at = now(), safe_error_code = 'grant_expired'
      where id = g.id;
      perform commerce_private.gate_d_append_audit(
        g.id,'grant_expired','authenticated_buyer',auth.uid(),'available','expired',
        null,null,null,'grant_expired'
      );
    elsif g.state in ('reserved','checkout_bound','revocation_requested') then
      perform commerce_private.gate_d_append_audit(
        g.id,'reconciliation_required','authenticated_buyer',auth.uid(),g.state,g.state,
        g.checkout_session_id,g.verified_payment_event_id,null,'grant_expired_provider_reconciliation'
      );
    end if;
    result_code := 'unavailable'; return next; return;
  end if;

  if g.state = 'available' then
    if g.expires_at < now() + interval '35 minutes' then
      result_code := 'unavailable'; return next; return;
    end if;
    new_attempt := gen_random_uuid();
    update commerce_private.acceptance_grants
    set state = 'reserved',
        buyer_session_id = session_uuid,
        attempt_id = new_attempt,
        stripe_idempotency_key = 'gate-d:' || replace(g.id::text,'-','') || ':' || replace(new_attempt::text,'-',''),
        reservation_lease_token = gen_random_uuid(),
        reservation_lease_epoch = 1,
        reservation_lease_until = now() + interval '5 minutes',
        reserved_at = now(),
        safe_error_code = null
    where id = g.id;
    perform commerce_private.gate_d_append_audit(
      g.id,'grant_reserved','authenticated_buyer',auth.uid(),'available','reserved',
      null,null,null,'reserved'
    );
    select * into strict g from commerce_private.acceptance_grants where id = g.id;
    result_code := 'reserved';
  elsif g.buyer_session_id is distinct from session_uuid then
    result_code := 'unavailable';
  elsif g.state = 'reserved' and g.reservation_lease_until <= now() then
    update commerce_private.acceptance_grants
    set reservation_lease_token = gen_random_uuid(),
        reservation_lease_epoch = reservation_lease_epoch + 1,
        reservation_lease_until = least(now() + interval '5 minutes',expires_at),
        safe_error_code = null
    where id = g.id;
    perform commerce_private.gate_d_append_audit(
      g.id,'reservation_recovered','authenticated_buyer',auth.uid(),'reserved','reserved',
      null,null,null,'lease_recovered'
    );
    select * into strict g from commerce_private.acceptance_grants where id = g.id;
    result_code := 'reservation_recovered';
  elsif g.state = 'reserved' then
    result_code := 'checkout_creation_in_progress';
  elsif g.state = 'checkout_bound' then
    result_code := 'checkout_bound';
  elsif g.state in ('paid_verified','consumed') then
    result_code := 'acceptance_in_progress';
  else
    result_code := 'unavailable';
  end if;

  grant_id := g.id; attempt_id := g.attempt_id;
  lease_epoch := g.reservation_lease_epoch;
  checkout_session_id := g.checkout_session_id;
  provider_expires_at := g.provider_expires_at;
  return next;
end
$$;

create function public.gate_d_prepare_checkout(
  p_grant_id uuid,
  p_attempt_id uuid,
  p_expected_lease_epoch bigint,
  p_app_url text
)
returns table(
  grant_id uuid,
  attempt_id uuid,
  reservation_lease_token uuid,
  reservation_lease_epoch bigint,
  stripe_idempotency_key text,
  stripe_request_spec text,
  stripe_parameters_sha256 text,
  provider_expires_at timestamptz,
  order_id uuid,
  amount_minor integer,
  currency text,
  track_title text,
  track_slug text,
  license_name text
)
language plpgsql security definer set search_path = '' as $$
declare
  g commerce_private.acceptance_grants;
  o public.orders;
  t public.tracks;
  l public.license_types;
  resolved_contract uuid;
  resolved_entitlement uuid;
  rights jsonb;
  canonical_parameters text;
  first_request boolean;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_app_url is null or length(p_app_url) > 512
     or p_app_url !~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?$' then
    raise exception 'Invalid Gate D application URL' using errcode = '22023';
  end if;

  select * into strict g from commerce_private.acceptance_grants
  where id = p_grant_id for update;
  if g.attempt_id is distinct from p_attempt_id or g.state <> 'reserved'
     or g.buyer_session_id is null
     or not exists (
       select 1 from auth.sessions
       where id = g.buyer_session_id and user_id = g.buyer_user_id
     ) then
    raise exception 'Gate D reservation mismatch' using errcode = '42501';
  end if;
  if now() >= g.expires_at or g.expires_at < now() + interval '30 minutes' then
    raise exception 'Gate D grant lacks sufficient lifetime' using errcode = '42501';
  end if;
  if g.reservation_lease_epoch is distinct from p_expected_lease_epoch then
    raise exception 'Stale Gate D reservation epoch' using errcode = '40001';
  end if;
  if g.reservation_lease_until <= now() then
    update commerce_private.acceptance_grants
    set reservation_lease_token = gen_random_uuid(),
        reservation_lease_epoch = reservation_lease_epoch + 1,
        reservation_lease_until = least(now() + interval '5 minutes',expires_at)
    where id = g.id;
    perform commerce_private.gate_d_append_audit(
      g.id,'reservation_recovered','service_worker',null,'reserved','reserved',null,null,null,'lease_recovered'
    );
    select * into strict g from commerce_private.acceptance_grants where id = g.id;
  end if;

  select * into strict o from public.orders where id = g.order_id for update;
  select * into strict t from public.tracks where id = g.track_id for share;
  select * into strict l from public.license_types where id = g.license_type_id for share;
  if o.buyer_user_id <> g.buyer_user_id or o.track_id <> g.track_id
     or o.license_type_id <> g.license_type_id or o.amount_cents <> g.amount_minor
     or o.currency <> g.currency or o.status <> 'pending' or o.paid_at is not null
     or o.stripe_checkout_session_id is not null
     or t.artist_user_id <> g.seller_user_id or t.status <> 'approved'
     or not l.active
     or not exists (
       select 1 from public.track_license_options x
       where x.track_id = g.track_id and x.license_type_id = g.license_type_id and x.active
         and coalesce(x.price_cents,l.default_price_cents) = g.amount_minor
     )
     or not exists (
       select 1 from commerce_private.asset_versions a
       join commerce_private.qa_fixture_designations q
         on q.asset_version_id = a.id and q.buyer_user_id = g.buyer_user_id and q.revoked_at is null
       where a.id = g.asset_version_id and a.track_id = g.track_id
         and a.state = 'ready' and a.approval_state = 'approved' and a.retired_at is null
         and a.object_id is not null and a.object_version is not null and a.sha256 is not null
     ) then
    raise exception 'Gate D trusted checkout binding mismatch' using errcode = '42501';
  end if;

  resolved_contract := g.delivery_contract_id;
  if resolved_contract is null then
    select jsonb_agg(
      jsonb_build_object('id',id,'name',name,'email',email,'role',role_type,'ownershipPercent',ownership_percent)
      order by id
    ) into rights from public.rights_holders where track_id = g.track_id;
    if rights is null or (select sum(ownership_percent) from public.rights_holders where track_id = g.track_id) <> 100 then
      raise exception 'Gate D rights snapshot incomplete' using errcode = '42501';
    end if;
    insert into public.order_delivery_contracts(
      order_id,buyer_user_id,seller_user_id,track_id,license_type_id,track_title,license_name,
      amount_minor,currency,payment_mode,deployment_environment
    ) values (
      g.order_id,g.buyer_user_id,g.seller_user_id,g.track_id,g.license_type_id,t.title,l.name,
      g.amount_minor,g.currency,'test','production'
    ) returning id into resolved_contract;
    insert into commerce_private.contract_context(contract_id,provider_account,rights_snapshot,license_snapshot)
    values(resolved_contract,g.provider_account,rights,to_jsonb(l));
    insert into commerce_private.order_states(contract_id) values(resolved_contract);
  else
    if not exists (
      select 1 from public.order_delivery_contracts c
      join commerce_private.contract_context x on x.contract_id = c.id
      where c.id = resolved_contract and c.order_id = g.order_id and c.buyer_user_id = g.buyer_user_id
        and c.seller_user_id = g.seller_user_id and c.track_id = g.track_id
        and c.license_type_id = g.license_type_id and c.amount_minor = g.amount_minor
        and c.currency = g.currency and c.payment_mode = 'test'
        and c.deployment_environment = 'production' and not c.commercial_rights_granted
        and x.provider_account = g.provider_account
    ) then
      raise exception 'Gate D delivery contract mismatch' using errcode = '23514';
    end if;
  end if;

  resolved_entitlement := g.entitlement_id;
  if resolved_entitlement is null then
    insert into public.order_asset_entitlements(
      contract_id,order_id,buyer_user_id,asset_version_id,state,reason_code
    ) values (
      resolved_contract,g.order_id,g.buyer_user_id,g.asset_version_id,'pending','awaiting_gate_d_acceptance'
    ) returning id into resolved_entitlement;
  elsif not exists (
    select 1 from public.order_asset_entitlements n
    where n.id = resolved_entitlement and n.contract_id = resolved_contract and n.order_id = g.order_id
      and n.buyer_user_id = g.buyer_user_id and n.asset_version_id = g.asset_version_id
      and n.state = 'pending' and not n.commercial_rights_granted
  ) then
    raise exception 'Gate D pending entitlement mismatch' using errcode = '23514';
  end if;

  first_request := g.checkout_creation_requested_at is null;
  if g.provider_expires_at is null then
    g.provider_expires_at := date_trunc('second',now() + interval '30 minutes');
  end if;
  if g.provider_expires_at > g.expires_at then
    raise exception 'Gate D provider expiry exceeds grant lifetime' using errcode = '23514';
  end if;
  if t.slug !~ '^[A-Za-z0-9_-]{1,200}$' then
    raise exception 'Gate D track slug is not URL-safe' using errcode = '23514';
  end if;
  canonical_parameters :=
    '{"cancel_url":' || to_jsonb(
      p_app_url || '/buyer/checkout/' || t.slug ||
      '?error=Gate%20D%20TEST%20checkout%20was%20canceled.'
    )::text ||
    ',"client_reference_id":' || to_jsonb(g.order_id::text)::text ||
    ',"expires_at":' || extract(epoch from g.provider_expires_at)::bigint::text ||
    ',"line_items":[{"price_data":{"currency":' || to_jsonb(lower(g.currency))::text ||
    ',"product_data":{"description":' ||
      to_jsonb('The Sync Exchange production-beta TEST acceptance checkout.'::text)::text ||
    ',"name":' || to_jsonb(t.title || ' - ' || l.name)::text ||
    '},"unit_amount":' || g.amount_minor::text || '},"quantity":1}]' ||
    ',"mode":"payment","payment_method_types":["card"],"success_url":' ||
      to_jsonb(p_app_url || '/license-confirmation/' || g.order_id::text ||
        '?session_id={CHECKOUT_SESSION_ID}')::text || '}';
  if g.stripe_parameters_sha256 is null then
    g.stripe_parameters_sha256 := encode(public.digest(canonical_parameters,'sha256'),'hex');
  elsif g.stripe_request_spec is distinct from canonical_parameters
     or g.stripe_parameters_sha256 is distinct from encode(public.digest(canonical_parameters,'sha256'),'hex') then
    raise exception 'Gate D Stripe parameter digest mismatch' using errcode = '23514';
  end if;

  update commerce_private.acceptance_grants
  set delivery_contract_id = resolved_contract,
      entitlement_id = resolved_entitlement,
      provider_expires_at = g.provider_expires_at,
      stripe_request_spec = canonical_parameters,
      stripe_parameters_sha256 = g.stripe_parameters_sha256,
      checkout_creation_requested_at = coalesce(checkout_creation_requested_at,now())
  where id = g.id;
  if first_request then
    perform commerce_private.gate_d_append_audit(
      g.id,'checkout_creation_requested','service_worker',null,'reserved','reserved',
      null,null,null,'parameters_frozen'
    );
  end if;
  select * into strict g from commerce_private.acceptance_grants where id = g.id;

  return query select g.id,g.attempt_id,g.reservation_lease_token,g.reservation_lease_epoch,
    g.stripe_idempotency_key,g.stripe_request_spec,g.stripe_parameters_sha256,
    g.provider_expires_at,g.order_id,
    g.amount_minor,g.currency,t.title,t.slug,l.name;
end
$$;

create function public.gate_d_bind_checkout(
  p_grant_id uuid,
  p_attempt_id uuid,
  p_lease_token uuid,
  p_lease_epoch bigint,
  p_parameter_sha256 text,
  p_checkout_session_id text,
  p_provider_expires_at timestamptz
) returns text
language plpgsql security definer set search_path = '' as $$
declare g commerce_private.acceptance_grants; affected integer;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_checkout_session_id !~ '^cs_test_[A-Za-z0-9]{1,240}$'
     or p_parameter_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid Gate D provider binding' using errcode = '22023';
  end if;
  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  if g.state = 'checkout_bound' and g.attempt_id = p_attempt_id
     and g.checkout_session_id = p_checkout_session_id
     and g.provider_expires_at = p_provider_expires_at
     and g.stripe_parameters_sha256 = p_parameter_sha256 then
    return 'checkout_bound';
  end if;
  if g.state <> 'reserved' or g.attempt_id is distinct from p_attempt_id
     or g.reservation_lease_token is distinct from p_lease_token
     or g.reservation_lease_epoch is distinct from p_lease_epoch
     or g.reservation_lease_until <= now()
     or g.stripe_request_spec is null
     or g.stripe_parameters_sha256 is distinct from p_parameter_sha256
     or g.provider_expires_at is distinct from p_provider_expires_at
     or g.delivery_contract_id is null or g.entitlement_id is null then
    raise exception 'Stale or mismatched Gate D checkout binding' using errcode = '40001';
  end if;
  update public.orders
  set stripe_checkout_session_id = p_checkout_session_id,
      checkout_created_at = coalesce(checkout_created_at,now())
  where id = g.order_id and buyer_user_id = g.buyer_user_id and status = 'pending'
    and paid_at is null and stripe_checkout_session_id is null;
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Gate D order binding failed' using errcode = '23514';
  end if;
  update commerce_private.acceptance_grants
  set state = 'checkout_bound', checkout_session_id = p_checkout_session_id,
      checkout_bound_at = now(), reservation_lease_token = null,
      reservation_lease_until = null, safe_error_code = null
  where id = g.id;
  perform commerce_private.gate_d_append_audit(
    g.id,'checkout_bound','service_worker',null,'reserved','checkout_bound',
    p_checkout_session_id,null,null,'bound'
  );
  return 'checkout_bound';
end
$$;

create function public.gate_d_record_checkout_failure(
  p_grant_id uuid,
  p_attempt_id uuid,
  p_lease_token uuid,
  p_lease_epoch bigint,
  p_error_code text,
  p_requires_reconciliation boolean
) returns text
language plpgsql security definer set search_path = '' as $$
declare g commerce_private.acceptance_grants;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_error_code not in ('provider_timeout','database_binding_failed','parameter_drift','idempotency_window_uncertain','provider_mismatch') then
    raise exception 'Invalid Gate D checkout failure code' using errcode = '22023';
  end if;
  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  if g.state = 'checkout_bound' then return 'checkout_bound'; end if;
  if g.state <> 'reserved' or g.attempt_id is distinct from p_attempt_id
     or g.reservation_lease_token is distinct from p_lease_token
     or g.reservation_lease_epoch is distinct from p_lease_epoch then
    raise exception 'Stale Gate D checkout failure report' using errcode = '40001';
  end if;
  if p_requires_reconciliation then
    update commerce_private.acceptance_grants
    set state = 'revocation_requested', revocation_requested_at = now(),
        reservation_lease_token = null, reservation_lease_until = null,
        safe_error_code = p_error_code
    where id = g.id;
    perform commerce_private.gate_d_append_audit(
      g.id,'checkout_binding_failed','service_worker',null,'reserved','revocation_requested',
      null,null,null,p_error_code
    );
    perform commerce_private.gate_d_append_audit(
      g.id,'reconciliation_required','service_worker',null,'revocation_requested','revocation_requested',
      null,null,null,p_error_code
    );
    return 'reconciliation_required';
  end if;
  update commerce_private.acceptance_grants set safe_error_code = p_error_code where id = g.id;
  perform commerce_private.gate_d_append_audit(
    g.id,'checkout_binding_failed','service_worker',null,'reserved','reserved',
    null,null,null,p_error_code
  );
  return 'retry_same_attempt';
end
$$;

create function public.gate_d_route_webhook(
  p_checkout_session_id text,
  p_order_hint uuid,
  p_provider_account text,
  p_livemode boolean,
  p_connect_account text
)
returns table(route_code text,grant_id uuid,order_id uuid,grant_state text)
language plpgsql security definer set search_path = '' as $$
declare g commerce_private.acceptance_grants;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_connect_account is not null then
    raise exception 'Gate D rejects Stripe Connect webhook context' using errcode = '42501';
  end if;
  if p_checkout_session_id is null
     or p_checkout_session_id !~ '^cs_test_[A-Za-z0-9]{1,240}$'
     or length(p_checkout_session_id) > 255
     or p_provider_account !~ '^acct_[A-Za-z0-9]{1,240}$' then
    raise exception 'Invalid Gate D webhook routing identity' using errcode = '22023';
  end if;

  select * into g from commerce_private.acceptance_grants as ag
  where ag.checkout_session_id = p_checkout_session_id for update;
  if found then
    if p_livemode or g.provider_account is distinct from p_provider_account
       or g.payment_mode <> 'test' then
      perform commerce_private.gate_d_append_audit(
        g.id,'webhook_conflict_rejected','stripe_webhook',null,g.state,g.state,
        p_checkout_session_id,g.verified_payment_event_id,null,'provider_context_mismatch'
      );
      return query select 'conflict'::text,g.id,g.order_id,g.state; return;
    end if;
    return query select 'gate_d'::text,g.id,g.order_id,g.state; return;
  end if;

  if p_order_hint is not null then
    select * into g from commerce_private.acceptance_grants as ag
    where ag.order_id = p_order_hint for update;
    if found then
      perform commerce_private.gate_d_append_audit(
        g.id,'webhook_conflict_rejected','stripe_webhook',null,g.state,g.state,
        null,g.verified_payment_event_id,null,'unbound_gate_d_order'
      );
      return query select 'conflict'::text,g.id,g.order_id,g.state; return;
    end if;
  end if;
  return query select 'ordinary'::text,null::uuid,null::uuid,null::text;
end
$$;

create function public.gate_d_record_verified_payment(
  p_grant_id uuid,
  p_provider_event_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_event_type text,
  p_amount_minor integer,
  p_currency text,
  p_evidence_sha256 text,
  p_provider_created_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  g commerce_private.acceptance_grants;
  o public.orders;
  s commerce_private.order_states;
  existing commerce_private.payment_events;
  result uuid;
  next_revision integer;
  terminal_late boolean;
  race_hold boolean;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_provider_event_id !~ '^evt_[A-Za-z0-9]{1,240}$'
     or p_checkout_session_id !~ '^cs_test_[A-Za-z0-9]{1,240}$'
     or p_payment_intent_id !~ '^pi_[A-Za-z0-9]{1,240}$'
     or p_event_type not in ('checkout.session.completed','checkout.session.async_payment_succeeded')
     or p_amount_minor <= 0 or upper(p_currency) !~ '^[A-Z]{3}$'
     or p_evidence_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid Gate D payment evidence' using errcode = '22023';
  end if;

  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  if g.checkout_session_id is distinct from p_checkout_session_id
     or g.amount_minor is distinct from p_amount_minor
     or g.currency is distinct from upper(p_currency)
     or g.delivery_contract_id is null or g.entitlement_id is null
     or g.state not in ('checkout_bound','revocation_requested','paid_verified','consumed','expired','revoked') then
    raise exception 'Gate D payment/grant mismatch' using errcode = '42501';
  end if;

  if g.verified_payment_event_id is not null then
    select * into existing from commerce_private.payment_events where id = g.verified_payment_event_id;
    if found and existing.provider = 'stripe'
       and existing.provider_account = g.provider_account
       and existing.provider_event_id = p_provider_event_id
       and existing.payment_mode = 'test'
       and not existing.livemode
       and existing.contract_id = g.delivery_contract_id
       and existing.checkout_session_id = p_checkout_session_id
       and existing.payment_intent_id = p_payment_intent_id
       and existing.event_type = p_event_type
       and existing.payment_state = 'PAID'
       and existing.amount_minor = p_amount_minor
       and existing.refunded_minor = 0
       and existing.currency = upper(p_currency)
       and existing.evidence_sha256 = p_evidence_sha256
       and existing.verification_method = 'stripe_signature'
       and existing.provider_created_at = p_provider_created_at then
      perform commerce_private.gate_d_append_audit(
        g.id,'webhook_replayed','stripe_webhook',null,g.state,g.state,
        p_checkout_session_id,existing.id,null,'idempotent_replay'
      );
      return existing.id;
    end if;
    if g.security_hold_state = 'none' then
      perform commerce_private.gate_d_apply_hold_core(g.id,'payment_evidence_conflict','stripe_webhook');
    end if;
    perform commerce_private.gate_d_append_audit(
      g.id,'payment_evidence_conflict','stripe_webhook',null,g.state,g.state,
      p_checkout_session_id,g.verified_payment_event_id,null,'different_provider_event_tuple'
    );
    return g.verified_payment_event_id;
  end if;

  select * into strict o from public.orders where id = g.order_id for share;
  if o.buyer_user_id <> g.buyer_user_id or o.track_id <> g.track_id
     or o.license_type_id <> g.license_type_id or o.amount_cents <> g.amount_minor
     or o.currency <> g.currency or o.stripe_checkout_session_id <> p_checkout_session_id
     or o.stripe_payment_intent_id <> p_payment_intent_id
     or o.status not in ('paid','fulfilled') or o.paid_at is null
     or not exists (
       select 1 from public.generated_licenses x
       where x.order_id = g.order_id and x.buyer_id = g.buyer_user_id
         and x.track_id = g.track_id and x.license_type_id = g.license_type_id
         and x.status = 'generated' and x.pdf_storage_path is not null
         and x.terms_snapshot_json->'payment'->>'paymentMode' = 'test'
         and x.terms_snapshot_json->'payment'->>'commercialRightsGranted' = 'false'
         and x.terms_snapshot_json->'license'->>'pricePaidCents' = g.amount_minor::text
         and x.terms_snapshot_json->'license'->>'currency' = g.currency
     )
     or not exists (
       select 1 from public.order_delivery_contracts c
       join commerce_private.contract_context x on x.contract_id = c.id
       where c.id = g.delivery_contract_id and c.order_id = g.order_id
         and c.buyer_user_id = g.buyer_user_id and c.seller_user_id = g.seller_user_id
         and c.track_id = g.track_id and c.license_type_id = g.license_type_id
         and c.amount_minor = g.amount_minor and c.currency = g.currency
         and c.payment_mode = 'test' and not c.commercial_rights_granted
         and x.provider_account = g.provider_account
     ) then
    raise exception 'Gate D fulfilled-order evidence mismatch' using errcode = '42501';
  end if;

  select * into existing from commerce_private.payment_events
  where provider = 'stripe' and provider_account = g.provider_account
    and payment_mode = 'test' and provider_event_id = p_provider_event_id;
  if found then
    if existing.contract_id = g.delivery_contract_id
       and existing.checkout_session_id = p_checkout_session_id
       and existing.payment_intent_id = p_payment_intent_id
       and existing.event_type = p_event_type and existing.payment_state = 'PAID'
       and existing.amount_minor = p_amount_minor and existing.refunded_minor = 0
       and existing.currency = upper(p_currency) and existing.evidence_sha256 = p_evidence_sha256
       and existing.provider_created_at = p_provider_created_at then
      result := existing.id;
    else
      raise exception 'Conflicting duplicate Gate D payment evidence' using errcode = '23514';
    end if;
  else
    insert into commerce_private.payment_events(
      provider,provider_account,provider_event_id,payment_mode,livemode,contract_id,
      checkout_session_id,payment_intent_id,event_type,payment_state,amount_minor,refunded_minor,
      currency,evidence_sha256,verification_method,provider_created_at
    ) values (
      'stripe',g.provider_account,p_provider_event_id,'test',false,g.delivery_contract_id,
      p_checkout_session_id,p_payment_intent_id,p_event_type,'PAID',p_amount_minor,0,
      upper(p_currency),p_evidence_sha256,'stripe_signature',p_provider_created_at
    ) returning id into result;
  end if;

  terminal_late := g.state in ('expired','revoked');
  race_hold := g.state = 'revocation_requested';
  if terminal_late or race_hold then
    update commerce_private.acceptance_grants
    set state = case when race_hold then 'paid_verified' else state end,
        payment_intent_id = p_payment_intent_id,
        verified_payment_event_id = result,
        payment_verified_at = now(),
        security_hold_state = 'applied',
        security_hold_reason = case when terminal_late then 'terminal_late_payment' else 'revocation_payment_race' end,
        security_hold_at = now(),
        provider_reconciliation_result = 'paid',
        provider_reconciled_at = now(),
        safe_error_code = case when terminal_late then 'terminal_late_payment' else 'revocation_payment_race' end
    where id = g.id;
    select * into strict s from commerce_private.order_states where contract_id = g.delivery_contract_id for update;
    next_revision := s.revision + 1;
    update commerce_private.order_states
    set state = 'SECURITY_HOLD',event_id = result,
        payment_received_event_id = coalesce(payment_received_event_id,result),
        revision = next_revision,updated_at = now()
    where contract_id = g.delivery_contract_id;
    insert into commerce_private.state_history(contract_id,state,reason_code,event_id,revision,refunded_minor)
    values(g.delivery_contract_id,'SECURITY_HOLD',
      case when terminal_late then 'terminal_late_payment' else 'revocation_payment_race' end,
      result,next_revision,s.refunded_minor);
    update public.order_asset_entitlements
    set state = 'suspended',
        reason_code = case when terminal_late then 'terminal_late_payment' else 'revocation_payment_race' end,
        updated_at = now()
    where id = g.entitlement_id and state <> 'revoked';
    perform commerce_private.gate_d_append_audit(
      g.id,case when terminal_late then 'terminal_payment_preserved' else 'payment_verified' end,
      'stripe_webhook',null,g.state,case when race_hold then 'paid_verified' else g.state end,
      p_checkout_session_id,result,null,
      case when terminal_late then 'terminal_late_payment' else 'revocation_payment_race' end
    );
    perform commerce_private.gate_d_append_audit(
      g.id,'security_hold_applied','stripe_webhook',null,
      case when race_hold then 'paid_verified' else g.state end,
      case when race_hold then 'paid_verified' else g.state end,
      p_checkout_session_id,result,null,
      case when terminal_late then 'terminal_late_payment' else 'revocation_payment_race' end
    );
    return result;
  end if;

  select * into strict s from commerce_private.order_states where contract_id = g.delivery_contract_id for update;
  if s.state <> 'PENDING' then
    raise exception 'Gate D order-state mismatch before payment' using errcode = '23514';
  end if;
  next_revision := s.revision + 1;
  update commerce_private.order_states
  set state = 'PAID',event_id = result,payment_received_event_id = result,
      revision = next_revision,updated_at = now()
  where contract_id = g.delivery_contract_id;
  insert into commerce_private.state_history(contract_id,state,reason_code,event_id,revision,refunded_minor)
  values(g.delivery_contract_id,'PAID','verified_gate_d_payment',result,next_revision,0);
  insert into commerce_private.fulfillment_jobs(contract_id,task,revision,event_id)
  select g.delivery_contract_id,task,next_revision,result
  from unnest(array['asset_preparation','receipt_generation','transaction_projection','entitlement_activation']) task;
  update commerce_private.acceptance_grants
  set state = 'paid_verified',payment_intent_id = p_payment_intent_id,
      verified_payment_event_id = result,payment_verified_at = now(),safe_error_code = null
  where id = g.id;
  perform commerce_private.gate_d_append_audit(
    g.id,'payment_verified','stripe_webhook',null,'checkout_bound','paid_verified',
    p_checkout_session_id,result,null,'verified'
  );
  perform commerce_private.gate_d_append_audit(
    g.id,'jobs_created','stripe_webhook',null,'paid_verified','paid_verified',
    p_checkout_session_id,result,null,'four_jobs_created'
  );
  return result;
end
$$;

create function public.gate_d_request_revocation(
  p_grant_id uuid,
  p_reason text
) returns text
language plpgsql security definer set search_path = '' as $$
declare g commerce_private.acceptance_grants; audit_actor text;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_reason not in ('operator_requested','payment_failed','provider_uncertain','checkout_abandoned') then
    raise exception 'Invalid Gate D revocation reason' using errcode = '22023';
  end if;
  audit_actor := case p_reason
    when 'payment_failed' then 'stripe_webhook'
    when 'operator_requested' then 'operator'
    when 'provider_uncertain' then 'reconciliation'
    else 'service_worker'
  end;
  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  if g.state = 'revocation_requested' then return 'revocation_requested'; end if;
  if g.state not in ('reserved','checkout_bound') then
    raise exception 'Gate D grant cannot request revocation' using errcode = '23514';
  end if;
  update commerce_private.acceptance_grants
  set state = 'revocation_requested',revocation_requested_at = now(),
      reservation_lease_token = null,reservation_lease_until = null,safe_error_code = p_reason
  where id = g.id;
  perform commerce_private.gate_d_append_audit(
    g.id,'revocation_requested',audit_actor,null,g.state,'revocation_requested',
    g.checkout_session_id,g.verified_payment_event_id,null,p_reason
  );
  return 'revocation_requested';
end
$$;

create function public.gate_d_reconcile_revocation(
  p_grant_id uuid,
  p_checkout_session_id text,
  p_result text
) returns text
language plpgsql security definer set search_path = '' as $$
declare g commerce_private.acceptance_grants; target_state text;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_result not in ('unpaid_expired','session_absent','paid') then
    raise exception 'Invalid Gate D provider reconciliation result' using errcode = '22023';
  end if;
  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  if g.state not in ('reserved','checkout_bound','revocation_requested') then
    return g.state;
  end if;
  if g.checkout_session_id is not null and g.checkout_session_id is distinct from p_checkout_session_id then
    raise exception 'Gate D provider reconciliation Session mismatch' using errcode = '42501';
  end if;
  if g.checkout_session_id is null and p_checkout_session_id is not null then
    raise exception 'Unbound Gate D Session requires binding recovery, not reconciliation' using errcode = '42501';
  end if;
  perform commerce_private.gate_d_append_audit(
    g.id,'provider_reconciliation_started','reconciliation',null,g.state,g.state,
    g.checkout_session_id,g.verified_payment_event_id,null,p_result
  );
  if p_result = 'paid' then
    update commerce_private.acceptance_grants
    set safe_error_code = 'verified_payment_required',
        provider_reconciliation_result = 'paid',provider_reconciled_at = now()
    where id = g.id;
    perform commerce_private.gate_d_append_audit(
      g.id,'reconciliation_required','reconciliation',null,g.state,g.state,
      g.checkout_session_id,g.verified_payment_event_id,null,'verified_payment_required'
    );
    return 'verified_payment_required';
  end if;
  if p_result = 'session_absent' then
    update commerce_private.acceptance_grants
    set safe_error_code = 'session_absence_requires_review',
        provider_reconciliation_result = 'session_absent',provider_reconciled_at = now()
    where id = g.id;
    perform commerce_private.gate_d_append_audit(
      g.id,'reconciliation_required','reconciliation',null,g.state,g.state,
      null,null,null,'session_absence_requires_review'
    );
    return 'reconciliation_required';
  end if;
  target_state := case when g.state = 'revocation_requested' then 'revoked' else 'expired' end;
  update commerce_private.acceptance_grants
  set state = target_state,
      provider_reconciliation_result = 'unpaid_expired',
      provider_reconciled_at = now(),
      expired_at = case when target_state = 'expired' then now() else expired_at end,
      revoked_at = case when target_state = 'revoked' then now() else revoked_at end,
      reservation_lease_token = null,reservation_lease_until = null,
      safe_error_code = p_result
  where id = g.id;
  perform commerce_private.gate_d_append_audit(
    g.id,'provider_reconciliation_completed','reconciliation',null,g.state,target_state,
    g.checkout_session_id,null,null,p_result
  );
  perform commerce_private.gate_d_append_audit(
    g.id,case when target_state = 'revoked' then 'grant_revoked' else 'grant_expired' end,
    'reconciliation',null,target_state,target_state,g.checkout_session_id,null,null,p_result
  );
  return target_state;
end
$$;

create function public.gate_d_apply_security_hold(
  p_grant_id uuid,
  p_reason text
) returns text
language plpgsql security definer set search_path = '' as $$
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  perform commerce_private.gate_d_apply_hold_core(p_grant_id,p_reason,'service_worker');
  return 'security_hold_applied';
end
$$;

create function public.gate_d_claim_job(
  p_grant_id uuid,
  p_task text
)
returns table(
  job_id uuid,
  contract_id uuid,
  task text,
  revision integer,
  event_id uuid,
  lease_token uuid,
  lease_until timestamptz
)
language plpgsql security definer set search_path = '' as $$
declare g commerce_private.acceptance_grants; j commerce_private.fulfillment_jobs;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_task not in ('asset_preparation','receipt_generation','transaction_projection') then
    raise exception 'Gate D task is not claimable' using errcode = '42501';
  end if;
  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  if g.state <> 'paid_verified' or g.security_hold_state <> 'none'
     or g.delivery_contract_id is null or g.verified_payment_event_id is null then
    raise exception 'Gate D grant is not job-claimable' using errcode = '42501';
  end if;

  update commerce_private.fulfillment_jobs as f
  set state = 'failed',retryable = false,lease_token = null,lease_until = null,error_code = 'attempts_exhausted'
  where f.contract_id = g.delivery_contract_id and f.event_id = g.verified_payment_event_id
    and f.task = p_task and f.state = 'processing' and f.lease_until < now() and f.attempts >= 5;

  select * into j from commerce_private.fulfillment_jobs as f
  where f.contract_id = g.delivery_contract_id and f.event_id = g.verified_payment_event_id
    and f.task = p_task and f.attempts < 5 and f.available_at <= now()
    and (f.state = 'pending' or (f.state = 'failed' and f.retryable)
      or (f.state = 'processing' and f.lease_until < now()))
  order by f.available_at,f.id for update skip locked limit 1;
  if not found then return; end if;

  update commerce_private.fulfillment_jobs as f
  set state = 'processing',attempts = f.attempts + 1,lease_token = gen_random_uuid(),
      lease_until = now() + interval '5 minutes',error_code = null
  where f.id = j.id returning * into j;
  perform commerce_private.gate_d_append_audit(
    g.id,'job_started','service_worker',null,g.state,g.state,g.checkout_session_id,
    g.verified_payment_event_id,j.id,p_task
  );
  return query select j.id,j.contract_id,j.task,j.revision,j.event_id,j.lease_token,j.lease_until;
end
$$;

create function public.gate_d_prepare_receipt(
  p_grant_id uuid,
  p_job_id uuid,
  p_lease_token uuid
)
returns table(
  receipt_id uuid,
  object_path text,
  order_id uuid,
  payment_date timestamptz,
  track_title text,
  license_name text,
  amount_minor integer,
  currency text,
  payment_intent_id text
)
language plpgsql security definer set search_path = '' as $$
declare
  g commerce_private.acceptance_grants;
  j commerce_private.fulfillment_jobs;
  c public.order_delivery_contracts;
  e commerce_private.payment_events;
  resolved_receipt uuid;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  select * into strict j from commerce_private.fulfillment_jobs where id = p_job_id for update;
  if g.state <> 'paid_verified' or g.security_hold_state <> 'none'
     or j.contract_id <> g.delivery_contract_id or j.event_id <> g.verified_payment_event_id
     or j.task <> 'receipt_generation' or j.state <> 'processing'
     or j.lease_token is distinct from p_lease_token or j.lease_until <= now() then
    raise exception 'Gate D receipt lease mismatch' using errcode = '40001';
  end if;
  select * into strict c from public.order_delivery_contracts where id = g.delivery_contract_id;
  select * into strict e from commerce_private.payment_events where id = g.verified_payment_event_id;
  if e.payment_state <> 'PAID' or e.payment_intent_id <> g.payment_intent_id then
    raise exception 'Gate D receipt payment mismatch' using errcode = '23514';
  end if;
  resolved_receipt := g.receipt_id;
  if resolved_receipt is null then
    insert into public.order_receipts(
      contract_id,order_id,buyer_user_id,revision,document_kind,track_title,license_name,
      amount_minor,refunded_minor,currency,payment_mode,commercial_rights_granted,
      payment_state,payment_date,state
    ) values (
      c.id,c.order_id,c.buyer_user_id,j.revision,'test_receipt',c.track_title,c.license_name,
      c.amount_minor,0,c.currency,'test',false,'PAID',e.provider_created_at,'pending'
    ) returning id into resolved_receipt;
    update commerce_private.acceptance_grants set receipt_id = resolved_receipt where id = g.id;
  elsif not exists (
    select 1 from public.order_receipts r
    where r.id = resolved_receipt and r.contract_id = c.id and r.order_id = c.order_id
      and r.buyer_user_id = c.buyer_user_id and r.revision = j.revision
      and r.document_kind = 'test_receipt' and r.payment_mode = 'test'
      and not r.commercial_rights_granted and r.amount_minor = c.amount_minor
      and r.currency = c.currency and r.payment_state = 'PAID'
  ) then
    raise exception 'Gate D receipt snapshot mismatch' using errcode = '23514';
  end if;
  return query select resolved_receipt,g.receipt_object_path,c.order_id,e.provider_created_at,
    c.track_title,c.license_name,c.amount_minor,c.currency,e.payment_intent_id;
end
$$;

create function public.gate_d_seal_receipt(
  p_grant_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_sha256 text,
  p_byte_size bigint,
  p_mime_type text,
  p_adopted boolean
)
returns table(object_id uuid,object_version text)
language plpgsql security definer set search_path = '' as $$
declare
  g commerce_private.acceptance_grants;
  j commerce_private.fulfillment_jobs;
  o storage.objects;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_sha256 !~ '^[a-f0-9]{64}$' or p_byte_size not between 1 and 1048576
     or p_mime_type <> 'application/pdf' then
    raise exception 'Invalid Gate D receipt evidence' using errcode = '22023';
  end if;
  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  select * into strict j from commerce_private.fulfillment_jobs where id = p_job_id for update;
  if g.state <> 'paid_verified' or g.security_hold_state <> 'none' or g.receipt_id is null
     or j.contract_id <> g.delivery_contract_id or j.event_id <> g.verified_payment_event_id
     or j.task <> 'receipt_generation' or j.state <> 'processing'
     or j.lease_token is distinct from p_lease_token or j.lease_until <= now() then
    raise exception 'Gate D receipt sealing lease mismatch' using errcode = '40001';
  end if;
  select * into strict o from storage.objects
  where bucket_id = g.receipt_bucket_id and name = g.receipt_object_path for share;
  if o.version is null
     or (o.metadata->>'size')::bigint is distinct from p_byte_size
     or o.metadata->>'mimetype' is distinct from p_mime_type then
    raise exception 'Gate D receipt Storage metadata mismatch' using errcode = '23514';
  end if;
  if g.receipt_object_id is not null then
    if g.receipt_object_id = o.id and g.receipt_object_version = o.version
       and g.receipt_sha256 = p_sha256 and g.receipt_byte_size = p_byte_size then
      return query select o.id,o.version; return;
    end if;
    raise exception 'Gate D sealed receipt mismatch' using errcode = '23514';
  end if;
  update commerce_private.acceptance_grants
  set receipt_object_id = o.id,receipt_object_version = o.version,
      receipt_sha256 = p_sha256,receipt_byte_size = p_byte_size,receipt_sealed_at = now()
  where id = g.id;
  update public.order_receipts set state = 'ready'
  where id = g.receipt_id and state = 'pending';
  if p_adopted then
    perform commerce_private.gate_d_append_audit(
      g.id,'receipt_object_adopted','service_worker',null,g.state,g.state,
      g.checkout_session_id,g.verified_payment_event_id,j.id,'exact_hash_match'
    );
  end if;
  return query select o.id,o.version;
end
$$;

create function public.gate_d_finish_job(
  p_grant_id uuid,
  p_job_id uuid,
  p_lease_token uuid,
  p_success boolean,
  p_retryable boolean default false,
  p_error_code text default null
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  g commerce_private.acceptance_grants;
  j commerce_private.fulfillment_jobs;
  transaction_id uuid;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  if p_error_code is not null and p_error_code !~ '^[a-z0-9_]{1,80}$' then
    raise exception 'Invalid Gate D job error code' using errcode = '22023';
  end if;
  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  select * into strict j from commerce_private.fulfillment_jobs where id = p_job_id for update;
  if j.contract_id <> g.delivery_contract_id or j.event_id <> g.verified_payment_event_id
     or j.task not in ('asset_preparation','receipt_generation','transaction_projection') then
    raise exception 'Gate D job/grant mismatch' using errcode = '42501';
  end if;
  if j.state = 'complete' and p_success then return 'complete'; end if;
  if g.state <> 'paid_verified' or g.security_hold_state <> 'none'
     or j.state <> 'processing' or j.lease_token is distinct from p_lease_token
     or j.lease_until <= now() then
    raise exception 'Stale Gate D job lease' using errcode = '40001';
  end if;

  if p_success and j.task = 'asset_preparation' then
    if not exists (
      select 1 from commerce_private.asset_versions a
      join commerce_private.qa_fixture_designations q
        on q.asset_version_id = a.id and q.buyer_user_id = g.buyer_user_id and q.revoked_at is null
      join public.order_asset_entitlements n
        on n.id = g.entitlement_id and n.asset_version_id = a.id and n.contract_id = g.delivery_contract_id
      where a.id = g.asset_version_id and a.track_id = g.track_id
        and a.state = 'ready' and a.approval_state = 'approved' and a.retired_at is null
        and a.object_id is not null and a.object_version is not null and a.sha256 is not null
        and n.state = 'pending' and not n.commercial_rights_granted
    ) then
      raise exception 'Gate D asset preparation invariant failed' using errcode = '23514';
    end if;
  elsif p_success and j.task = 'receipt_generation' then
    if g.receipt_id is null or g.receipt_object_id is null or g.receipt_object_version is null
       or g.receipt_sha256 is null or g.receipt_byte_size is null
       or not exists (
         select 1 from public.order_receipts
         where id = g.receipt_id and contract_id = g.delivery_contract_id
           and revision = j.revision and state = 'ready'
           and document_kind = 'test_receipt' and payment_mode = 'test'
           and not commercial_rights_granted
       ) then
      raise exception 'Gate D receipt completion invariant failed' using errcode = '23514';
    end if;
  elsif p_success and j.task = 'transaction_projection' then
    transaction_id := g.artist_transaction_record_id;
    if transaction_id is null then
      insert into public.artist_transaction_records(
        contract_id,seller_user_id,revision,track_title,license_name,amount_minor,
        refunded_minor,currency,payment_state,payment_mode,payable_earnings_calculated,occurred_at
      )
      select c.id,c.seller_user_id,j.revision,c.track_title,c.license_name,c.amount_minor,
        0,c.currency,'PAID','test',false,e.provider_created_at
      from public.order_delivery_contracts c
      join commerce_private.payment_events e on e.id = j.event_id and e.contract_id = c.id
      where c.id = j.contract_id
      returning id into transaction_id;
      if transaction_id is null then
        raise exception 'Gate D Artist projection creation failed' using errcode = '23514';
      end if;
      update commerce_private.acceptance_grants
      set artist_transaction_record_id = transaction_id where id = g.id;
    elsif not exists (
      select 1 from public.artist_transaction_records x
      where x.id = transaction_id and x.contract_id = g.delivery_contract_id
        and x.seller_user_id = g.seller_user_id and x.revision = j.revision
        and x.amount_minor = g.amount_minor and x.currency = g.currency
        and x.payment_state = 'PAID' and x.payment_mode = 'test'
        and not x.payable_earnings_calculated
    ) then
      raise exception 'Gate D Artist projection mismatch' using errcode = '23514';
    end if;
  end if;

  update commerce_private.fulfillment_jobs
  set state = case when p_success then 'complete' else 'failed' end,
      retryable = not p_success and p_retryable and attempts < 5,
      available_at = case when p_success then available_at else now() + interval '1 minute' end,
      lease_token = null,lease_until = null,
      error_code = case when p_success then null else coalesce(p_error_code,'worker_failed') end,
      completed_at = case when p_success then now() else null end
  where id = j.id;
  perform commerce_private.gate_d_append_audit(
    g.id,case when p_success then 'job_completed' else 'job_failed' end,
    'service_worker',null,g.state,g.state,g.checkout_session_id,
    g.verified_payment_event_id,j.id,
    case when p_success then j.task else coalesce(p_error_code,'worker_failed') end
  );
  return case when p_success then 'complete' else 'failed' end;
end
$$;

create function public.gate_d_get_bound_checkout(
  p_grant_id uuid,
  p_attempt_id uuid
)
returns table(
  checkout_session_id text,
  provider_expires_at timestamptz,
  order_id uuid,
  amount_minor integer,
  currency text
)
language plpgsql security definer set search_path = '' as $$
declare g commerce_private.acceptance_grants;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  select * into strict g from commerce_private.acceptance_grants
  where id = p_grant_id for share;
  if g.state <> 'checkout_bound' or g.attempt_id is distinct from p_attempt_id
     or g.checkout_session_id is null or g.provider_expires_at is null
     or g.stripe_parameters_sha256 is null then
    raise exception 'Gate D bound Checkout recovery mismatch' using errcode = '42501';
  end if;
  return query select g.checkout_session_id,g.provider_expires_at,g.order_id,g.amount_minor,g.currency;
end
$$;

create function public.gate_d_consume_acceptance(p_grant_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  g commerce_private.acceptance_grants;
  activation_job commerce_private.fulfillment_jobs;
  invariant_error text;
  logical_count integer;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.gate_d_require_capabilities_off();
  select * into strict g from commerce_private.acceptance_grants where id = p_grant_id for update;
  if g.state = 'consumed' then return 'consumed'; end if;

  if g.state <> 'paid_verified' then invariant_error := 'grant_not_paid_verified';
  elsif g.security_hold_state <> 'none' then invariant_error := 'security_hold_present';
  elsif g.deployment_target <> 'production' or g.release_mode <> 'production_beta'
     or g.payment_mode <> 'test' or g.provider <> 'stripe' then invariant_error := 'runtime_classification_mismatch';
  elsif g.buyer_user_id <> '8ffc95e8-0e8f-428e-ac26-925d6bc98fcd'::uuid then invariant_error := 'qa_buyer_mismatch';
  elsif g.checkout_session_id is null or g.payment_intent_id is null
     or g.verified_payment_event_id is null or g.delivery_contract_id is null
     or g.entitlement_id is null then invariant_error := 'payment_binding_incomplete';
  elsif not exists (
    select 1 from public.orders o
    where o.id = g.order_id and o.buyer_user_id = g.buyer_user_id
      and o.track_id = g.track_id and o.license_type_id = g.license_type_id
      and o.amount_cents = g.amount_minor and o.currency = g.currency
      and o.status in ('paid','fulfilled') and o.paid_at is not null
      and o.stripe_checkout_session_id = g.checkout_session_id
      and o.stripe_payment_intent_id = g.payment_intent_id
  ) then invariant_error := 'order_mismatch';
  elsif not exists (
    select 1 from public.order_delivery_contracts c
    join commerce_private.contract_context x on x.contract_id = c.id
    where c.id = g.delivery_contract_id and c.order_id = g.order_id
      and c.buyer_user_id = g.buyer_user_id and c.seller_user_id = g.seller_user_id
      and c.track_id = g.track_id and c.license_type_id = g.license_type_id
      and c.amount_minor = g.amount_minor and c.currency = g.currency
      and c.payment_mode = 'test' and c.deployment_environment = 'production'
      and not c.commercial_rights_granted and x.provider_account = g.provider_account
  ) then invariant_error := 'delivery_contract_mismatch';
  elsif not exists (
    select 1 from commerce_private.payment_events e
    where e.id = g.verified_payment_event_id and e.contract_id = g.delivery_contract_id
      and e.provider = 'stripe' and e.provider_account = g.provider_account
      and e.payment_mode = 'test' and not e.livemode and e.payment_state = 'PAID'
      and e.checkout_session_id = g.checkout_session_id
      and e.payment_intent_id = g.payment_intent_id
      and e.amount_minor = g.amount_minor and e.refunded_minor = 0 and e.currency = g.currency
  ) then invariant_error := 'payment_event_mismatch';
  elsif not exists (
    select 1 from public.generated_licenses x
    where x.order_id = g.order_id and x.buyer_id = g.buyer_user_id
      and x.track_id = g.track_id and x.license_type_id = g.license_type_id
      and x.status = 'generated' and x.pdf_storage_path is not null
      and x.terms_snapshot_json->'payment'->>'paymentMode' = 'test'
      and x.terms_snapshot_json->'payment'->>'commercialRightsGranted' = 'false'
      and x.terms_snapshot_json->'license'->>'pricePaidCents' = g.amount_minor::text
      and x.terms_snapshot_json->'license'->>'currency' = g.currency
  ) then invariant_error := 'agreement_mismatch';
  elsif not exists (
    select 1 from commerce_private.asset_versions a
    join commerce_private.qa_fixture_designations q
      on q.asset_version_id = a.id and q.buyer_user_id = g.buyer_user_id and q.revoked_at is null
    where a.id = g.asset_version_id and a.track_id = g.track_id
      and a.state = 'ready' and a.approval_state = 'approved' and a.retired_at is null
      and a.object_id is not null and a.object_version is not null and a.sha256 is not null
  ) then invariant_error := 'fixture_mismatch';
  elsif not exists (
    select 1 from public.order_asset_entitlements n
    where n.id = g.entitlement_id and n.contract_id = g.delivery_contract_id
      and n.order_id = g.order_id and n.buyer_user_id = g.buyer_user_id
      and n.asset_version_id = g.asset_version_id and n.state = 'pending'
      and not n.commercial_rights_granted and n.activated_at is null
  ) then invariant_error := 'pending_entitlement_mismatch';
  elsif exists (
    select 1 from public.order_asset_entitlements
    where contract_id = g.delivery_contract_id and state = 'active'
  ) then invariant_error := 'active_entitlement_present';
  elsif commerce_private.can_deliver(g.entitlement_id,g.buyer_user_id) then invariant_error := 'delivery_authorized';
  elsif g.receipt_id is null or g.receipt_object_id is null or g.receipt_object_version is null
     or g.receipt_sha256 is null or g.receipt_byte_size is null then invariant_error := 'receipt_unsealed';
  elsif not exists (
    select 1 from public.order_receipts r
    join storage.objects o on o.id = g.receipt_object_id
      and o.bucket_id = g.receipt_bucket_id and o.name = g.receipt_object_path
    where r.id = g.receipt_id and r.contract_id = g.delivery_contract_id
      and r.order_id = g.order_id and r.buyer_user_id = g.buyer_user_id
      and r.state = 'ready' and r.document_kind = 'test_receipt'
      and r.payment_mode = 'test' and not r.commercial_rights_granted
      and r.amount_minor = g.amount_minor and r.currency = g.currency
      and o.version = g.receipt_object_version
      and (o.metadata->>'size')::bigint = g.receipt_byte_size
      and o.metadata->>'mimetype' = 'application/pdf'
  ) then invariant_error := 'receipt_object_mismatch';
  elsif g.artist_transaction_record_id is null or not exists (
    select 1 from public.artist_transaction_records x
    where x.id = g.artist_transaction_record_id and x.contract_id = g.delivery_contract_id
      and x.seller_user_id = g.seller_user_id and x.amount_minor = g.amount_minor
      and x.currency = g.currency and x.payment_state = 'PAID'
      and x.payment_mode = 'test' and not x.payable_earnings_calculated
  ) then invariant_error := 'artist_projection_mismatch';
  end if;

  if invariant_error is null then
    select * into activation_job from commerce_private.fulfillment_jobs
    where contract_id = g.delivery_contract_id and event_id = g.verified_payment_event_id
      and task = 'entitlement_activation';
    if not found or activation_job.state <> 'pending' or activation_job.attempts <> 0
       or activation_job.lease_token is not null or activation_job.lease_until is not null then
      invariant_error := 'activation_job_not_dormant';
    end if;
  end if;

  if invariant_error is null then
    select count(*) into logical_count
    from commerce_private.fulfillment_jobs
    where contract_id = g.delivery_contract_id and event_id = g.verified_payment_event_id;
    if logical_count <> 4 or exists (
      select 1 from commerce_private.fulfillment_jobs
      where contract_id = g.delivery_contract_id and event_id = g.verified_payment_event_id
        and task in ('asset_preparation','receipt_generation','transaction_projection')
        and state <> 'complete'
    ) then invariant_error := 'job_set_incomplete'; end if;
  end if;

  if invariant_error is null then
    select count(*) into logical_count from public.order_receipts
    where contract_id = g.delivery_contract_id;
    if logical_count <> 1 then invariant_error := 'receipt_logical_duplicate'; end if;
  end if;
  if invariant_error is null then
    select count(*) into logical_count from public.artist_transaction_records
    where contract_id = g.delivery_contract_id;
    if logical_count <> 1 then invariant_error := 'projection_logical_duplicate'; end if;
  end if;
  if invariant_error is null then
    select count(*) into logical_count from public.order_asset_entitlements
    where contract_id = g.delivery_contract_id;
    if logical_count <> 1 then invariant_error := 'entitlement_logical_duplicate'; end if;
  end if;

  if invariant_error is not null then
    update commerce_private.acceptance_grants set safe_error_code = invariant_error where id = g.id;
    perform commerce_private.gate_d_append_audit(
      g.id,'acceptance_invariant_failed','service_worker',null,g.state,g.state,
      g.checkout_session_id,g.verified_payment_event_id,null,invariant_error
    );
    return invariant_error;
  end if;

  perform commerce_private.gate_d_append_audit(
    g.id,'acceptance_completed','service_worker',null,'paid_verified','paid_verified',
    g.checkout_session_id,g.verified_payment_event_id,null,'all_invariants_satisfied'
  );
  update commerce_private.acceptance_grants
  set state = 'consumed',consumed_at = now(),safe_error_code = null
  where id = g.id;
  perform commerce_private.gate_d_append_audit(
    g.id,'grant_consumed','service_worker',null,'paid_verified','consumed',
    g.checkout_session_id,g.verified_payment_event_id,null,'consumed'
  );
  return 'consumed';
end
$$;

revoke all on function public.gate_d_reserve_acceptance(uuid)
from public,anon,authenticated,service_role;
grant execute on function public.gate_d_reserve_acceptance(uuid) to authenticated;

revoke all on function public.gate_d_prepare_checkout(uuid,uuid,bigint,text),
  public.gate_d_bind_checkout(uuid,uuid,uuid,bigint,text,text,timestamptz),
  public.gate_d_record_checkout_failure(uuid,uuid,uuid,bigint,text,boolean),
  public.gate_d_route_webhook(text,uuid,text,boolean,text),
  public.gate_d_record_verified_payment(uuid,text,text,text,text,integer,text,text,timestamptz),
  public.gate_d_request_revocation(uuid,text),
  public.gate_d_reconcile_revocation(uuid,text,text),
  public.gate_d_apply_security_hold(uuid,text),
  public.gate_d_claim_job(uuid,text),
  public.gate_d_prepare_receipt(uuid,uuid,uuid),
  public.gate_d_seal_receipt(uuid,uuid,uuid,text,bigint,text,boolean),
  public.gate_d_finish_job(uuid,uuid,uuid,boolean,boolean,text),
  public.gate_d_get_bound_checkout(uuid,uuid),
  public.gate_d_consume_acceptance(uuid)
from public,anon,authenticated,service_role;

grant execute on function public.gate_d_prepare_checkout(uuid,uuid,bigint,text),
  public.gate_d_bind_checkout(uuid,uuid,uuid,bigint,text,text,timestamptz),
  public.gate_d_record_checkout_failure(uuid,uuid,uuid,bigint,text,boolean),
  public.gate_d_route_webhook(text,uuid,text,boolean,text),
  public.gate_d_record_verified_payment(uuid,text,text,text,text,integer,text,text,timestamptz),
  public.gate_d_request_revocation(uuid,text),
  public.gate_d_reconcile_revocation(uuid,text,text),
  public.gate_d_apply_security_hold(uuid,text),
  public.gate_d_claim_job(uuid,text),
  public.gate_d_prepare_receipt(uuid,uuid,uuid),
  public.gate_d_seal_receipt(uuid,uuid,uuid,text,bigint,text,boolean),
  public.gate_d_finish_job(uuid,uuid,uuid,boolean,boolean,text),
  public.gate_d_get_bound_checkout(uuid,uuid),
  public.gate_d_consume_acceptance(uuid)
to service_role;

revoke all on function commerce_private.gate_d_require_capabilities_off(),
  commerce_private.gate_d_append_audit(uuid,text,text,uuid,text,text,text,uuid,uuid,text),
  commerce_private.gate_d_apply_hold_core(uuid,text,text)
from public,anon,authenticated,service_role;

comment on function public.gate_d_reserve_acceptance(uuid) is
  'Exact canonical QA Buyer reservation. Uses auth.uid and a live auth.sessions binding; returns no lease token.';
comment on function public.gate_d_route_webhook(text,uuid,text,boolean,text) is
  'Service-only Gate D classifier. Positive routing is exact stored Checkout Session ID only.';
comment on function public.gate_d_consume_acceptance(uuid) is
  'Service-only atomic Gate D final invariant and single-use consumption boundary.';

commit;
