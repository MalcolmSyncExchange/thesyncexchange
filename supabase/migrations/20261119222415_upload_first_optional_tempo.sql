-- Advisory analysis must not prevent review when tempo is unknown.
-- Patch only the existing guarded routines; preserve owners, ACLs and rights checks.
begin;
-- Existing catalog contracts already represent an unknown tempo as null.
-- No existing row values are changed. Never invent a numeric placeholder.
alter table public.tracks alter column bpm drop not null;
do $upgrade$
declare body text; target regprocedure;
begin
 target:='public.media_submission_prepare(uuid,bigint,uuid)'::regprocedure;
 body:=pg_get_functiondef(target);
 if position('submission_media.lock_owned' in body)=0 or position('prepare_workspace' in body)=0 then raise exception 'Unexpected workspace preparation contract';end if;
 if position('nullif(btrim(d->>''bpm''),'''')::integer' in body)=0 then
  if position('(d->>''bpm'')::integer' in body)=0 then raise exception 'Unexpected tempo preparation contract';end if;
  body:=replace(body,'(d->>''bpm'')::integer','nullif(btrim(d->>''bpm''),'''')::integer');execute body;
 end if;
 target:='public.media_upload_save_metadata(uuid,jsonb,bigint,uuid)'::regprocedure;
 body:=pg_get_functiondef(target);
 if position('submission_media.lock_owned' in body)=0 or position('Complete the track metadata' in body)=0 then raise exception 'Unexpected metadata contract';end if;
 if position('Optional tempo: null is unknown' in body)=0 then
  if position('coalesce(p_data->>''bpm'','''')!~''^[0-9]{2,3}$'' or (p_data->>''bpm'')::integer not between 40 and 220' in body)=0 then raise exception 'Unexpected tempo validation contract';end if;
  body:=replace(body,'coalesce(p_data->>''bpm'','''')!~''^[0-9]{2,3}$'' or (p_data->>''bpm'')::integer not between 40 and 220',
   '(case when p_data->''bpm''=''null''::jsonb then false when jsonb_typeof(p_data->''bpm'') is distinct from ''number'' then true when (p_data->>''bpm'')!~''^[0-9]{2,3}$'' then true else (p_data->>''bpm'')::integer not between 40 and 220 end) /* Optional tempo: null is unknown */');execute body;
 end if;
end $upgrade$;
commit;
