-- System 01: canonical Admin access requires a provider-signed AAL2 JWT.
-- Trusted worker/service-role paths retain their explicit authorization boundaries.
begin;
create or replace function public.auth_session_is_active() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
   select 1 from auth.sessions s where s.user_id=auth.uid()
   and s.id=case when auth.jwt()->>'session_id' ~ '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$'
     then (auth.jwt()->>'session_id')::uuid else null end
   and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>statement_timestamp())
 )
$$;
revoke all on function public.auth_session_is_active() from public,anon;
grant execute on function public.auth_session_is_active() to authenticated,service_role;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.role()='authenticated' and public.current_app_role()='admin'
   and auth.jwt()->>'aal'='aal2' and public.auth_session_is_active(),false)
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon,authenticated,service_role;

create or replace function finance_private.require_admin() returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if not public.is_admin() then raise exception 'Canonical MFA Admin required' using errcode='42501';end if;
 return actor;
end $$;
revoke all on function finance_private.require_admin() from public,anon,authenticated;

create or replace function submission_media.require_actor(p_role text) returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();begin
 if u is null or not exists(select 1 from public.user_profiles where id=u and role::text=p_role)
   or (p_role='admin' and not public.is_admin()) then
   raise exception 'Permission denied' using errcode='42501';end if;
 return u;
end $$;
-- Preserve the existing private helper grants; no new public RPC is introduced.

create or replace function public.read_order_delivery_audit(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Canonical admin required' using errcode='42501';end if;
 return jsonb_build_object('attempts',coalesce((select jsonb_agg(to_jsonb(t)) from (
 select d.id,d.actor_id,d.requested_entitlement as entitlement_id,d.asset_version_id,d.purchase_hash,d.decision,d.reason,d.authorized_at,d.expires_at,
 z.outcome,z.transfer_completion_observed,z.created_at as outcome_at from commerce_private.delivery_authorizations d
 left join commerce_private.delivery_outcomes z on z.authorization_id=d.id where d.requested_order=p_order order by d.authorized_at desc limit 100) t),'[]'::jsonb),
 'revocations',coalesce((select jsonb_agg(to_jsonb(t)) from (select * from commerce_private.delivery_revocations where order_id=p_order order by id desc limit 100)t),'[]'::jsonb),
 'restriction',(select jsonb_build_object('actorId',actor_id,'reason',reason,'createdAt',created_at) from commerce_private.delivery_restrictions where order_id=p_order));
end $$;

create or replace function public.read_order_source_chain(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'Canonical admin required' using errcode='42501';end if;
 return (select jsonb_build_object('orderId',o.id,'purchaseHash',a.snapshot_hash,'source',a.snapshot->'sourceEvidence','acceptedAt',a.accepted_at,
 'verifiedPaymentEvents',(select coalesce(jsonb_agg(jsonb_build_object('id',e.event_id,'state',e.evidence->>'paymentState')),'[]'::jsonb) from checkout_recovery.verified_events e where e.order_id=o.id),
 'license',(select jsonb_build_object('id',g.id,'agreementNumber',g.agreement_number,'status',g.status,'purchaseHash',g.terms_snapshot_json->>'purchaseHash') from public.generated_licenses g where g.order_id=o.id),
 'entitlements',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'assetVersionId',n.asset_version_id,'kind',n.asset_type,'state',n.state)),'[]'::jsonb) from public.order_asset_entitlements n where n.order_id=o.id),
 'sourceRestrictions',(select count(*) from licensing_private.source_status_events e where e.review_id=(a.snapshot#>>'{sourceEvidence,id}')::uuid))
 from public.orders o join licensing_private.acceptances a on a.order_id=o.id where o.id=p_order);
end $$;

commit;
