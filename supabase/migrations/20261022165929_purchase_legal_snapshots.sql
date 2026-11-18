-- Additive local candidate. No approvals, offers, capabilities or historical
-- acceptance are seeded. Apply only in a separately authorized integration.
begin;
create schema licensing_private;
revoke all on schema licensing_private from public,anon,authenticated,service_role;

create table licensing_private.evidence (
 id uuid primary key default gen_random_uuid(), object_id uuid not null references storage.objects(id) on delete restrict,
 object_version text not null, byte_size bigint not null check(byte_size>0), sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
 review_reference text not null, reviewed_by uuid not null references public.user_profiles(id) on delete restrict,
 reviewed_at timestamptz not null default clock_timestamp(), valid_until timestamptz not null
);
create table licensing_private.offers (
 id uuid primary key default gen_random_uuid(), track_id uuid not null references public.tracks(id) on delete restrict,
 license_type_id uuid not null references public.license_types(id) on delete restrict,
 seller_user_id uuid not null references public.user_profiles(id) on delete restrict,
 source_hash text not null, rights_epoch bigint not null check(rights_epoch>0), license_exclusive boolean not null, rights jsonb not null, terms jsonb not null, financial jsonb not null,
 reviewed_by uuid not null references public.user_profiles(id) on delete restrict, review_reference text not null,
 created_at timestamptz not null default clock_timestamp(), unique(id,track_id,license_type_id)
);
create table licensing_private.offer_heads (
 track_id uuid not null, license_type_id uuid not null, offer_id uuid not null,
 primary key(track_id,license_type_id), foreign key(offer_id,track_id,license_type_id)
 references licensing_private.offers(id,track_id,license_type_id) on delete restrict
);
create table licensing_private.rights_revisions(track_id uuid primary key references public.tracks(id) on delete cascade,revision bigint not null);
create table licensing_private.status_events (
 sequence bigint generated always as identity primary key, kind text not null check(kind in ('offer','evidence')),
 resource_id uuid not null, state text not null check(state in ('revoked','disputed')),
 actor_id uuid not null references public.user_profiles(id) on delete restrict, reason text not null,
 recorded_at timestamptz not null default clock_timestamp(), unique(kind,resource_id)
);
create table licensing_private.quotes (
 id uuid primary key default gen_random_uuid(), buyer_id uuid not null references public.user_profiles(id) on delete restrict,
 offer_id uuid not null references licensing_private.offers(id) on delete restrict,
 schedule jsonb not null, schedule_hash text not null, created_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '30 minutes'
);
create index licensing_quote_buyer on licensing_private.quotes(buyer_id,created_at);
create table licensing_private.acceptances (
 order_id uuid primary key references public.orders(id) on delete restrict, quote_id uuid not null unique references licensing_private.quotes(id) on delete restrict,
 buyer_id uuid not null references public.user_profiles(id) on delete restrict, accepted_at timestamptz not null default clock_timestamp(),
 snapshot jsonb not null, snapshot_hash text not null
);
create function licensing_private.hash_json(p_value jsonb) returns text language sql immutable set search_path='' as $$
 select encode(sha256(convert_to(p_value::text,'UTF8')),'hex')
$$;
create function licensing_private.immutable() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Licensing evidence and snapshots are immutable'; end $$;
do $$ declare t text; begin
 foreach t in array array['evidence','offers','status_events','quotes','acceptances'] loop
 execute format('create trigger immutable_licensing before update or delete on licensing_private.%I for each row execute function licensing_private.immutable()',t);
 end loop;
 foreach t in array array['evidence','offers','offer_heads','rights_revisions','status_events','quotes','acceptances'] loop
 execute format('alter table licensing_private.%I enable row level security',t);
 end loop;
end $$;

create function licensing_private.require_admin(p_actor uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from public.user_profiles where id=p_actor and role='admin')
 then raise exception 'Canonical admin and service role required'; end if;
end $$;
create function licensing_private.buyer() returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null or not exists(select 1 from public.user_profiles where id=auth.uid() and role='buyer')
 then raise exception 'Authenticated canonical buyer required'; end if;
 return auth.uid();
end $$;
create function licensing_private.check_party(p jsonb) returns void language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'legalName') is distinct from 'string' or length(coalesce(p->>'legalName','')) not between 2 and 200
 or p->>'entityType' is null or p->>'entityType' not in ('individual','company')
 or length(coalesce(p->>'jurisdiction','')) not between 2 and 100 or length(coalesce(p->>'address','')) not between 5 and 500
 or (p->>'entityType'='company' and length(coalesce(p->>'registrationNumber','')) not between 2 and 100)
 then raise exception 'Complete legal party identification required'; end if;
 if exists(select 1 from unnest(array['legalName','entityType','jurisdiction','address']) k where jsonb_typeof(p->k) is distinct from 'string')
 or (p->>'entityType'='company' and jsonb_typeof(p->'registrationNumber') is distinct from 'string')
 then raise exception 'Legal party fields must be text'; end if;
end $$;
create function licensing_private.rights_source(p_track uuid) returns text language sql stable security definer set search_path='' as $$
 select licensing_private.hash_json(jsonb_build_object('seller',t.artist_user_id,'revision',coalesce((select revision from licensing_private.rights_revisions where track_id=t.id),0),
 'holders',coalesce((select jsonb_agg(to_jsonb(r)-array['created_at','updated_at'] order by r.id) from public.rights_holders r where r.track_id=t.id),'[]'::jsonb),
 'recordingSource',t.audio_file_path)) from public.tracks t where t.id=p_track
$$;
create function public.register_licensing_evidence(p_actor uuid,p_object uuid,p_sha256 text,p_reference text,p_valid_until timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare s storage.objects; result uuid;
begin
 perform licensing_private.require_admin(p_actor);
 select * into strict s from storage.objects where id=p_object for share;
 if s.version is null or coalesce((s.metadata->>'size')::bigint,0)<=0 or not exists(select 1 from storage.buckets where id=s.bucket_id and public=false)
 or length(coalesce(p_reference,'')) not between 5 and 500 or p_valid_until<=clock_timestamp()
 then raise exception 'Private versioned reviewed documentation required'; end if;
 insert into licensing_private.evidence(object_id,object_version,byte_size,sha256,review_reference,reviewed_by,valid_until)
 values(s.id,s.version,(s.metadata->>'size')::bigint,p_sha256,p_reference,p_actor,p_valid_until) returning id into result;
 return result;
end $$;
create function licensing_private.check_offer(p_id uuid,p_until timestamptz) returns licensing_private.offers
language plpgsql security definer set search_path='' as $$
declare o licensing_private.offers; h jsonb; pool text; e licensing_private.evidence;
begin
 select * into strict o from licensing_private.offers where id=p_id for share;
 perform 1 from public.tracks where id=o.track_id for share;
 if exists(select 1 from licensing_private.status_events where kind='offer' and resource_id=o.id)
 or o.source_hash is distinct from licensing_private.rights_source(o.track_id)
 or not exists(select 1 from licensing_private.offer_heads h join licensing_private.offers current_review on current_review.id=h.offer_id
 where h.track_id=o.track_id and h.license_type_id=o.license_type_id and current_review.rights=o.rights and current_review.rights_epoch=o.rights_epoch)
 or not exists(select 1 from public.tracks where id=o.track_id and artist_user_id=o.seller_user_id and status='approved')
 or not exists(select 1 from public.user_profiles where id=o.seller_user_id and role='artist')
 or not exists(select 1 from public.track_license_options x join public.license_types l on l.id=x.license_type_id where x.track_id=o.track_id and l.id=o.license_type_id and x.active and l.active and l.exclusive=o.license_exclusive)
 or (o.rights#>>'{scope,validFrom}')::timestamptz>clock_timestamp()
 or (o.rights#>>'{scope,validUntil}')::timestamptz<greatest(clock_timestamp(),p_until)
 or (o.terms->>'issueUntil')::timestamptz<clock_timestamp()
 then raise exception 'Rights or legal terms are no longer valid; reconciliation required'; end if;
 foreach pool in array array['master','publishing'] loop
  for h in select value from jsonb_array_elements(o.rights->pool) loop
   select * into strict e from licensing_private.evidence where id=(h->>'evidenceId')::uuid for share;
   if e.valid_until<greatest(clock_timestamp(),p_until) or exists(select 1 from licensing_private.status_events where kind='evidence' and resource_id=e.id)
   or not exists(select 1 from storage.objects s join storage.buckets b on b.id=s.bucket_id where s.id=e.object_id and s.version=e.object_version
     and (s.metadata->>'size')::bigint=e.byte_size and not b.public)
   then raise exception 'Required rights documentation missing, expired or invalid'; end if;
  end loop;
 end loop;
 return o;
end $$;
create function public.publish_licensing_offer(p_actor uuid,p_track uuid,p_license uuid,p_rights jsonb,p_terms jsonb,p_financial jsonb,p_reference text)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; seller uuid; h jsonb; pool text; total bigint; controlled bigint; n integer;
begin
 perform licensing_private.require_admin(p_actor);
 perform 1 from public.tracks where id=p_track for update;
 select artist_user_id into strict seller from public.tracks where id=p_track and status='approved';
 if octet_length(p_rights::text)>100000 or octet_length(p_terms::text)>150000 or octet_length(p_financial::text)>50000
 or length(coalesce(p_reference,'')) not between 5 and 500 then raise exception 'Bounded reviewed licensing data required'; end if;
 perform licensing_private.check_party(p_rights->'seller');
 if p_rights#>>'{seller,userId}' is distinct from seller::text or length(coalesce(p_rights->>'recordingIdentifier','')) not between 2 and 100
 or length(coalesce(p_rights->>'workIdentifier','')) not between 2 and 100 then raise exception 'Seller and separate recording/work identities required'; end if;
 foreach pool in array array['master','publishing'] loop
  if jsonb_typeof(p_rights->pool) is distinct from 'array' or jsonb_array_length(p_rights->pool) not between 1 and 50 then raise exception 'Independent master and publishing pools required'; end if;
  total:=0;controlled:=0;
  for h in select value from jsonb_array_elements(p_rights->pool) loop
   perform licensing_private.check_party(h->'party');
   if length(coalesce(h#>>'{party,id}','')) not between 2 and 100 or h->>'authority' is null or h->>'authority' not in ('owner','agent','exclusive_controller')
   or coalesce(h->>'ownershipBps','') !~ '^[0-9]{1,5}$' or coalesce(h->>'controlledBps','') !~ '^[0-9]{1,5}$'
   or (h->>'ownershipBps')::int not between 1 and 10000 or (h->>'controlledBps')::int not between 1 and (h->>'ownershipBps')::int
   or not exists(select 1 from licensing_private.evidence where id=(h->>'evidenceId')::uuid) then raise exception 'Documented ownership and licensing authority required'; end if;
   total:=total+(h->>'ownershipBps')::int;controlled:=controlled+(h->>'controlledBps')::int;
  end loop;
  select count(distinct value#>>'{party,id}') into n from jsonb_array_elements(p_rights->pool);
  if total<>10000 or controlled<>10000 or n<>jsonb_array_length(p_rights->pool) then raise exception 'Each independent rights pool must be completely controlled without duplicates'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements((p_rights->'master')||(p_rights->'publishing')) r
 group by r#>>'{party,id}' having count(distinct r->'party')>1) then raise exception 'Rightsholder identity conflicts across rights pools'; end if;
 if jsonb_typeof(p_rights#>'{scope,uses}') is distinct from 'array' or jsonb_array_length(p_rights#>'{scope,uses}') not between 1 and 50
 or jsonb_typeof(p_rights#>'{scope,territories}') is distinct from 'array' or jsonb_array_length(p_rights#>'{scope,territories}') not between 1 and 250
 or jsonb_typeof(p_rights#>'{scope,restrictions}') is distinct from 'array'
 or jsonb_typeof(p_rights#>'{scope,excludedUses}') is distinct from 'array'
 or (p_rights#>>'{scope,validFrom}') is null or (p_rights#>>'{scope,validUntil}') is null
 then raise exception 'Explicit rights scope and restrictions required'; end if;
 if exists(select 1 from jsonb_array_elements((p_rights#>'{scope,uses}')||(p_rights#>'{scope,territories}')||(p_rights#>'{scope,restrictions}')||(p_rights#>'{scope,excludedUses}')) v
 where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 2000) then raise exception 'Bounded textual scope required'; end if;
 if jsonb_typeof(p_rights#>'{scope,outsideClearances}') is distinct from 'array' or jsonb_array_length(p_rights#>'{scope,outsideClearances}')<>5
 or exists(select 1 from unnest(array['public_performance','distribution','third_party_samples','performer_likeness','other_permissions']) k
 where (select count(*) from jsonb_array_elements(p_rights#>'{scope,outsideClearances}') c where c->>'kind'=k)<>1)
 or exists(select 1 from jsonb_array_elements(p_rights#>'{scope,outsideClearances}') c
 where c->>'responsibility' is null or c->>'responsibility' not in ('included','excluded','buyer_responsibility','not_applicable') or length(coalesce(c->>'description','')) not between 5 and 2000)
 then raise exception 'Explicit outside-clearance responsibility mapping required'; end if;
 if length(coalesce(p_terms->>'version','')) not between 2 and 100 or length(coalesce(p_terms->>'body','')) not between 30 and 100000
 or length(coalesce(p_terms->>'platformRole','')) not between 5 and 1000
 or length(coalesce(p_terms->>'approvalReference','')) not between 5 and 500
 or jsonb_typeof(p_terms->'requiredConsents') is distinct from 'array' or jsonb_array_length(p_terms->'requiredConsents') not between 1 and 20
 or p_terms->>'acceptUntil' is null or p_terms->>'issueUntil' is null or (p_terms->>'acceptUntil')::timestamptz<=clock_timestamp()
 or (p_terms->>'issueUntil')::timestamptz<(p_terms->>'acceptUntil')::timestamptz
 then raise exception 'Explicit approved versioned legal text and consent requirements required'; end if;
 if exists(select 1 from jsonb_array_elements(p_terms->'requiredConsents') v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 5 and 2000)
 then raise exception 'Explicit textual consent requirements required'; end if;
 if coalesce(p_financial->>'commissionBps','') !~ '^[0-9]{1,5}$' or (p_financial->>'commissionBps')::int not between 0 and 10000
 or length(coalesce(p_financial->>'policyVersion','')) not between 2 and 100
 or length(coalesce(p_financial->>'approvalReference','')) not between 5 and 500
 or jsonb_typeof(p_financial->'allocations') is distinct from 'array' or jsonb_array_length(p_financial->'allocations') not between 1 and 50
 then raise exception 'Approved explicit fee and payee policy required'; end if;
 total:=0;
 for h in select value from jsonb_array_elements(p_financial->'allocations') loop
  if length(coalesce(h->>'partyId','')) not between 2 and 100 or coalesce(h->>'bps','') !~ '^[0-9]{1,5}$' or (h->>'bps')::int not between 1 and 10000
 or not exists(select 1 from jsonb_array_elements((p_rights->'master')||(p_rights->'publishing')) r where r#>>'{party,id}'=h->>'partyId') then raise exception 'Identified payee allocations required'; end if;
  total:=total+(h->>'bps')::int;
 end loop;
 select count(distinct value->>'partyId') into n from jsonb_array_elements(p_financial->'allocations');
 if total<>10000 or n<>jsonb_array_length(p_financial->'allocations') then raise exception 'Complete unique payee allocation required'; end if;
 insert into licensing_private.offers(track_id,license_type_id,seller_user_id,source_hash,rights_epoch,license_exclusive,rights,terms,financial,reviewed_by,review_reference)
 values(p_track,p_license,seller,licensing_private.rights_source(p_track),
 coalesce((select prior.rights_epoch+case when prior.rights=p_rights then 0 else 1 end from licensing_private.offer_heads h join licensing_private.offers prior on prior.id=h.offer_id where h.track_id=p_track and h.license_type_id=p_license),1),
 (select exclusive from public.license_types where id=p_license),p_rights,p_terms,p_financial,p_actor,p_reference) returning id into result;
 insert into licensing_private.offer_heads values(p_track,p_license,result) on conflict(track_id,license_type_id) do update set offer_id=excluded.offer_id;
 perform licensing_private.check_offer(result,clock_timestamp());
 return result;
end $$;

create function public.invalidate_licensing_review(p_actor uuid,p_kind text,p_id uuid,p_state text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform licensing_private.require_admin(p_actor);
 if length(coalesce(p_reason,'')) not between 5 and 1000 then raise exception 'Review reason required'; end if;
 if p_kind='offer' then perform 1 from licensing_private.offers where id=p_id for update;
 elsif p_kind='evidence' then perform 1 from licensing_private.evidence where id=p_id for update;
 else raise exception 'Invalid review kind'; end if;
 if not found then raise exception 'Review not found'; end if;
 insert into licensing_private.status_events(kind,resource_id,state,actor_id,reason) values(p_kind,p_id,p_state,p_actor,p_reason);
end $$;

create function public.prepare_purchase_quote(p_track uuid,p_license uuid,p_buyer jsonb,p_usage jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid; o licensing_private.offers; schedule jsonb; q licensing_private.quotes; t public.tracks; l public.license_types;
 price bigint; fee bigint; net bigint; allocated bigint:=0; allocations jsonb:='[]'; h jsonb; amount bigint; i integer:=0;
begin
 buyer:=licensing_private.buyer(); perform licensing_private.check_party(p_buyer);
 if p_buyer-array['legalName','entityType','jurisdiction','address','registrationNumber','representative','capacity']<>'{}'::jsonb
 or p_usage-array['project','use','territory','startsAt','endsAt']<>'{}'::jsonb
 or exists(select 1 from unnest(array['representative','capacity']) k where jsonb_typeof(p_buyer->k) is distinct from 'string')
 or exists(select 1 from unnest(array['project','use','territory','startsAt','endsAt']) k where jsonb_typeof(p_usage->k) is distinct from 'string')
 then raise exception 'Explicit textual buyer and usage fields required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(buyer::text,3));
 if not exists(select 1 from auth.users where id=buyer and length(email) between 5 and 254 and position('@' in email)>1)
 then raise exception 'Identified buyer account email required'; end if;
 if (select count(*) from licensing_private.quotes where buyer_id=buyer and created_at>clock_timestamp()-interval '1 minute')>=10
 or (select count(*) from licensing_private.quotes where buyer_id=buyer and created_at>clock_timestamp()-interval '1 day')>=100
 then raise exception 'Transaction review rate limit reached'; end if;
 if octet_length(p_buyer::text)>5000 or octet_length(p_usage::text)>5000 or length(coalesce(p_buyer->>'representative','')) not between 2 and 200
 or length(coalesce(p_buyer->>'capacity','')) not between 2 and 200 then raise exception 'Identified representative and capacity required'; end if;
 if length(coalesce(p_usage->>'project','')) not between 2 and 200 or p_usage->>'use' is null or p_usage->>'territory' is null
 or p_usage->>'startsAt' is null or p_usage->>'endsAt' is null or (p_usage->>'endsAt')::timestamptz<=(p_usage->>'startsAt')::timestamptz
 or (p_usage->>'endsAt')::timestamptz<=clock_timestamp()
 then raise exception 'Complete project, use, territory and dates required'; end if;
 select * into o from licensing_private.check_offer((select offer_id from licensing_private.offer_heads where track_id=p_track and license_type_id=p_license),(p_usage->>'endsAt')::timestamptz);
 if o.id is null then raise exception 'Reviewed rights and legal terms are unavailable'; end if;
 if not (o.rights#>'{scope,uses}') ? (p_usage->>'use') or (o.rights#>'{scope,excludedUses}') ? (p_usage->>'use')
 or not (o.rights#>'{scope,territories}') ? (p_usage->>'territory')
 or (p_usage->>'startsAt')::timestamptz<(o.rights#>>'{scope,validFrom}')::timestamptz
 or (o.terms->>'acceptUntil')::timestamptz<=clock_timestamp() then raise exception 'Requested usage or legal terms are not eligible'; end if;
 select * into strict t from public.tracks where id=p_track;
 select * into strict l from public.license_types where id=p_license;
 select coalesce(price_cents,l.default_price_cents) into price from public.track_license_options where track_id=p_track and license_type_id=p_license and active;
 if price is null or price<=0 then raise exception 'Trusted price unavailable'; end if;
 fee:=(price*(o.financial->>'commissionBps')::int+5000)/10000; net:=price-fee;
 for h in select value from jsonb_array_elements(o.financial->'allocations') loop
  i:=i+1;amount:=case when i=jsonb_array_length(o.financial->'allocations') then net-allocated else net*(h->>'bps')::int/10000 end;
  allocations:=allocations||jsonb_build_array(h||jsonb_build_object('amountCents',amount));allocated:=allocated+amount;
 end loop;
 schedule:=jsonb_build_object('schemaVersion','TSE-PURCHASE-1','buyer',p_buyer||jsonb_build_object('userId',buyer,'email',(select email from auth.users where id=buyer)),
 'offerId',o.id,'seller',o.rights->'seller','rights',o.rights,'rightsReviewGeneration',o.rights_epoch,'rightsSourceHash',o.source_hash,'rightsReviewedAt',o.created_at,'rightsReviewedBy',o.reviewed_by,'rightsReviewReference',o.review_reference,
 'track',jsonb_build_object('id',t.id,'title',t.title,'recordingIdentifier',o.rights->>'recordingIdentifier','workIdentifier',o.rights->>'workIdentifier'),
 'license',jsonb_build_object('id',l.id,'name',l.name,'slug',l.slug,'exclusive',l.exclusive),'usage',p_usage,'terms',o.terms,
 'termsHash',licensing_private.hash_json(o.terms),'documentSha256',encode(sha256(convert_to(o.terms->>'body','UTF8')),'hex'),
 'rightsEvidence',(select jsonb_agg(jsonb_build_object('id',e.id,'sha256',e.sha256,'reviewedAt',e.reviewed_at,'reviewedBy',e.reviewed_by,'validUntil',e.valid_until,'objectVersion',e.object_version) order by e.id)
 from licensing_private.evidence e where e.id in (select (r->>'evidenceId')::uuid from jsonb_array_elements((o.rights->'master')||(o.rights->'publishing')) r)),
 'amountCents',price,'currency','USD','financial',o.financial||jsonb_build_object('platformFeeCents',fee,'allocations',allocations));
 insert into licensing_private.quotes(buyer_id,offer_id,schedule,schedule_hash) values(buyer,o.id,schedule,licensing_private.hash_json(schedule)) returning * into q;
 return jsonb_build_object('id',q.id,'schedule',q.schedule,'hash',q.schedule_hash,'expiresAt',q.expires_at);
end $$;

create function public.read_purchase_quote(p_quote uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid; q licensing_private.quotes; a licensing_private.acceptances;
begin
 buyer:=licensing_private.buyer();select * into strict q from licensing_private.quotes where id=p_quote and buyer_id=buyer;
 select * into a from licensing_private.acceptances where quote_id=q.id and buyer_id=buyer;
 return jsonb_build_object('id',q.id,'schedule',q.schedule,'hash',q.schedule_hash,'expiresAt',q.expires_at,'acceptedAt',a.accepted_at,'orderId',a.order_id);
end $$;
create function public.read_licensing_choices(p_track uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare h record; o licensing_private.offers; result jsonb:='[]';
begin
 perform licensing_private.buyer();
 for h in select offer_id from licensing_private.offer_heads where track_id=p_track loop
  begin
   o:=licensing_private.check_offer(h.offer_id,clock_timestamp());
   if (o.terms->>'acceptUntil')::timestamptz>clock_timestamp() then
    result:=result||jsonb_build_array(jsonb_build_object('licenseId',o.license_type_id,'uses',o.rights#>'{scope,uses}','territories',o.rights#>'{scope,territories}'));
   end if;
  exception when others then null;end;
 end loop;
 return result;
end $$;
create function public.accept_purchase_quote(p_quote uuid,p_hash text,p_consents jsonb,p_representative text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid; q licensing_private.quotes; a licensing_private.acceptances; o public.orders; offer licensing_private.offers; n int; snapshot jsonb;
begin
 buyer:=licensing_private.buyer();select * into strict q from licensing_private.quotes where id=p_quote and buyer_id=buyer for update;
 if p_hash is distinct from q.schedule_hash or p_consents is distinct from q.schedule#>'{terms,requiredConsents}'
 or p_representative is distinct from q.schedule#>>'{buyer,representative}' then raise exception 'Exact transaction terms and representative acceptance required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(buyer::text||':'||(q.schedule#>>'{track,id}')||':'||(q.schedule#>>'{license,id}'),0));
 select * into a from licensing_private.acceptances where quote_id=q.id;
 if found then
  select * into strict o from public.orders where id=a.order_id and buyer_user_id=buyer;
  return to_jsonb(o)||jsonb_build_object('created_new',false);
 end if;
 if q.expires_at<=clock_timestamp() then raise exception 'Quote expired; review a new transaction schedule'; end if;
 offer:=licensing_private.check_offer(q.offer_id,(q.schedule#>>'{usage,endsAt}')::timestamptz);
 if (offer.terms->>'acceptUntil')::timestamptz<=clock_timestamp() or not exists(select 1 from licensing_private.offer_heads where offer_id=q.offer_id)
 then raise exception 'Legal terms superseded or expired before acceptance'; end if;
 if exists(select 1 from public.orders where buyer_user_id=buyer and track_id=offer.track_id and license_type_id=offer.license_type_id and status in ('paid','fulfilled','refunded'))
 then raise exception 'Existing purchase requires review before repeat licensing'; end if;
 select count(*) into n from public.orders where buyer_user_id=buyer and track_id=offer.track_id and license_type_id=offer.license_type_id and status='pending' and checkout_closed_at is null;
 if n>0 then raise exception 'Pending purchase must resume its original acceptance; reconciliation required'; end if;
 insert into public.orders(buyer_user_id,track_id,license_type_id,amount_cents,currency,status)
 values(buyer,offer.track_id,offer.license_type_id,(q.schedule->>'amountCents')::int,q.schedule->>'currency','pending') returning * into o;
 snapshot:=q.schedule||jsonb_build_object('orderId',o.id,'quoteId',q.id,'quotedAt',q.created_at,
 'acceptance',jsonb_build_object('buyerId',buyer,'acceptedAt',clock_timestamp(),'method','authenticated_transaction_review','scheduleHash',q.schedule_hash,
 'termsHash',q.schedule->>'termsHash','documentVersion',q.schedule#>>'{terms,version}','representative',p_representative,'capacity',q.schedule#>>'{buyer,capacity}',
 'consents',p_consents,'sessionId',auth.jwt()->>'session_id','statement','I accept this transaction schedule and its exact license terms, and confirm my identity and authority for the stated legal party.'));
 insert into licensing_private.acceptances(order_id,quote_id,buyer_id,snapshot,snapshot_hash)
 values(o.id,q.id,buyer,snapshot,licensing_private.hash_json(snapshot));
 insert into public.order_activity_log(order_id,actor_id,source,event_type,message,metadata)
 values(o.id,buyer,'buyer','transaction_terms_accepted','Buyer accepted the exact transaction schedule and versioned terms.',jsonb_build_object('quoteId',q.id,'snapshotHash',licensing_private.hash_json(snapshot),'termsVersion',q.schedule#>>'{terms,version}'));
 return to_jsonb(o)||jsonb_build_object('created_new',true);
end $$;

create function licensing_private.assert_purchase(p_order uuid,p_paid boolean) returns licensing_private.acceptances
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
 return a;
end $$;
create function public.read_accepted_purchase(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a licensing_private.acceptances;
begin
 if auth.role()='service_role' then select * into strict a from licensing_private.acceptances where order_id=p_order;
 else select * into strict a from licensing_private.acceptances where order_id=p_order and buyer_id=licensing_private.buyer(); end if;
 return jsonb_build_object('snapshot',a.snapshot,'hash',a.snapshot_hash,'acceptedAt',a.accepted_at);
end $$;
create function public.assert_accepted_purchase(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a licensing_private.acceptances;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 a:=licensing_private.assert_purchase(p_order,false);return jsonb_build_object('snapshot',a.snapshot,'hash',a.snapshot_hash);
end $$;

create function licensing_private.guard_checkout() returns trigger language plpgsql security definer set search_path='' as $$
begin perform licensing_private.assert_purchase(new.order_id,false);return new;end $$;
create trigger legal_checkout before insert on checkout_recovery.attempts for each row execute function licensing_private.guard_checkout();
create function licensing_private.guard_agreement_job() returns trigger language plpgsql security definer set search_path='' as $$
begin perform licensing_private.assert_purchase(new.order_id,true);return new;end $$;
create trigger legal_agreement_job before insert or update on checkout_recovery.agreement_jobs for each row execute function licensing_private.guard_agreement_job();
create function licensing_private.guard_license() returns trigger language plpgsql security definer set search_path='' as $$
declare a licensing_private.acceptances;
begin
 if tg_op='UPDATE' and old.status='generated' and (to_jsonb(new)-array['downloaded_at','updated_at']) is distinct from (to_jsonb(old)-array['downloaded_at','updated_at'])
 then raise exception 'Issued license is immutable; use a separately reviewed amendment'; end if;
 if new.status='generated' and (tg_op='INSERT' or old.status<>'generated') then
  a:=licensing_private.assert_purchase(new.order_id,true);
  if new.terms_snapshot_json->'purchase' is distinct from a.snapshot or new.terms_snapshot_json->>'purchaseHash' is distinct from a.snapshot_hash
  then raise exception 'Generated license must incorporate exact accepted purchase'; end if;
  if not exists(select 1 from checkout_recovery.agreement_jobs j where j.order_id=new.order_id and not j.done and j.lease_until>clock_timestamp()
    and new.pdf_storage_path=new.buyer_id::text||'/'||new.order_id::text||'/'||j.token::text||'.pdf')
  or new.pdf_content_type is distinct from 'application/pdf' or coalesce(new.pdf_size_bytes,0)<=0
  then raise exception 'Fenced agreement job and complete artifact required'; end if;
 end if;
 return new;
end $$;
create trigger legal_license before insert or update on public.generated_licenses for each row execute function licensing_private.guard_license();
create trigger retain_issued_license before delete on public.generated_licenses for each row execute function licensing_private.immutable();
create function licensing_private.guard_entitlement() returns trigger language plpgsql security definer set search_path='' as $$
begin if new.state='active' then perform licensing_private.assert_purchase(new.order_id,true);end if;return new;end $$;
create trigger legal_entitlement before insert or update on public.order_asset_entitlements for each row execute function licensing_private.guard_entitlement();
create function licensing_private.freeze_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='fulfilled' and old.status<>'fulfilled' then
  perform licensing_private.assert_purchase(old.id,true);
  if not exists(select 1 from public.generated_licenses where order_id=old.id and status='generated') then raise exception 'Accepted generated license required'; end if;
 end if;
 if exists(select 1 from licensing_private.acceptances where order_id=old.id) and
 (new.buyer_user_id,new.track_id,new.license_type_id,new.amount_cents,new.currency) is distinct from
 (old.buyer_user_id,old.track_id,old.license_type_id,old.amount_cents,old.currency) then raise exception 'Accepted transaction facts are immutable'; end if;
 return new;
end $$;
create trigger legal_order before update on public.orders for each row execute function licensing_private.freeze_order();

-- Serialize legacy rights writes with review/issuance, without blocking normal
-- editing. Any changed rights/recording source hash invalidates the old review.
create function licensing_private.lock_rights_track() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.tracks where id=case when tg_op='DELETE' then old.track_id else new.track_id end for update;
 if not found then return case when tg_op='DELETE' then old else new end;end if;
 if tg_op<>'UPDATE' or (to_jsonb(new)-array['created_at','updated_at']) is distinct from (to_jsonb(old)-array['created_at','updated_at']) then
  insert into licensing_private.rights_revisions values(case when tg_op='DELETE' then old.track_id else new.track_id end,1)
  on conflict(track_id) do update set revision=licensing_private.rights_revisions.revision+1;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger licensing_rights_serialization before insert or update or delete on public.rights_holders for each row execute function licensing_private.lock_rights_track();
create function licensing_private.revise_track_rights() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.artist_user_id,new.audio_file_path,new.status) is distinct from (old.artist_user_id,old.audio_file_path,old.status) then
  insert into licensing_private.rights_revisions values(old.id,1) on conflict(track_id) do update set revision=licensing_private.rights_revisions.revision+1;
 end if;return new;
end $$;
create trigger licensing_track_revision before update on public.tracks for each row execute function licensing_private.revise_track_rights();
create function licensing_private.guard_evidence_object() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from licensing_private.evidence where object_id=old.id) and
 (tg_op='DELETE' or (new.bucket_id,new.name,new.version,new.metadata) is distinct from (old.bucket_id,old.name,old.version,old.metadata))
 then raise exception 'Reviewed rights evidence object is immutable'; end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger licensing_evidence_object before update or delete on storage.objects for each row execute function licensing_private.guard_evidence_object();

-- Preserve the existing delivery predicate and add legal eligibility in place,
-- so existing RLS expressions referencing its OID also receive this guard.
create function licensing_private.can_use_purchase(p_order uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin perform licensing_private.assert_purchase(p_order,true);return true;
exception when others then return false;end $$;
create or replace function commerce_private.can_deliver(p_entitlement uuid,p_buyer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.order_asset_entitlements n
 join public.order_delivery_contracts c on c.id=n.contract_id
 join commerce_private.asset_versions a on a.id=n.asset_version_id
 join commerce_private.order_states s on s.contract_id=c.id
 join commerce_private.payment_events e on e.id=s.event_id and e.contract_id=c.id
 join commerce_private.qa_fixture_designations q on q.asset_version_id=a.id and q.buyer_user_id=c.buyer_user_id
 join public.user_profiles u on u.id=c.buyer_user_id and u.role='buyer'
 join public.generated_licenses g on g.order_id=c.order_id and g.buyer_id=c.buyer_user_id
   and g.track_id=c.track_id and g.license_type_id=c.license_type_id and g.status='generated' and g.pdf_storage_path is not null
 cross join commerce_private.capabilities f
 where n.id=p_entitlement and n.buyer_user_id=p_buyer and n.state='active'
 and f.foundation_enabled and f.entitlement_activation_enabled
 and s.state in ('PAID','FULFILLED') and e.payment_state='PAID'
 and a.state='ready' and a.approval_state='approved' and a.retired_at is null and q.revoked_at is null
 and not c.commercial_rights_granted and c.payment_mode='test'
 and g.terms_snapshot_json->'payment'->>'paymentMode'='test'
 and g.terms_snapshot_json->'payment'->>'commercialRightsGranted'='false'
 and g.terms_snapshot_json->'license'->>'pricePaidCents'=c.amount_minor::text
 and g.terms_snapshot_json->'license'->>'currency'=c.currency
 and licensing_private.can_use_purchase(c.order_id));
$$;

revoke all on all tables in schema licensing_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema licensing_private from public,anon,authenticated,service_role;
revoke all on all functions in schema licensing_private from public,anon,authenticated,service_role;
revoke all on function public.register_licensing_evidence(uuid,uuid,text,text,timestamptz),public.publish_licensing_offer(uuid,uuid,uuid,jsonb,jsonb,jsonb,text),
 public.invalidate_licensing_review(uuid,text,uuid,text,text),public.assert_accepted_purchase(uuid) from public,anon,authenticated;
grant execute on function public.register_licensing_evidence(uuid,uuid,text,text,timestamptz),public.publish_licensing_offer(uuid,uuid,uuid,jsonb,jsonb,jsonb,text),
 public.invalidate_licensing_review(uuid,text,uuid,text,text),public.assert_accepted_purchase(uuid) to service_role;
revoke all on function public.prepare_purchase_quote(uuid,uuid,jsonb,jsonb),public.read_purchase_quote(uuid),public.accept_purchase_quote(uuid,text,jsonb,text),public.read_licensing_choices(uuid) from public,anon,service_role;
grant execute on function public.prepare_purchase_quote(uuid,uuid,jsonb,jsonb),public.read_purchase_quote(uuid),public.accept_purchase_quote(uuid,text,jsonb,text),public.read_licensing_choices(uuid) to authenticated;
revoke all on function public.read_accepted_purchase(uuid) from public,anon;
grant execute on function public.read_accepted_purchase(uuid) to authenticated,service_role;
commit;
