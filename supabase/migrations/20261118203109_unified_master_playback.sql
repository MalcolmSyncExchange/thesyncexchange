-- Additive read-only authorization. No bucket policy, admission or data changes.
begin;
create or replace function submission_media.master_playback_locator(p_actor uuid,p_submission uuid,p_asset uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform submission_media.require_capability('reads');
 select jsonb_build_object('asset_id',a.id,'bucket',a.bucket,'path',a.object_path,
   'sha256',encode(a.sha256,'hex'),'bytes',a.storage_bytes,'version',a.storage_version,
   'format',a.container,'duration_us',a.duration_us)
 into result
 from submission_media.assets a
 join submission_media.submissions s on s.id=a.submission_id and s.working_master_id=a.id
 join submission_media.upload_files f on f.submission_id=s.id and f.asset_id=a.id and f.role='master' and f.retired_at is null
 join public.user_profiles u on u.id=p_actor
 join storage.objects x on x.id=a.storage_object_id and x.version=a.storage_version and x.bucket_id=a.bucket and x.name=a.object_path
 join storage.buckets b on b.id=a.bucket and not b.public
 where s.id=p_submission and a.id=p_asset and a.kind='source_master' and a.technical_state='ready'
   and a.bucket='submission-source' and a.storage_bytes between 1 and 150000000
   and octet_length(a.sha256)=32 and a.duration_us between 1000000 and 900000000
   and a.container in ('wav','aiff','aifc','flac')
   and (u.role='admin' or (u.role='artist' and s.owner_id=p_actor));
 if result is null then raise exception 'Master unavailable' using errcode='42501';end if;
 return result;
end$$;
revoke all on function submission_media.master_playback_locator(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.media_master_can_play(p_submission uuid,p_asset uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 -- Reuse the existing live-session, canonical-role and SEC account restrictions.
 if public.current_app_role()='admin' then
   actor:=submission_media.require_actor('admin');
   if auth.jwt()->>'aal' is distinct from 'aal2' then raise exception 'MFA required' using errcode='42501';end if;
 else actor:=submission_media.require_actor('artist');end if;
 perform submission_media.master_playback_locator(actor,p_submission,p_asset);
 return true;
end$$;
revoke all on function public.media_master_can_play(uuid,uuid) from public,anon,service_role;
grant execute on function public.media_master_can_play(uuid,uuid) to authenticated;

create or replace function public.media_master_playback_authorized(p_actor uuid,p_submission uuid,p_asset uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Server authorization required' using errcode='42501';end if;
 return submission_media.master_playback_locator(p_actor,p_submission,p_asset);
end$$;
revoke all on function public.media_master_playback_authorized(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.media_master_playback_authorized(uuid,uuid,uuid) to service_role;
commit;
