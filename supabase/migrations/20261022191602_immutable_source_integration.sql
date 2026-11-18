-- PK04: canonical submission -> sealed delivery variant -> accepted transaction.
-- Dependencies are the unchanged Slice 3 A/B/C + fenced IO/permits and PK07/03/06/08.
-- No Storage DDL, capabilities, backfill, hosted operations or new source registry.
begin;
do $$ begin
 if current_user<>'postgres' or to_regprocedure('submission_media.package_hash(uuid,uuid)') is null
 or to_regprocedure('commerce_private.broker_can_deliver(uuid,uuid)') is null then
  raise exception 'Verified installer, canonical media foundation and PK08 required' using errcode='55000';
 end if;
end $$;

create table licensing_private.source_revisions (
 track_id uuid primary key references public.tracks(id) on delete restrict,
 revision bigint not null default 0 check(revision>=0)
);
create table licensing_private.source_asset_links (
 asset_version_id uuid primary key references commerce_private.asset_versions(id) on delete restrict,
 submission_id uuid not null,
 master_id uuid not null,
 source_object_id uuid not null references storage.objects(id) on delete restrict,
 source_version text not null,
 source_sha256 text not null check(source_sha256 ~ '^[a-f0-9]{64}$'),
 reviewed_by uuid not null references public.user_profiles(id) on delete restrict,
 review_reference text not null check(length(review_reference) between 5 and 500),
 reviewed_at timestamptz not null default clock_timestamp(),
 foreign key(submission_id,master_id) references submission_media.assets(submission_id,id) on delete restrict
);
create index source_links_master on licensing_private.source_asset_links(master_id,asset_version_id);
create table licensing_private.source_reviews (
 id uuid primary key default gen_random_uuid(),
 offer_id uuid not null unique references licensing_private.offers(id) on delete restrict,
 track_id uuid not null references public.tracks(id) on delete restrict,
 submission_id uuid not null,
 master_id uuid not null,
 master_review_id uuid not null,
 revision bigint not null,
 snapshot jsonb not null check(jsonb_typeof(snapshot)='object'),
 snapshot_hash text not null check(snapshot_hash ~ '^[a-f0-9]{64}$'),
 reviewed_by uuid not null references public.user_profiles(id) on delete restrict,
 review_reference text not null check(length(review_reference) between 5 and 500),
 reviewed_at timestamptz not null default clock_timestamp(),
 foreign key(submission_id,master_id) references submission_media.assets(submission_id,id) on delete restrict,
 foreign key(submission_id,master_review_id) references submission_media.master_reviews(submission_id,id) on delete restrict
);
create index source_reviews_track on licensing_private.source_reviews(track_id,master_id);
create table licensing_private.source_status_events (
 id bigint generated always as identity primary key,
 review_id uuid not null references licensing_private.source_reviews(id) on delete restrict,
 actor_id uuid not null references public.user_profiles(id) on delete restrict,
 reason text not null check(length(reason) between 5 and 1000),
 created_at timestamptz not null default clock_timestamp()
);
create index source_status_review on licensing_private.source_status_events(review_id,id);
do $$ declare t text;begin
 foreach t in array array['source_revisions','source_asset_links','source_reviews','source_status_events'] loop
  execute format('alter table licensing_private.%I enable row level security',t);
  execute format('alter table licensing_private.%I force row level security',t);
  execute format('create policy owner_only on licensing_private.%I to postgres using(true) with check(true)',t);
  execute format('revoke all on licensing_private.%I from public,anon,authenticated,service_role,submission_media_broker',t);
  if t<>'source_revisions' then
   execute format('create trigger retain_source before update or delete on licensing_private.%I for each row execute function licensing_private.immutable()',t);
  end if;
 end loop;
end $$;

-- Material source/catalog edits create an irreversible generation. Reverting an
-- edit never revives stale unissued assent. Nonmaterial metadata stays frozen in
-- each review; issued licenses never acquire the replacement metadata or bytes.
create function licensing_private.revise_source_track() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.artist_user_id,new.status,new.audio_file_path,new.title,new.slug) is distinct from
 (old.artist_user_id,old.status,old.audio_file_path,old.title,old.slug) then
  insert into licensing_private.source_revisions values(new.id,1) on conflict(track_id) do update set revision=licensing_private.source_revisions.revision+1;
 end if;return new;
end $$;
create trigger source_track_revision after update on public.tracks for each row execute function licensing_private.revise_source_track();
create function licensing_private.revise_source_master() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.track_id,new.owner_id,new.current_master_id,new.current_review_id,new.managed_master) is distinct from
 (old.track_id,old.owner_id,old.current_master_id,old.current_review_id,old.managed_master) then
  -- Canonical Admin activation already locks this track before changing pointers.
  -- Readers lock the track, never the submission (avoids inverse row-lock order).
  perform 1 from public.tracks where id=coalesce(new.track_id,old.track_id) for update;
  if coalesce(new.track_id,old.track_id) is not null then
   insert into licensing_private.source_revisions values(coalesce(new.track_id,old.track_id),1)
   on conflict(track_id) do update set revision=licensing_private.source_revisions.revision+1;
  end if;
 end if;return new;
end $$;
create trigger source_master_revision after update on submission_media.submissions for each row execute function licensing_private.revise_source_master();

-- Pure read of an immutable approved package; caller serializes on tracks first.
create function licensing_private.check_source_package(p_submission uuid,p_master uuid,p_review uuid) returns submission_media.assets
language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions; a submission_media.assets; r submission_media.master_reviews;
begin
 select * into strict s from submission_media.submissions where id=p_submission;
 select * into strict a from submission_media.assets where id=p_master and submission_id=s.id;
 select * into strict r from submission_media.master_reviews where id=p_review and submission_id=s.id;
 if a.kind<>'source_master' or a.technical_state<>'ready' or r.state<>'approved' or r.candidate_master_id<>a.id
 or r.package_hash is distinct from submission_media.package_hash(r.candidate_master_id,r.candidate_preview_id)
 or not exists(select 1 from public.user_profiles where id=r.decided_by and role='admin')
 or not exists(select 1 from public.tracks where id=s.track_id and artist_user_id=s.owner_id and status='approved')
 or not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id and not b.public
 where o.id=a.storage_object_id and o.bucket_id=a.bucket and o.name=a.object_path and o.version=a.storage_version
 and (o.metadata->>'size')::bigint=a.storage_bytes and o.metadata->>'mimetype'=a.storage_mime)
 then raise exception 'Approved immutable source evidence unavailable';end if;
 return a;
end $$;

-- A master is copied from the canonical READY source. Other approved variants use
-- the existing PK08 reservation and require an explicit reviewed recording link.
alter table commerce_private.asset_versions drop constraint asset_versions_source_bucket_check;
alter table commerce_private.asset_versions add constraint asset_versions_source_bucket_check check(source_bucket in ('track-audio','submission-source'));
create function public.reserve_approved_source_delivery(p_actor uuid,p_submission uuid,p_master uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions; a submission_media.assets; result uuid;
begin
 perform licensing_private.require_admin(p_actor);perform commerce_private.assert_enabled('asset_preparation');
 select * into strict s from submission_media.submissions where id=p_submission;
 perform 1 from public.tracks where id=s.track_id for share;
 select * into strict s from submission_media.submissions where id=p_submission;
 a:=licensing_private.check_source_package(s.id,p_master,s.current_review_id);
 if not s.managed_master or s.current_master_id<>a.id then raise exception 'Current approved master required';end if;
 insert into commerce_private.asset_versions(track_id,asset_type,source_object_id,source_bucket,source_path,source_version)
 values(s.track_id,'master',a.storage_object_id,a.bucket,a.object_path,a.storage_version)
 on conflict(track_id,source_object_id,source_version,asset_type) do nothing returning id into result;
 if result is null then select id into strict result from commerce_private.asset_versions where track_id=s.track_id and source_object_id=a.storage_object_id and source_version=a.storage_version and asset_type='master';end if;
 return result;
end $$;
create function public.link_approved_delivery_source(p_actor uuid,p_asset uuid,p_submission uuid,p_master uuid,p_reference text) returns void
language plpgsql security definer set search_path='' as $$
declare s submission_media.submissions; a submission_media.assets; v commerce_private.asset_versions; prior licensing_private.source_asset_links;
begin
 perform licensing_private.require_admin(p_actor);
 select * into strict s from submission_media.submissions where id=p_submission;
 perform 1 from public.tracks where id=s.track_id for share;
 select * into strict s from submission_media.submissions where id=p_submission;
 a:=licensing_private.check_source_package(s.id,p_master,s.current_review_id);
 select * into strict v from commerce_private.asset_versions where id=p_asset for share;
 if length(coalesce(p_reference,'')) not between 5 and 500 or s.current_master_id<>a.id or not s.managed_master
 or v.track_id<>s.track_id or v.state<>'ready' or v.approval_state<>'approved' or v.retired_at is not null
 or (v.asset_type='master' and (v.source_object_id<>a.storage_object_id or v.source_version<>a.storage_version or v.sha256<>encode(a.sha256,'hex') or v.byte_size<>a.storage_bytes))
 or not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id and not b.public
 where o.id=v.source_object_id and o.bucket_id=v.source_bucket and o.name=v.source_path and o.version=v.source_version
 and (o.metadata->>'size')::bigint=v.byte_size
 and ((v.source_bucket='track-audio' and split_part(v.source_path,'/',1)=s.owner_id::text) or v.source_object_id=a.storage_object_id))
 then raise exception 'Sealed deliverable must match the approved recording source';end if;
 select * into prior from licensing_private.source_asset_links where asset_version_id=v.id;
 if found then
  if (prior.submission_id,prior.master_id,prior.source_object_id,prior.source_version,prior.source_sha256) is distinct from (s.id,a.id,v.source_object_id,v.source_version,v.sha256) then raise exception 'Immutable source link conflict';end if;return;
 end if;
 insert into licensing_private.source_asset_links(asset_version_id,submission_id,master_id,source_object_id,source_version,source_sha256,reviewed_by,review_reference)
 values(v.id,s.id,a.id,v.source_object_id,v.source_version,v.sha256,p_actor,p_reference);
end $$;

create function public.review_purchase_source(p_actor uuid,p_offer uuid,p_submission uuid,p_revision bigint,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o licensing_private.offers; s submission_media.submissions; a submission_media.assets; r submission_media.master_reviews; m jsonb; links jsonb; snap jsonb; result licensing_private.source_reviews; generation bigint;
begin
 perform licensing_private.require_admin(p_actor);
 select * into strict o from licensing_private.offers where id=p_offer for share;
 perform 1 from public.tracks where id=o.track_id for share;
 select * into strict s from submission_media.submissions where id=p_submission and track_id=o.track_id and owner_id=o.seller_user_id;
 if not s.managed_master or s.current_master_id is null or s.revision is distinct from p_revision or length(coalesce(p_reference,'')) not between 5 and 500 then raise exception 'Current reviewed submission revision required';end if;
 a:=licensing_private.check_source_package(s.id,s.current_master_id,s.current_review_id);
 perform licensing_private.check_offer(o.id,clock_timestamp());
 select * into strict r from submission_media.master_reviews where id=s.current_review_id;
 select manifest into strict m from commerce_private.license_delivery_sets where offer_id=o.id;
 if exists(select 1 from jsonb_array_elements(m) e where not exists(select 1 from licensing_private.source_asset_links l join commerce_private.asset_versions v on v.id=l.asset_version_id
 where l.asset_version_id=(e->>'assetVersionId')::uuid and l.submission_id=s.id and l.master_id=a.id and v.track_id=o.track_id
 and v.sha256=e->>'sha256' and v.object_version=e->>'objectVersion' and v.retired_at is null and v.state='ready'))
 then raise exception 'Every deliverable needs an approved source link';end if;
 if exists(select 1 from licensing_private.quotes where offer_id=o.id) then raise exception 'Source review must precede every quote';end if;
 select coalesce(jsonb_agg(jsonb_build_object('assetVersionId',l.asset_version_id,'sourceObjectId',l.source_object_id,'sourceVersion',l.source_version,'sourceSha256',l.source_sha256,'reviewedBy',l.reviewed_by,'reviewedAt',l.reviewed_at,'reviewReference',l.review_reference) order by l.asset_version_id),'[]'::jsonb)
 into links from licensing_private.source_asset_links l where l.asset_version_id in(select (e->>'assetVersionId')::uuid from jsonb_array_elements(m) e);
 select coalesce((select revision from licensing_private.source_revisions where track_id=o.track_id),0) into generation;
 snap:=jsonb_build_object('schemaVersion','TSE-SOURCE-1','submissionId',s.id,'submissionRevision',s.revision,'trackId',o.track_id,'artistId',s.owner_id,
 'masterId',a.id,'masterReviewId',r.id,'packageHash',encode(r.package_hash,'hex'),'masterObjectId',a.storage_object_id,'masterVersion',a.storage_version,'masterSha256',encode(a.sha256,'hex'),'masterBytes',a.storage_bytes,
 'validatorVersion',a.validator_version,'workerBuildDigest',a.worker_build_digest,'masterApprovedBy',r.decided_by,'masterApprovedAt',r.decided_at,
 'sourceGeneration',generation,'catalogMetadata',(select jsonb_build_object('id',t.id,'title',t.title,'slug',t.slug,'genre',t.genre,'durationSeconds',t.duration_seconds,'releaseYear',t.release_year) from public.tracks t where t.id=o.track_id),
 'rightsOfferId',o.id,'rightsSourceHash',o.source_hash,'rightsReviewGeneration',o.rights_epoch,'rightsHash',licensing_private.hash_json(o.rights),
 'deliveryManifestHash',licensing_private.hash_json(m),'deliverableSources',links);
 select * into result from licensing_private.source_reviews where offer_id=o.id;
 if found then
  if result.snapshot<>snap then raise exception 'Immutable source review conflict; publish a new offer';end if;
 else
  insert into licensing_private.source_reviews(offer_id,track_id,submission_id,master_id,master_review_id,revision,snapshot,snapshot_hash,reviewed_by,review_reference)
  values(o.id,o.track_id,s.id,a.id,r.id,generation,snap,licensing_private.hash_json(snap),p_actor,p_reference) returning * into result;
 end if;
 return jsonb_build_object('id',result.id,'hash',result.snapshot_hash,'snapshot',result.snapshot,'reviewedBy',result.reviewed_by,'reviewedAt',result.reviewed_at,'reviewReference',result.review_reference);
end $$;

create function licensing_private.assert_source(p_snapshot jsonb,p_historical boolean default false) returns void
language plpgsql security definer set search_path='' as $$
declare r licensing_private.source_reviews; s submission_media.submissions; a submission_media.assets; v jsonb; link licensing_private.source_asset_links; asset commerce_private.asset_versions;
begin
 select * into r from licensing_private.source_reviews where id=(p_snapshot#>>'{sourceEvidence,id}')::uuid and offer_id=(p_snapshot->>'offerId')::uuid;
 if r.id is null then raise exception 'Reviewed immutable source evidence required';end if;
 perform 1 from public.tracks where id=r.track_id for share;
 select * into strict s from submission_media.submissions where id=r.submission_id;
 if p_snapshot->'sourceEvidence' is distinct from jsonb_build_object('id',r.id,'hash',r.snapshot_hash,'snapshot',r.snapshot,'reviewedBy',r.reviewed_by,'reviewedAt',r.reviewed_at,'reviewReference',r.review_reference)
 or licensing_private.hash_json(coalesce(p_snapshot->'deliveryManifest','[]'::jsonb))<>r.snapshot->>'deliveryManifestHash'
 or r.snapshot_hash<>licensing_private.hash_json(r.snapshot)
 or exists(select 1 from licensing_private.source_status_events where review_id=r.id)
 or r.track_id::text is distinct from p_snapshot#>>'{track,id}'
 or r.snapshot->>'rightsSourceHash' is distinct from p_snapshot->>'rightsSourceHash'
 or r.snapshot->>'rightsHash' is distinct from licensing_private.hash_json(p_snapshot->'rights')
 or (not p_historical and (s.current_master_id is distinct from r.master_id or s.current_review_id is distinct from r.master_review_id or not s.managed_master
 or r.revision<>coalesce((select revision from licensing_private.source_revisions where track_id=r.track_id),0)))
 then raise exception 'Source evidence changed incompatibly; original transaction retained for reconciliation';end if;
 a:=licensing_private.check_source_package(r.submission_id,r.master_id,r.master_review_id);
 for v in select value from jsonb_array_elements(coalesce(p_snapshot->'deliveryManifest','[]'::jsonb)) loop
  select * into strict link from licensing_private.source_asset_links where asset_version_id=(v->>'assetVersionId')::uuid;
  select * into strict asset from commerce_private.asset_versions where id=link.asset_version_id;
  if link.submission_id<>r.submission_id or link.master_id<>r.master_id or link.source_sha256 is distinct from v->>'sha256'
  or asset.sha256<>link.source_sha256 or asset.retired_at is not null or asset.approval_state<>'approved'
  or not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id and not b.public
   where o.id=link.source_object_id and o.version=link.source_version and o.bucket_id=asset.source_bucket and o.name=asset.source_path and (o.metadata->>'size')::bigint=asset.byte_size)
  then raise exception 'Licensed source version unavailable or incompatible';end if;
 end loop;
end $$;
create function licensing_private.freeze_source_quote() returns trigger language plpgsql security definer set search_path='' as $$
declare r licensing_private.source_reviews;begin
 select * into r from licensing_private.source_reviews where offer_id=new.offer_id;
 if r.id is null then raise exception 'Reviewed immutable source evidence required';end if;
 new.schedule:=new.schedule||jsonb_build_object('sourceEvidence',jsonb_build_object('id',r.id,'hash',r.snapshot_hash,'snapshot',r.snapshot,'reviewedBy',r.reviewed_by,'reviewedAt',r.reviewed_at,'reviewReference',r.review_reference));
 perform licensing_private.assert_source(new.schedule,false);
 new.schedule_hash:=licensing_private.hash_json(new.schedule);return new;
end $$;
-- PostgreSQL trigger name order: PK08 deliverables first, final source hash last.
create trigger zz_freeze_source_quote before insert on licensing_private.quotes for each row execute function licensing_private.freeze_source_quote();
create function licensing_private.guard_source_acceptance() returns trigger language plpgsql security definer set search_path='' as $$
begin perform licensing_private.assert_source(new.snapshot,false);return new;end $$;
create trigger source_acceptance before insert on licensing_private.acceptances for each row execute function licensing_private.guard_source_acceptance();

create function public.restrict_purchase_source(p_actor uuid,p_review uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r licensing_private.source_reviews;begin
 perform licensing_private.require_admin(p_actor);select * into strict r from licensing_private.source_reviews where id=p_review;
 perform 1 from public.tracks where id=r.track_id for update;
 insert into licensing_private.source_status_events(review_id,actor_id,reason) values(r.id,p_actor,p_reason);
end $$;
create function public.read_order_source_chain(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.role()<>'authenticated' or not exists(select 1 from public.user_profiles where id=auth.uid() and role='admin') then raise exception 'Canonical admin required' using errcode='42501';end if;
 return (select jsonb_build_object('orderId',o.id,'purchaseHash',a.snapshot_hash,'source',a.snapshot->'sourceEvidence','acceptedAt',a.accepted_at,
 'verifiedPaymentEvents',(select coalesce(jsonb_agg(jsonb_build_object('id',e.event_id,'state',e.evidence->>'paymentState')),'[]'::jsonb) from checkout_recovery.verified_events e where e.order_id=o.id),
 'license',(select jsonb_build_object('id',g.id,'agreementNumber',g.agreement_number,'status',g.status,'purchaseHash',g.terms_snapshot_json->>'purchaseHash') from public.generated_licenses g where g.order_id=o.id),
 'entitlements',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'assetVersionId',n.asset_version_id,'kind',n.asset_type,'state',n.state)),'[]'::jsonb) from public.order_asset_entitlements n where n.order_id=o.id),
 'sourceRestrictions',(select count(*) from licensing_private.source_status_events e where e.review_id=(a.snapshot#>>'{sourceEvidence,id}')::uuid))
 from public.orders o join licensing_private.acceptances a on a.order_id=o.id where o.id=p_order);
end $$;

-- New externally callable routines are service-only + canonical Admin checks.
revoke all on function public.reserve_approved_source_delivery(uuid,uuid,uuid),public.link_approved_delivery_source(uuid,uuid,uuid,uuid,text),public.review_purchase_source(uuid,uuid,uuid,bigint,text),public.restrict_purchase_source(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_approved_source_delivery(uuid,uuid,uuid),public.link_approved_delivery_source(uuid,uuid,uuid,uuid,text),public.review_purchase_source(uuid,uuid,uuid,bigint,text),public.restrict_purchase_source(uuid,uuid,text) to service_role;
revoke all on function public.read_order_source_chain(uuid) from public,anon,service_role;
grant execute on function public.read_order_source_chain(uuid) to authenticated;
revoke all on function licensing_private.revise_source_track(),licensing_private.revise_source_master(),licensing_private.check_source_package(uuid,uuid,uuid),licensing_private.assert_source(jsonb,boolean),licensing_private.freeze_source_quote(),licensing_private.guard_source_acceptance() from public,anon,authenticated,service_role,submission_media_broker;

-- Preserve the existing function OID and every PK03/06/07 payment/rights check.
create or replace function licensing_private.assert_purchase(p_order uuid,p_paid boolean) returns licensing_private.acceptances
language plpgsql security definer set search_path='' as $$
declare a licensing_private.acceptances; o public.orders;
begin
 select * into strict o from public.orders where id=p_order;
 if not exists(select 1 from public.user_profiles where id=o.buyer_user_id and role='buyer') then raise exception 'Canonical buyer required for issuance'; end if;
 select * into a from licensing_private.acceptances where order_id=p_order;
 if a.order_id is null then raise exception 'Transaction-specific legal acceptance required'; end if;
 if a.buyer_id<>o.buyer_user_id or a.snapshot->>'orderId' is distinct from o.id::text or a.snapshot#>>'{track,id}' is distinct from o.track_id::text
 or a.snapshot#>>'{license,id}' is distinct from o.license_type_id::text or (a.snapshot->>'amountCents')::bigint is distinct from o.amount_cents::bigint
 or a.snapshot->>'currency' is distinct from o.currency or o.checkout_hold or o.checkout_closed_at is not null or o.status='refunded'
 or (a.snapshot#>>'{usage,endsAt}')::timestamptz<=clock_timestamp()
 then raise exception 'Accepted transaction binding or payment hold invalid'; end if;
 perform licensing_private.check_offer((a.snapshot->>'offerId')::uuid,(a.snapshot#>>'{usage,endsAt}')::timestamptz);
 if p_paid and (o.status not in ('paid','fulfilled') or o.paid_at is null or o.stripe_payment_intent_id is null
 or exists(select 1 from commerce_private.order_states s join public.order_delivery_contracts c on c.id=s.contract_id
 where c.order_id=o.id and s.state in ('PAYMENT_FAILED','PARTIALLY_REFUNDED','REFUNDED','DISPUTED','SECURITY_HOLD'))
 or not (exists(select 1 from checkout_recovery.verified_events e where e.order_id=o.id and e.evidence->>'paymentState'='PAID'
 and e.evidence->>'checkoutSessionId'=o.stripe_checkout_session_id and e.evidence->>'paymentIntentId'=o.stripe_payment_intent_id)
 or exists(select 1 from commerce_private.payment_events e join public.order_delivery_contracts c on c.id=e.contract_id
 where c.order_id=o.id and e.payment_state='PAID' and e.checkout_session_id=o.stripe_checkout_session_id and e.payment_intent_id=o.stripe_payment_intent_id)))
 then raise exception 'Verified payment required for legal issuance'; end if;
 perform licensing_private.assert_source(a.snapshot,exists(select 1 from public.generated_licenses g where g.order_id=p_order and g.status='generated'));
 return a;
end $$;

-- Exact source and destination coordinates are returned only to an authorized
-- Admin server command, never to a Buyer or a browser payload.
create function public.read_approved_master_copy(p_actor uuid,p_asset uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v commerce_private.asset_versions; s submission_media.submissions; a submission_media.assets;
begin
 perform licensing_private.require_admin(p_actor);perform commerce_private.assert_enabled('asset_preparation');
 select * into strict v from commerce_private.asset_versions where id=p_asset;
 perform 1 from public.tracks where id=v.track_id for share;
 select * into strict s from submission_media.submissions where track_id=v.track_id;
 a:=licensing_private.check_source_package(s.id,s.current_master_id,s.current_review_id);
 if not s.managed_master or v.asset_type<>'master' or v.retired_at is not null or v.approval_state='rejected'
 or (v.source_object_id,v.source_bucket,v.source_path,v.source_version) is distinct from
 (a.storage_object_id,a.bucket,a.object_path,a.storage_version) then raise exception 'Current approved source copy required';end if;
 return jsonb_build_object('assetVersionId',v.id,'submissionId',s.id,'masterId',a.id,'byteSize',a.storage_bytes,'sha256',encode(a.sha256,'hex'),'mimeType',case a.container when 'wav' then 'audio/wav' when 'aiff' then 'audio/aiff' when 'aifc' then 'audio/aiff' when 'flac' then 'audio/flac' end,
 'source',jsonb_build_object('bucket',a.bucket,'path',a.object_path),'destination',jsonb_build_object('bucket',v.bucket_id,'path',v.object_path));
end $$;
create function public.seal_approved_master_copy(p_actor uuid,p_asset uuid,p_sha256 text,p_size bigint,p_mime text,p_reference text) returns boolean
language plpgsql security definer set search_path='' as $$
declare c jsonb;begin
 c:=public.read_approved_master_copy(p_actor,p_asset);
 if (c->>'sha256',c->>'byteSize',c->>'mimeType') is distinct from (p_sha256,p_size::text,p_mime) then raise exception 'Verified approved source bytes required';end if;
 perform commerce_private.seal_asset(p_asset,p_sha256,p_size,p_mime);
 perform public.link_approved_delivery_source(p_actor,p_asset,(c->>'submissionId')::uuid,(c->>'masterId')::uuid,p_reference);
 return true;
end $$;
revoke all on function public.read_approved_master_copy(uuid,uuid),public.seal_approved_master_copy(uuid,uuid,text,bigint,text,text) from public,anon,authenticated;
grant execute on function public.read_approved_master_copy(uuid,uuid),public.seal_approved_master_copy(uuid,uuid,text,bigint,text,text) to service_role;

commit;
