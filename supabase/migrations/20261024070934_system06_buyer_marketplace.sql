-- System 06: Buyer-only marketplace projections and authenticated preview mediation.
-- No capability activation, bucket changes, legal changes, or historical rewriting.
begin;
do $$begin if current_user<>'postgres' or to_regprocedure('catalog_private.visible(uuid)') is null then raise exception 'Verified postgres installer and System05 required' using errcode='55000';end if;end$$;
create function catalog_private.marketplace_buyer() returns uuid language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or not exists(select 1 from public.user_profiles where id=auth.uid() and role='buyer') then raise exception 'Buyer marketplace denied' using errcode='42501';end if;return auth.uid();end$$;
create or replace function public.catalog_search(p_filters jsonb default '{}',p_page integer default 1,p_size integer default 20,p_sort text default 'title') returns jsonb language plpgsql security definer set search_path='' as $$
declare items jsonb;n int;k text;f jsonb;begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or not exists(select 1 from public.user_profiles where id=auth.uid() and (role='buyer' or role='admin' and public.is_admin())) then raise exception 'Catalog search denied' using errcode='42501';end if;
 if jsonb_typeof(p_filters) is distinct from 'object' or p_filters-array['query','artist','title','genre','subgenre','mood','bpmMin','bpmMax','key','durationMin','durationMax','vocal','explicit','language','keyword','license','artistId','slug','savedOnly','exclude']<>'{}' or octet_length(p_filters::text)>3000 or p_page is null or p_page not between 1 and 10000 or p_size is null or p_size not between 1 and 50 or p_sort is null or p_sort not in('title','newest','bpm','duration','relevance','featured','price','tempo-high') then raise exception 'Invalid catalog search' using errcode='22023';end if;
 for k,f in select key,value from jsonb_each(p_filters) loop
  if k in('bpmMin','bpmMax','durationMin','durationMax') then if jsonb_typeof(f)<>'number' or f#>>'{}'!~'^[0-9]{1,5}$' or (f#>>'{}')::int>(case when k in('bpmMin','bpmMax') then 400 else 36000 end) then raise exception 'Invalid search range' using errcode='22023';end if;
  elsif jsonb_typeof(f)<>'string' or length(f#>>'{}') not between 1 and 200 or f#>>'{}'~'[[:cntrl:]]' then raise exception 'Invalid search text' using errcode='22023';end if;
 end loop;
 if coalesce((p_filters->>'bpmMin')::int,0)>coalesce((p_filters->>'bpmMax')::int,36000) or coalesce((p_filters->>'durationMin')::int,0)>coalesce((p_filters->>'durationMax')::int,36000) or p_filters ? 'license' and p_filters->>'license'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or p_filters ? 'vocal' and p_filters->>'vocal' not in('instrumental','vocal','mixed') or p_filters ? 'explicit' and p_filters->>'explicit' not in('clean','explicit') then raise exception 'Invalid search filter value' using errcode='22023';end if;
 if p_filters ? 'savedOnly' and p_filters->>'savedOnly'<>'true' or p_filters ? 'artistId' and p_filters->>'artistId'!~'^[0-9a-f-]{36}$' or p_filters ? 'exclude' and p_filters->>'exclude'!~'^[0-9a-f-]{36}$' then raise exception 'Invalid marketplace filter' using errcode='22023';end if;
 with eligible as materialized (
  select t.id,t.slug,t.featured,d.metadata,d.created_at,d.search_document,catalog_private.available_licenses(t.id) as licenses from catalog_private.cases c join public.tracks t on t.id=c.track_id join catalog_private.decisions d on d.id=c.approved_decision
  where c.state='published' and catalog_private.visible(t.id)
  and (not p_filters ? 'artistId' or exists(select 1 from public.artist_profiles a where a.user_id=t.artist_user_id and a.id::text=p_filters->>'artistId'))
  and (not p_filters ? 'slug' or t.slug=p_filters->>'slug')
  and (not p_filters ? 'exclude' or t.id::text<>p_filters->>'exclude')
  and (not p_filters ? 'savedOnly' or exists(select 1 from public.favorites f where f.buyer_user_id=auth.uid() and f.track_id=t.id))
  and (not p_filters ? 'query' or d.search_document@@plainto_tsquery('simple',p_filters->>'query') or position(lower(p_filters->>'query') in lower(d.metadata->>'title'))>0 or position(lower(p_filters->>'query') in lower(d.metadata->>'artist'))>0)
  and (not p_filters ? 'artist' or position(lower(p_filters->>'artist') in lower(d.metadata->>'artist'))>0 or exists(select 1 from jsonb_array_elements(d.metadata->'credits') credit where credit->>'role' in('primary_artist','featured_artist') and position(lower(p_filters->>'artist') in lower(credit->>'name'))>0))
  and (not p_filters ? 'title' or position(lower(p_filters->>'title') in lower(d.metadata->>'title'))>0)
  and (not p_filters ? 'genre' or lower(d.metadata->>'genre')=lower(p_filters->>'genre'))
  and (not p_filters ? 'subgenre' or lower(d.metadata->>'subgenre')=lower(p_filters->>'subgenre'))
  and (not p_filters ? 'mood' or exists(select 1 from jsonb_array_elements_text(d.metadata->'moods') v where lower(v)=lower(p_filters->>'mood')))
  and (not p_filters ? 'keyword' or exists(select 1 from jsonb_array_elements_text(d.metadata->'keywords') v where lower(v)=lower(p_filters->>'keyword')))
  and (not p_filters ? 'bpmMin' or (d.metadata->>'bpm')::int>=(p_filters->>'bpmMin')::int) and (not p_filters ? 'bpmMax' or (d.metadata->>'bpm')::int<=(p_filters->>'bpmMax')::int)
  and (not p_filters ? 'durationMin' or (d.metadata->>'durationSeconds')::int>=(p_filters->>'durationMin')::int) and (not p_filters ? 'durationMax' or (d.metadata->>'durationSeconds')::int<=(p_filters->>'durationMax')::int)
  and (not p_filters ? 'key' or lower(d.metadata->>'musicalKey')=lower(p_filters->>'key')) and (not p_filters ? 'vocal' or d.metadata->>'vocal'=p_filters->>'vocal')
  and (not p_filters ? 'explicit' or d.metadata->>'explicit'=p_filters->>'explicit') and (not p_filters ? 'language' or lower(d.metadata->>'language')=lower(p_filters->>'language'))
 ),filtered as materialized(select *, (select min(coalesce(o.price_cents,l.default_price_cents)) from public.track_license_options o join public.license_types l on l.id=o.license_type_id where o.track_id=eligible.id and o.license_type_id=any(eligible.licenses) and (not p_filters ? 'license' or o.license_type_id::text=p_filters->>'license')) price from eligible where not p_filters ? 'license' or (p_filters->>'license')::uuid=any(licenses)),page as (
  select *,row_number() over(order by case when p_sort='relevance' and p_filters ? 'query' then ts_rank(search_document,plainto_tsquery('simple',p_filters->>'query')) end desc,
  case when p_sort='featured' then featured end desc,case when p_sort='price' then price end asc,case when p_sort='tempo-high' then (metadata->>'bpm')::int end desc nulls last,case when p_sort='newest' then created_at end desc,case when p_sort='bpm' then (metadata->>'bpm')::int end asc nulls last,case when p_sort='duration' then (metadata->>'durationSeconds')::int end asc,
  lower(metadata->>'title'),id) as ordinal from filtered order by case when p_sort='relevance' and p_filters ? 'query' then ts_rank(search_document,plainto_tsquery('simple',p_filters->>'query')) end desc,
  case when p_sort='featured' then featured end desc,case when p_sort='price' then price end asc,case when p_sort='tempo-high' then (metadata->>'bpm')::int end desc nulls last,case when p_sort='newest' then created_at end desc,case when p_sort='bpm' then (metadata->>'bpm')::int end asc nulls last,case when p_sort='duration' then (metadata->>'durationSeconds')::int end asc,
  lower(metadata->>'title'),id limit p_size offset (p_page-1)*p_size
 )select (select count(*) from filtered),coalesce(jsonb_agg(jsonb_build_object('id',id,'slug',slug,'metadata',metadata,'licenseTypes',to_jsonb(licenses)) order by ordinal),'[]') into n,items from page;
 return jsonb_build_object('items',items,'total',n,'page',p_page,'page_size',p_size,'page_count',ceil(n::numeric/p_size));end$$;

-- Exact reviewed offer presentation, with no ownership contacts/evidence/storage locators.
create function catalog_private.marketplace_track(p_track uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tracks;a public.artist_profiles;m jsonb;options jsonb;begin
 if not catalog_private.visible(p_track) then return null;end if;
 select * into t from public.tracks where id=p_track;select * into a from public.artist_profiles where user_id=t.artist_user_id;
 select d.metadata into m from catalog_private.cases c join catalog_private.decisions d on d.id=c.approved_decision where c.track_id=t.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'slug',l.slug,'description',l.description,'terms_summary',l.terms_summary,'exclusive',l.exclusive,'active',true,'offer_active',true,'track_license_option_id',x.id,'amount_cents',coalesce(x.price_cents,l.default_price_cents),'base_price',l.default_price_cents/100.0,'price_override',x.price_cents/100.0,
 'reviewed_scope',jsonb_build_object('uses',o.rights#>'{scope,uses}','territories',o.rights#>'{scope,territories}','restrictions',o.rights#>'{scope,restrictions}','excludedUses',o.rights#>'{scope,excludedUses}','deliverables',coalesce((select jsonb_agg(jsonb_build_object('kind',v->>'kind','label',v->>'label')) from commerce_private.license_delivery_sets s cross join lateral jsonb_array_elements(s.manifest)v where s.offer_id=o.id),'[]'::jsonb),'noncommercialTest',o.terms->>'approvalReference' like 'SYNTHETIC%')) order by coalesce(x.price_cents,l.default_price_cents),l.id),'[]'::jsonb) into options
 from public.track_license_options x join public.license_types l on l.id=x.license_type_id join licensing_private.offer_heads h on h.track_id=t.id and h.license_type_id=l.id join licensing_private.offers o on o.id=h.offer_id
 where x.track_id=t.id and l.id=any(catalog_private.available_licenses(t.id));
 return jsonb_build_object('id',t.id,'artist_id',a.id,'artist_name',m->>'artist','title',m->>'title','slug',t.slug,'description',m->>'description','genre',m->>'genre','subgenre',m->>'subgenre','mood',m->'moods','bpm',m->'bpm','key',m->>'musicalKey','duration_seconds',m->'durationSeconds','instrumental',m->>'vocal' in('instrumental','mixed'),'vocals',m->>'vocal' in('vocal','mixed'),'explicit',m->>'explicit'='explicit','release_year',m->'releaseYear','status','approved','featured',t.featured,'created_at',t.created_at,'updated_at',t.updated_at,'rights_holders','[]'::jsonb,'license_options',options,'is_favorite',exists(select 1 from public.favorites where buyer_user_id=auth.uid() and track_id=t.id),
 'audio_file_url','/api/buyer/preview/'||t.id,'cover_art_url',case when exists(select 1 from submission_media.submissions where track_id=t.id and current_artwork_id is not null) then '/api/buyer/preview/'||t.id||'?kind=artwork' else null end,'waveform_preview_url',null,
 'catalog_metadata',jsonb_build_object('credits',m->'credits','releaseTitle',m->'releaseTitle','releaseStatus',m->'releaseStatus','releaseDate',m->'releaseDate','language',m->'language','vocal',m->'vocal','explicit',m->'explicit','keywords',m->'keywords'));
end$$;
create function public.marketplace_search(p_filters jsonb default '{}',p_page int default 1,p_size int default 20,p_sort text default 'relevance') returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;items jsonb;begin
 perform catalog_private.marketplace_buyer();result:=public.catalog_search(p_filters,p_page,p_size,p_sort);
 select coalesce(jsonb_agg(v.track order by v.ordinality),'[]') into items from (select catalog_private.marketplace_track((item->>'id')::uuid) track,ordinality from jsonb_array_elements(result->'items') with ordinality x(item,ordinality))v where v.track is not null;
 return result||jsonb_build_object('items',items);end$$;
create function public.marketplace_facets() returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform catalog_private.marketplace_buyer();
 with eligible as materialized(select d.metadata m,c.track_id,catalog_private.available_licenses(c.track_id) licenses from catalog_private.cases c join catalog_private.decisions d on d.id=c.approved_decision where c.state='published' and catalog_private.visible(c.track_id)), values as (
 select k,case when k='mood' then mood else m->>k end v from eligible cross join (values('genre'),('subgenre'),('musicalKey'),('language'),('mood'))keys(k) left join lateral jsonb_array_elements_text(case when k='mood' then m->'moods' else '[null]'::jsonb end) moods(mood) on true
 ), grouped as(select k,jsonb_agg(v order by lower(v),v) v from (select distinct k,v from values where v is not null and v<>'')x group by k)
 select coalesce(jsonb_object_agg(k,v),'{}')||jsonb_build_object('licenses',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'name',l.name) order by l.name,l.id) from public.license_types l where exists(select 1 from eligible where l.id=any(licenses))),'[]'::jsonb)) into result from grouped;return result;
end$$;
create function public.marketplace_artist(p_artist uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 perform catalog_private.marketplace_buyer();
 select jsonb_build_object('id',a.id,'name',a.artist_name,'bio',a.bio,'location',a.location,'website',a.website,'instagram',a.instagram_url,'spotify',a.spotify_url,'youtube',a.youtube_url,'trackCount',(select count(*) from public.tracks t where t.artist_user_id=a.user_id and catalog_private.visible(t.id))) into result from public.artist_profiles a where a.id=p_artist and exists(select 1 from public.tracks t where t.artist_user_id=a.user_id and catalog_private.visible(t.id));return result;
end$$;
-- Idempotent intent, canonical session identity, and current publication under row lock.
create function public.marketplace_set_favorite(p_track uuid,p_value boolean) returns boolean language plpgsql security definer set search_path='' as $$declare u uuid:=catalog_private.marketplace_buyer();begin
 if p_track is null or p_value is null then raise exception 'Favorite intent required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended('marketplace-favorites:'||u::text,0));
 perform 1 from public.tracks where id=p_track for share;
 if p_value then
  if not catalog_private.visible(p_track) then raise exception 'Track unavailable' using errcode='42501';end if;
  if (select count(*) from public.favorites where buyer_user_id=u)>=10000 and not exists(select 1 from public.favorites where buyer_user_id=u and track_id=p_track) then raise exception 'Favorite limit' using errcode='54000';end if;
  insert into public.favorites(buyer_user_id,track_id) values(u,p_track) on conflict(buyer_user_id,track_id) do nothing;
 else delete from public.favorites where buyer_user_id=u and track_id=p_track;end if;return p_value;
end$$;
create policy "Marketplace own Buyer favorites" on public.favorites as restrictive for all to authenticated using(buyer_user_id=auth.uid() and public.current_app_role()='buyer' and public.auth_session_is_active()) with check(buyer_user_id=auth.uid() and public.current_app_role()='buyer' and public.auth_session_is_active() and security_private.catalog_license_available(track_id,(select license_type_id from public.track_license_options where track_id=favorites.track_id limit 1)));
-- Only the server may see private preview locators. The session is checked twice:
-- authenticated approval, then narrowly authorized service read, then postflight.
create function public.marketplace_preview_check(p_track uuid) returns uuid language plpgsql security definer set search_path='' as $$begin
 perform catalog_private.marketplace_buyer();if not catalog_private.visible(p_track) then raise exception 'Preview unavailable' using errcode='42501';end if;return (auth.jwt()->>'session_id')::uuid;end$$;
create function public.marketplace_preview_locator(p_actor uuid,p_session uuid,p_track uuid,p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 if auth.role() is distinct from 'service_role' or p_kind is null or p_kind not in('preview','artwork') or not exists(select 1 from auth.sessions where id=p_session and user_id=p_actor) or not exists(select 1 from public.user_profiles where id=p_actor and role='buyer') or not catalog_private.visible(p_track) then raise exception 'Preview unavailable' using errcode='42501';end if;
 select jsonb_build_object('asset_id',a.id,'bucket',a.bucket,'path',a.object_path,'sha256',encode(a.sha256,'hex'),'bytes',a.storage_bytes,'version',a.storage_version,'mime',case when p_kind='preview' then 'audio/mp4' else a.storage_mime end) into result
 from submission_media.submissions s join submission_media.assets a on a.id=case when p_kind='preview' then s.current_preview_id else s.current_artwork_id end
 join storage.objects x on x.id=a.storage_object_id and x.version=a.storage_version and x.bucket_id=a.bucket and x.name=a.object_path join storage.buckets b on b.id=a.bucket and not b.public
 where s.track_id=p_track and a.kind=case when p_kind='preview' then 'buyer_preview' else 'artwork' end and a.technical_state='ready' and a.accepted_at is not null and (p_kind<>'preview' or a.source_asset_id=s.current_master_id) and a.storage_bytes between 1 and case when p_kind='preview' then 4000000 else 10000000 end;
 if result is null then raise exception 'Preview unavailable' using errcode='42501';end if;return result;end$$;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p where p.pronamespace='catalog_private'::regnamespace and p.proname like 'marketplace_%' loop execute format('revoke all on function %s from public,anon,authenticated,service_role',f);end loop;
 for f in select p.oid::regprocedure from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in('marketplace_search','marketplace_facets','marketplace_artist','marketplace_set_favorite','marketplace_preview_check') loop execute format('revoke all on function %s from public,anon,service_role',f);execute format('grant execute on function %s to authenticated',f);end loop;
end$$;
revoke all on function public.marketplace_preview_locator(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.marketplace_preview_locator(uuid,uuid,uuid,text) to service_role;
commit;
