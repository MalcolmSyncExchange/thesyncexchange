-- DRAFT ONLY. DO NOT place under supabase/migrations or apply without D5 review.
-- Removes Gate D executable authority while retaining evidence, audit, FKs,
-- indexes, RLS, no-delete guards, append-only guards, and Storage integrity.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if exists (
    select 1 from commerce_private.acceptance_grants
    where state in ('available','reserved','checkout_bound','revocation_requested','paid_verified')
  ) then
    raise exception 'Gate D cleanup requires every retained grant to be terminal';
  end if;
  if exists (
    select 1 from commerce_private.acceptance_grants g
    join commerce_private.fulfillment_jobs j
      on j.contract_id = g.delivery_contract_id
    where j.state = 'processing'
  ) then
    raise exception 'Gate D cleanup requires no processing job';
  end if;
end
$$;

revoke all on function public.gate_d_reserve_acceptance(uuid)
from public,anon,authenticated,service_role;

revoke all on function public.gate_d_prepare_checkout(uuid,uuid,bigint),
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

drop function public.gate_d_consume_acceptance(uuid);
drop function public.gate_d_get_bound_checkout(uuid,uuid);
drop function public.gate_d_finish_job(uuid,uuid,uuid,boolean,boolean,text);
drop function public.gate_d_seal_receipt(uuid,uuid,uuid,text,bigint,text,boolean);
drop function public.gate_d_prepare_receipt(uuid,uuid,uuid);
drop function public.gate_d_claim_job(uuid,text);
drop function public.gate_d_apply_security_hold(uuid,text);
drop function public.gate_d_reconcile_revocation(uuid,text,text);
drop function public.gate_d_request_revocation(uuid,text);
drop function public.gate_d_record_verified_payment(uuid,text,text,text,text,integer,text,text,timestamptz);
drop function public.gate_d_route_webhook(text,uuid,text,boolean,text);
drop function public.gate_d_record_checkout_failure(uuid,uuid,uuid,bigint,text,boolean);
drop function public.gate_d_bind_checkout(uuid,uuid,uuid,bigint,text,text,timestamptz);
drop function public.gate_d_prepare_checkout(uuid,uuid,bigint);
drop function public.gate_d_reserve_acceptance(uuid);

drop function commerce_private.gate_d_apply_hold_core(uuid,text,text);
drop function commerce_private.gate_d_append_audit(uuid,text,text,uuid,text,text,text,uuid,uuid,text);
drop function commerce_private.gate_d_require_capabilities_off();

-- Intentionally retained:
-- commerce_private.acceptance_grants and acceptance_grant_audit;
-- all table constraints, FKs, indexes and RLS;
-- guard_acceptance_grant, audit_initial_acceptance_grant,
-- immutable_acceptance_grant_audit and guard_gate_d_receipt_storage triggers;
-- their four private trigger functions and all retained evidence rows.
commit;
