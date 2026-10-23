-- IR-SEC-01: retain authenticated adverse evidence before canonical state catches up.
-- Depends on exact PK09-R. No grants, capability activation, data rewrite or hosted changes.
begin;
do $$ begin
 if current_user<>'postgres' or to_regprocedure('finance_private.assert_no_adverse_provider_evidence(uuid)') is null then
  raise exception 'Verified installer and PK09-R required' using errcode='55000';
 end if;
end $$;

create or replace function finance_private.adverse_provider_summary(p_type text,p_summary jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(p_summary->>'supported'='true' and
  (p_type like 'charge.dispute.%' or p_type in ('charge.refunded','checkout.session.async_payment_failed')
   or case when p_type in ('charge.succeeded','charge.updated') and jsonb_typeof(p_summary->'refunded')='number'
    and p_summary->>'refunded' ~ '^[0-9]{1,16}$'
    then (p_summary->>'refunded')::numeric>0 else false end),false)
$$;
revoke all on function finance_private.adverse_provider_summary(text,jsonb) from public,anon,authenticated,service_role;

create or replace function finance_private.assert_no_adverse_provider_evidence(p_order uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.orders o join finance_private.provider_events e
  on (e.summary->>'paymentIntent'=o.stripe_payment_intent_id or e.summary->>'session'=o.stripe_checkout_session_id)
  join finance_private.provider_endpoints ep on ep.id=e.endpoint_id
  where o.id=p_order and (finance_private.adverse_provider_summary(e.event_type,e.summary)
   or exists(select 1 from finance_private.provider_conflicts c where c.event_id=e.id)
   or exists(select 1 from finance_private.provider_alerts a join finance_private.provider_jobs j on j.id=a.job_id
    where j.event_id=e.id and a.code in ('provider_event_conflict','provider_binding_mismatch','provider_economic_conflict','authenticated_adverse_provider_evidence')))
  and (exists(select 1 from public.order_delivery_contracts c join commerce_private.contract_context ctx on ctx.contract_id=c.id where c.order_id=o.id and ctx.provider_account=e.account)
   or exists(select 1 from checkout_recovery.verified_events v where v.order_id=o.id and v.scope=ep.credential_scope||':test')))
 then raise exception 'Authenticated adverse financial evidence requires review';end if;
end $$;

-- Preserve function OIDs, grants, queue leases, original financial posting and
-- all account/contract/legal guards. Refuse unknown predecessor definitions.
do $migration$
declare body text;old_text text;new_text text;
begin
 body:=pg_get_functiondef('public.ingest_financial_provider_event(uuid,text,text,text,jsonb)'::regprocedure);
 old_text:='p_summary->>''supported''=''true'' and (r->>''type'' like ''charge.dispute.%'' or r->>''type'' in (''charge.refunded'',''checkout.session.async_payment_failed''))';
 if position(old_text in body)=0 then raise exception 'PK09-R admission contract drift';end if;
 execute replace(body,old_text,'finance_private.adverse_provider_summary(r->>''type'',p_summary)');

 body:=pg_get_functiondef('public.finish_financial_provider_job(uuid,uuid,uuid,jsonb)'::regprocedure);
 old_text:='projection jsonb;result jsonb;code text;rid uuid;begin';
 if position(old_text in body)=0 then raise exception 'PK09-R completion declaration drift';end if;
 body:=replace(body,old_text,'projection jsonb;result jsonb;code text;rid uuid;adverse_observed boolean:=false;begin');
 old_text:='if p_proof#>>''{charge,paid}''=''true'' and not exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state=''PAID'') then raise exception ''canonical_payment_pending'';end if;';
 if position(old_text in body)=0 then raise exception 'PK09-R canonical payment guard drift';end if;
 new_text:='-- Observe adverse provider state before either canonical payment check.
   -- Local variables survive rollback of the posting subtransaction; the outer
   -- handler retains proof/hold without inventing canonical financial facts.
   adverse_observed:=(p_proof#>>''{charge,refunded}'')::bigint>coalesce((select max(refunded_minor) from commerce_private.payment_events where contract_id=b.contract_id),0)
    or (jsonb_array_length(p_proof->''disputes'')>0 and not exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state=''DISPUTED''));
   if adverse_observed then raise exception ''canonical_payment_pending'';end if;
   '||old_text;
 body:=replace(body,old_text,new_text);
 old_text:='if code in (''provider_event_conflict'',''provider_economic_conflict'',''provider_binding_mismatch'') then';
 if position(old_text in body)=0 then raise exception 'PK09-R outer recovery guard drift';end if;
 new_text:='if adverse_observed then
   perform finance_private.provider_hold(o.id);
   insert into finance_private.provider_alerts(job_id,code,detail)
   values(j.id,''authenticated_adverse_provider_evidence'',jsonb_build_object(''rejectedProof'',p_proof,''proofHash'',licensing_private.hash_json(p_proof)));
  end if;
  '||old_text;
 execute replace(body,old_text,new_text);
end $migration$;
revoke all on function finance_private.assert_no_adverse_provider_evidence(uuid) from public,anon,authenticated,service_role;
commit;
