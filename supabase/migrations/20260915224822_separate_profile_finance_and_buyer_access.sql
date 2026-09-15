begin;
-- SQL Editor/CLI migration sessions have no end-user JWT. This transaction-local
-- trusted context is only for the explicit legacy-data reconciliation below;
-- it is not a new application bypass and cannot survive COMMIT/ROLLBACK.
set local request.jwt.claim.role = 'service_role';

-- General profile grants intentionally exclude finance. RLS still scopes every row.
revoke select, insert, update on public.artist_profiles from anon, authenticated;
grant select (id,user_id,artist_name,bio,location,website,instagram_url,spotify_url,youtube_url,social_links,default_licensing_preferences,verification_status,created_at,updated_at)
on public.artist_profiles to authenticated;
grant insert (user_id,artist_name,bio,location,website,instagram_url,spotify_url,youtube_url,social_links,default_licensing_preferences)
on public.artist_profiles to authenticated;
grant update (artist_name,bio,location,website,instagram_url,spotify_url,youtube_url,social_links,default_licensing_preferences)
on public.artist_profiles to authenticated;

create or replace function security_private.guard_artist_profile_review()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if auth.role() = 'service_role' or public.is_admin() then return new; end if;
 if tg_op = 'INSERT' then
  if new.verification_status <> 'unverified' or new.payout_email is not null then
   raise exception 'Verification and payout data require their authorized workflows.' using errcode='42501';
  end if;
 elsif new.verification_status is distinct from old.verification_status
    or new.payout_email is distinct from old.payout_email
    or new.user_id is distinct from old.user_id or new.id is distinct from old.id then
  raise exception 'Protected artist fields cannot be changed through profile editing.' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function security_private.guard_artist_profile_review() from public,anon,authenticated;
drop trigger if exists guard_artist_profile_review on public.artist_profiles;
create trigger guard_artist_profile_review before insert or update on public.artist_profiles
for each row execute function security_private.guard_artist_profile_review();

-- This is the existing independent-artist finance boundary, NOT a future team capability.
create or replace function public.get_own_artist_finance()
returns table(payout_email text) language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or public.current_app_role() is distinct from 'artist' then
  raise exception 'Artist finance access required.' using errcode='42501';
 end if;
 return query select p.payout_email from public.artist_profiles p where p.user_id=auth.uid();
end; $$;
revoke all on function public.get_own_artist_finance() from public,anon;
grant execute on function public.get_own_artist_finance() to authenticated;

-- Preserve the explicit legacy value before removing its duplicate from generic
-- onboarding state. No stage name/email is inferred as a payout destination.
update public.artist_profiles p set payout_email=u.onboarding_payload->>'payoutEmail'
from public.user_profiles u where u.id=p.user_id and p.payout_email is null
and nullif(u.onboarding_payload->>'payoutEmail','') is not null;
update public.user_profiles set onboarding_payload=onboarding_payload-'payoutEmail'
where onboarding_payload ? 'payoutEmail';
create or replace function security_private.guard_onboarding_finance_copy()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.onboarding_payload ? 'payoutEmail' then
  raise exception 'Store payout contact in the authorized finance workflow only.' using errcode='42501';
 end if;
 return new;
end; $$;
revoke all on function security_private.guard_onboarding_finance_copy() from public,anon,authenticated;
drop trigger if exists guard_onboarding_finance_copy on public.user_profiles;
create trigger guard_onboarding_finance_copy before insert or update on public.user_profiles
for each row execute function security_private.guard_onboarding_finance_copy();

-- Approved status grants catalog visibility, not direct access to private track rows.
drop policy if exists "Tracks are readable by approved buyers, owners, or admins" on public.tracks;
drop policy if exists "Private tracks are readable by owners or admins" on public.tracks;
create policy "Private tracks are readable by owners or admins" on public.tracks
for select to authenticated using (public.is_admin() or auth.uid()=artist_user_id);

-- Deliberate owner-context projections. Only public fields, approved records and
-- canonical buyer/admin roles. Do not add private columns to these contracts.
create or replace view public.buyer_catalog_public with (security_barrier=true) as
select t.id, p.id as artist_id, p.artist_name, t.title,t.slug,t.description,t.genre,t.subgenre,t.moods,t.bpm,
 t.musical_key,t.duration_seconds,t.instrumental,t.vocals,t.explicit,t.lyrics,t.release_year,
 t.cover_art_path,t.preview_file_path,t.waveform_path,t.featured,t.created_at,t.updated_at
from public.tracks t join public.artist_profiles p on p.user_id=t.artist_user_id
where t.status='approved' and public.current_app_role() in ('buyer','admin');
revoke all on public.buyer_catalog_public from public,anon,authenticated;
grant select on public.buyer_catalog_public to authenticated;

-- Replace the legacy projection that disclosed linked user IDs and review states.
drop view public.track_rights_holders_public;
create view public.track_rights_holders_public with (security_barrier=true) as
select r.id,r.track_id,r.name,r.role_type,r.ownership_percent
from public.rights_holders r join public.tracks t on t.id=r.track_id
where t.status='approved' and public.current_app_role() in ('buyer','admin');
revoke all on public.track_rights_holders_public from public,anon,authenticated;
grant select on public.track_rights_holders_public to authenticated;

-- Keep approved license discovery working after private-track visibility is removed.
drop policy if exists "Track license options are readable for approved tracks, owners, or admins" on public.track_license_options;
create policy "Track license options are readable for approved tracks, owners, or admins"
on public.track_license_options for select to authenticated using (
 public.is_admin() or exists(select 1 from public.tracks t where t.id=track_id and t.artist_user_id=auth.uid())
 or (active and exists(select 1 from public.buyer_catalog_public t where t.id=track_id))
);

-- Audit history is append-only through trusted workflows, including for app admins.
revoke update,delete,truncate on public.track_audit_log from anon,authenticated;
commit;
