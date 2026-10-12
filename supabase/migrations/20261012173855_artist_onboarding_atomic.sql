begin;
-- Service-only SECURITY INVOKER operations: no new RLS-bypassing function.
-- Actor identity is derived by the server; canonical role is rechecked under lock.
create schema if not exists security_private;
grant usage on schema security_private to service_role;
create or replace function security_private.validate_artist_onboarding_fields(p_step text,p_data jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare allowed text[]; k text; v text;
begin
 if p_step is null or p_step not in ('basics','profile','licensing','first-track') then
  raise exception 'Unsupported onboarding step.' using errcode='22023';
 end if;
 allowed := case p_step when 'basics' then array['fullName','artistName']
 when 'profile' then array['bio','location','website','instagram','spotify','youtube']
 when 'licensing' then array['payoutEmail','defaultLicensingPreferences']
 else array['firstTrackChoice'] end;
 if jsonb_typeof(p_data) is distinct from 'object' then
  raise exception 'Invalid onboarding fields.' using errcode='22023';
 end if;
 for k,v in select key,value from jsonb_each_text(p_data) loop
  if not (k=any(allowed)) or jsonb_typeof(p_data->k) is distinct from 'string' then
   raise exception 'Unsupported onboarding fields.' using errcode='22023';
  end if;
  if v is distinct from btrim(v) then raise exception 'Trim onboarding fields.' using errcode='22023'; end if;
 end loop;
 if p_step='basics' and (coalesce(length(p_data->>'fullName'),0) not between 2 and 120
    or coalesce(length(p_data->>'artistName'),0) not between 2 and 120) then
  raise exception 'Full name and artist name are required (2-120 characters).' using errcode='22023';
 elsif p_step='profile' then
  if coalesce(length(p_data->>'bio'),0) not between 24 and 5000 or coalesce(length(p_data->>'location'),0) not between 2 and 120 then
   raise exception 'Bio (24-5000 characters) and location (2-120 characters) are required.' using errcode='22023';
  end if;
  foreach k in array array['website','spotify','youtube'] loop
   v:=p_data->>k;
   if v is not null and v<>'' and (length(v)>2048 or v!~'^https?://[^[:space:]/?#]+[^[:space:]]*$') then
    raise exception 'Enter valid full http(s) links.' using errcode='22023';
   end if;
  end loop;
  if length(coalesce(p_data->>'instagram',''))>120 then raise exception 'Instagram handle is too long.' using errcode='22023'; end if;
 elsif p_step='licensing' and (coalesce(p_data->>'payoutEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
     or length(p_data->>'payoutEmail')>254 or length(coalesce(p_data->>'defaultLicensingPreferences',''))>3000) then
  raise exception 'A valid payout email and bounded preferences are required.' using errcode='22023';
 elsif p_step='first-track' and coalesce(p_data->>'firstTrackChoice','') not in ('upload','later') then
  raise exception 'Choose upload or later.' using errcode='22023';
 end if;
end;$$;
revoke all on function security_private.validate_artist_onboarding_fields(text,jsonb) from public,anon,authenticated;
grant execute on function security_private.validate_artist_onboarding_fields(text,jsonb) to service_role;

create or replace function public.save_artist_onboarding_atomic(
 p_actor_id uuid,p_expected_updated_at timestamptz,p_step text,p_data jsonb,p_avatar_path text default null
) returns timestamptz language plpgsql security invoker set search_path='' as $$
declare prior public.user_profiles%rowtype; progress text[]:=array['basics','profile','licensing','first-track','complete']; next_step text; patch jsonb; result_at timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted artist workflow required.' using errcode='42501'; end if;
 perform security_private.validate_artist_onboarding_fields(p_step,p_data);
 select * into prior from public.user_profiles where id=p_actor_id for update;
 if not found or prior.role is distinct from 'artist' then raise exception 'Canonical artist access required.' using errcode='42501'; end if;
 if p_expected_updated_at is null or prior.updated_at is distinct from p_expected_updated_at then
  raise exception 'Onboarding changed. Reload before saving.' using errcode='PT409';
 end if;
 if prior.onboarding_completed_at is not null or array_position(progress,coalesce(prior.onboarding_step,'basics')) is null
  or array_position(progress,p_step)>array_position(progress,coalesce(prior.onboarding_step,'basics')) then
  raise exception 'Complete the previous step before saving.' using errcode='22023';
 end if;
 if p_avatar_path is not null and (p_step<>'basics' or p_avatar_path !~ ('^'||p_actor_id::text||'/profile/[0-9]{13}-[0-9a-f-]+[.](jpg|jpeg|png|webp)$')
  or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_avatar_path)) then
  raise exception 'A verified artist-owned avatar is required.' using errcode='42501';
 end if;
 if p_step='basics' then
  insert into public.artist_profiles(user_id,artist_name) values(p_actor_id,p_data->>'artistName')
  on conflict(user_id) do update set artist_name=excluded.artist_name;
 else
  perform 1 from public.artist_profiles where user_id=p_actor_id for update;
  if not found then raise exception 'Complete account basics before continuing.' using errcode='22023'; end if;
  if p_step='profile' then
   update public.artist_profiles set bio=p_data->>'bio',location=p_data->>'location',
    website=case when p_data ? 'website' then nullif(p_data->>'website','') else website end,
    instagram_url=case when p_data ? 'instagram' then nullif(p_data->>'instagram','') else instagram_url end,
    spotify_url=case when p_data ? 'spotify' then nullif(p_data->>'spotify','') else spotify_url end,
    youtube_url=case when p_data ? 'youtube' then nullif(p_data->>'youtube','') else youtube_url end,
    social_links=(coalesce(social_links,'{}')-case when p_data ? 'instagram' then 'instagram' else '' end
      -case when p_data ? 'spotify' then 'spotify' else '' end-case when p_data ? 'youtube' then 'youtube' else '' end)
      ||jsonb_strip_nulls(jsonb_build_object('instagram',nullif(p_data->>'instagram',''),'spotify',nullif(p_data->>'spotify',''),'youtube',nullif(p_data->>'youtube','')))
   where user_id=p_actor_id;
  elsif p_step='licensing' then
   update public.artist_profiles set payout_email=p_data->>'payoutEmail',
    default_licensing_preferences=case when p_data ? 'defaultLicensingPreferences' then nullif(p_data->>'defaultLicensingPreferences','') else default_licensing_preferences end
   where user_id=p_actor_id;
  end if;
 end if;
 -- Never regress saved progress when editing an earlier stage.
 next_step:=progress[greatest(array_position(progress,p_step)+1,array_position(progress,coalesce(prior.onboarding_step,'basics')))];
 patch:=p_data-'payoutEmail';
 update public.user_profiles set
  full_name=case when p_step='basics' then p_data->>'fullName' else full_name end,
  onboarding_payload=(coalesce(onboarding_payload,'{}')-'payoutEmail'-'avatarPath'-'avatarUrl'-'avatar_path'-'avatar_url')||patch,
  onboarding_step=next_step,onboarding_started_at=coalesce(onboarding_started_at,clock_timestamp()),
  avatar_path=coalesce(p_avatar_path,avatar_path),avatar_url=case when p_avatar_path is not null then null else avatar_url end,
  updated_at=clock_timestamp()
 where id=p_actor_id returning updated_at into result_at;
 return result_at;
end;$$;
revoke all on function public.save_artist_onboarding_atomic(uuid,timestamptz,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.save_artist_onboarding_atomic(uuid,timestamptz,text,jsonb,text) to service_role;

create or replace function public.complete_artist_onboarding_atomic(p_actor_id uuid,p_expected_updated_at timestamptz)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare prior public.user_profiles%rowtype; artist public.artist_profiles%rowtype; done_at timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted artist workflow required.' using errcode='42501'; end if;
 select * into prior from public.user_profiles where id=p_actor_id for update;
 if not found or prior.role is distinct from 'artist' then raise exception 'Canonical artist access required.' using errcode='42501'; end if;
 select * into artist from public.artist_profiles where user_id=p_actor_id for update;
 if not found or prior.onboarding_step is distinct from 'complete' then raise exception 'Complete every artist onboarding step first.' using errcode='22023'; end if;
 perform security_private.validate_artist_onboarding_fields('basics',jsonb_build_object('fullName',prior.full_name,'artistName',artist.artist_name));
 perform security_private.validate_artist_onboarding_fields('profile',jsonb_build_object('bio',artist.bio,'location',artist.location,
   'website',coalesce(artist.website,''),'instagram',coalesce(artist.instagram_url,''),'spotify',coalesce(artist.spotify_url,''),'youtube',coalesce(artist.youtube_url,'')));
 perform security_private.validate_artist_onboarding_fields('licensing',jsonb_build_object('payoutEmail',artist.payout_email,'defaultLicensingPreferences',coalesce(artist.default_licensing_preferences,'')));
 perform security_private.validate_artist_onboarding_fields('first-track',jsonb_build_object('firstTrackChoice',prior.onboarding_payload->>'firstTrackChoice'));
 if prior.onboarding_completed_at is not null then return prior.onboarding_completed_at; end if;
 if p_expected_updated_at is null or prior.updated_at is distinct from p_expected_updated_at then raise exception 'Onboarding changed. Reload before completing.' using errcode='PT409'; end if;
 update public.user_profiles set onboarding_completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_actor_id returning onboarding_completed_at into done_at;
 return done_at;
end;$$;
revoke all on function public.complete_artist_onboarding_atomic(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.complete_artist_onboarding_atomic(uuid,timestamptz) to service_role;

-- Do not allow ordinary Data API writes to forge the artist workflow state.
-- Buyer workflows and normal editable profile columns retain existing policy behavior.
create or replace function security_private.guard_artist_onboarding_state()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if auth.role()='service_role' then return new; end if;
 if new.role='artist' then
  if tg_op='INSERT' then
   if new.onboarding_completed_at is not null or coalesce(new.onboarding_step,'basics')<>'basics'
    or coalesce(new.onboarding_payload,'{}')<>'{}'::jsonb or new.avatar_path is not null or new.avatar_url is not null then raise exception 'Trusted artist onboarding required.' using errcode='42501'; end if;
  elsif (new.onboarding_step,new.onboarding_completed_at,new.onboarding_started_at,new.onboarding_payload,new.avatar_path,new.avatar_url)
    is distinct from (old.onboarding_step,old.onboarding_completed_at,old.onboarding_started_at,old.onboarding_payload,old.avatar_path,old.avatar_url) then
   raise exception 'Trusted artist onboarding required.' using errcode='42501';
  end if;
 end if;
 return new;
end;$$;
revoke all on function security_private.guard_artist_onboarding_state() from public,anon,authenticated;
drop trigger if exists guard_artist_onboarding_state on public.user_profiles;
create trigger guard_artist_onboarding_state before insert or update on public.user_profiles for each row execute function security_private.guard_artist_onboarding_state();
commit;
