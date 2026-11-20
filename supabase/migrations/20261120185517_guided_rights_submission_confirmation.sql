-- Owner email is an unverified private declaration, not an invitation or entitlement.
-- No records, grants, policies, reviews or financial state are rewritten.
begin;
do $patch$
declare target regprocedure;body text;anchor text;
begin
 target:='submission_media.validate_master_owners(jsonb,boolean)'::regprocedure;
 body:=pg_get_functiondef(target);
 if position('owner-array[''name'',''percentage'']' in body)>0 then
  body:=replace(body,'owner-array[''name'',''percentage'']','owner-array[''name'',''percentage'',''email'']');
 elsif position('owner-array[''name'',''percentage'',''email'']' in body)=0 then raise exception 'Unexpected owner validation inventory';end if;
 if position('Invalid private owner email' in body)=0 then
  anchor:='  percentage:=owner->>''percentage'';';
  if position(anchor in body)=0 then raise exception 'Unexpected owner validation contract';end if;
  body:=replace(body,anchor,'  if owner ? ''email'' and (jsonb_typeof(owner->''email'') is distinct from ''string'' or length(owner->>''email'')>254 or (owner->>''email'')~''[[:cntrl:]]'' or (p_complete and btrim(owner->>''email'')<>'''' and (owner->>''email'')!~''^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'')) then raise exception ''Invalid private owner email'' using errcode=''22023'';end if;'||anchor);
 end if;
 execute body;
 target:='public.media_submission_save_draft(uuid,jsonb,bigint,uuid)'::regprocedure;
 body:=pg_get_functiondef(target);
 if position('''masterOwnershipChoice''' in body)=0 then
  anchor:='''masterOwnership'',''masterOwners''';
  if position(anchor in body)=0 then raise exception 'Unexpected workspace inventory';end if;
  body:=replace(body,anchor,'''masterOwnershipChoice'',''publishingOwnershipChoice'','||anchor);execute body;
 end if;
 target:='submission_media.validate_workspace_rights(uuid,jsonb,boolean)'::regprocedure;
 body:=pg_get_functiondef(target);
 if position('Invalid ownership questionnaire answer' in body)=0 then
  anchor:=' perform submission_media.validate_master_owners(d->''publishingOwners'',p_complete);';
  if position(anchor in body)=0 then raise exception 'Unexpected structured rights contract';end if;
  body:=replace(body,anchor,anchor||'
 if (d ? ''masterOwnershipChoice'' and (jsonb_typeof(d->''masterOwnershipChoice'') is distinct from ''string'' or d->>''masterOwnershipChoice'' not in (''unknown'',''self'',''shared'',''other''))) or (d ? ''publishingOwnershipChoice'' and (jsonb_typeof(d->''publishingOwnershipChoice'') is distinct from ''string'' or d->>''publishingOwnershipChoice'' not in (''unknown'',''self'',''shared'',''other''))) then raise exception ''Invalid ownership questionnaire answer'' using errcode=''22023'';end if;
 if p_complete and ((d->>''masterOwnershipChoice''=''self'' and (jsonb_array_length(d->''masterOwners'')<>1 or (d->''masterOwners''->0->>''percentage'')::numeric<>100)) or (d->>''publishingOwnershipChoice''=''self'' and (jsonb_array_length(d->''publishingOwners'')<>1 or (d->''publishingOwners''->0->>''percentage'')::numeric<>100)) or (d->>''masterOwnershipChoice''=''shared'' and jsonb_array_length(d->''masterOwners'')<2) or (d->>''publishingOwnershipChoice''=''shared'' and jsonb_array_length(d->''publishingOwners'')<2)) then raise exception ''Ownership answer conflicts with declared shares'' using errcode=''22023'';end if;');execute body;
 end if;
 target:='submission_media.upload_state(uuid,boolean)'::regprocedure;
 body:=pg_get_functiondef(target);
 if position('''submitted_at'',created_at' in body)=0 then
  anchor:='jsonb_build_object(''id'',id,''state'',state) from submission_media.master_reviews';
  if position(anchor in body)=0 or position('submission_media.require_actor' in body)=0 then raise exception 'Unexpected review read contract';end if;
  body:=replace(body,anchor,'jsonb_build_object(''id'',id,''state'',state,''submitted_at'',created_at) from submission_media.master_reviews');execute body;
 end if;
end $patch$;
commit;
