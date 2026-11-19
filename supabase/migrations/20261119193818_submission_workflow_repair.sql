-- Additive compatibility only. No records, policies, worker controls or grants
-- to existing routines are reset. Patch installed bodies to preserve retained
-- production rights checks absent from the older historical migration chain.
begin;
do $upgrade$
declare body text; target regprocedure;
begin
 target:='public.media_submission_save_draft(uuid,jsonb,bigint,uuid)'::regprocedure;
 body:=pg_get_functiondef(target);
 if position('submission_media.lock_owned' in body)=0 or position('save_workspace_draft' in body)=0 then raise exception 'Unexpected workspace contract';end if;
 if position('moodSuggestions' in body)=0 then
  if position(' update submission_media.submissions set workspace_draft=p_data,' in body)=0 or position('''licenseDuration'',''explicit''' in body)=0 then raise exception 'Unexpected workspace inventory';end if;
  body:=replace(body,'''licenseDuration'',''explicit''','''licenseDuration'',''moodSuggestions'',''explicit''');
  body:=replace(body,' update submission_media.submissions set workspace_draft=p_data,',
  ' if p_data ? ''moodSuggestions'' then
    if jsonb_typeof(p_data->''moodSuggestions'') is distinct from ''array'' then raise exception ''Invalid mood suggestions'' using errcode=''22023'';end if;
    if jsonb_array_length(p_data->''moodSuggestions'')>10 or exists(select 1 from jsonb_array_elements(p_data->''moodSuggestions'') v where jsonb_typeof(v) is distinct from ''string'' or length(v#>>''{}'') not between 1 and 80 or (v#>>''{}'')~''[[:cntrl:]]'') then raise exception ''Invalid mood suggestions'' using errcode=''22023'';end if;
    if exists(select 1 from jsonb_array_elements(p_data->''moodSuggestions'') v group by lower(btrim(v#>>''{}'')) having count(*)>1) then raise exception ''Duplicate mood suggestion'' using errcode=''22023'';end if;
   end if;
 update submission_media.submissions set workspace_draft=p_data,');
 end if;
 body:=replace(body,'''unknown'',''clean'',''explicit''','''unknown'',''clean'',''explicit'',''censored''');
 -- Avoid repeated appended enum members on idempotent application.
 body:=replace(body,'''censored'',''censored''','''censored''');
 execute body;
 target:='public.media_upload_save_metadata(uuid,jsonb,bigint,uuid)'::regprocedure;
 body:=pg_get_functiondef(target);
 if position('submission_media.lock_owned' in body)=0 or position('Complete the track metadata' in body)=0 then raise exception 'Unexpected metadata contract';end if;
 body:=replace(body,'coalesce(length(p_data->>''subgenre''),0) not between 1 and 80','coalesce(length(p_data->>''subgenre''),0) not between 0 and 80');
 body:=replace(body,'coalesce(length(p_data->>''description''),0) not between 20 and 5000','coalesce(length(p_data->>''description''),0) not between 0 and 3000');
 execute body;
 target:='catalog_private.validate(jsonb,boolean)'::regprocedure;
 body:=pg_get_functiondef(target);
 if position('Structured bounded catalog metadata required' in body)=0 then raise exception 'Unexpected catalog contract';end if;
 body:=replace(body,'''unknown'',''clean'',''explicit''','''unknown'',''clean'',''explicit'',''censored''');
 body:=replace(body,'''censored'',''censored''','''censored''');execute body;
end $upgrade$;

-- Render the existing audit events in the existing account notification area.
-- This is a bounded owner-only read, not another outbox or delivery system.
create or replace function public.media_account_notices() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=submission_media.require_actor('artist');begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'submission',x.submission_id,'kind',x.event_type,'at',x.created_at) order by x.created_at desc) from
 (select e.id,e.submission_id,e.event_type,e.created_at from submission_media.events e join submission_media.submissions s on s.id=e.submission_id where s.owner_id=actor and e.event_type in ('master_review_requested','master_review_approved','master_review_rejected','validation_failed') order by e.created_at desc limit 30) x),'[]'::jsonb);
end $$;
revoke all on function public.media_account_notices() from public,anon,authenticated,service_role;
grant execute on function public.media_account_notices() to authenticated;
commit;
