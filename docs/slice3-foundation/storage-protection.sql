-- GATE 2 ONLY. NON-MIGRATION source; no hosted execution authorized.
-- Provider-supported postgres authority, NOT ownership transfer or SET ROLE.
-- Keep bucket configuration separate. Global upload ceiling must support 250 MB.
begin;
-- BEGIN READ-ONLY AUTHORITY ASSERTION
-- Also usable alone in a read-only transaction.
set local search_path = '';
do $authority$
declare
  cfg record; entry record; item json; parsed json; f record; function_oid oid;
  grants text[]; replay_policy record;
  deny_expression text := '(bucket_id <> ALL (ARRAY[''submission-source''::text, ''submission-artwork''::text, ''submission-derived''::text]))';
begin
  if current_user <> 'postgres' or session_user <> 'postgres' or
     not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and not rolsuper) then
    raise exception 'Gate 2 requires exact non-superuser postgres actor' using errcode='42501';
  end if;
  if not exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='storage' and c.relname='objects' and c.relkind='r' and c.relrowsecurity
      and pg_catalog.pg_get_userbyid(c.relowner)='supabase_storage_admin') or
     pg_catalog.pg_has_role(current_user,'supabase_storage_admin','USAGE') or
     pg_catalog.pg_has_role(current_user,'supabase_storage_admin','SET') then
    raise exception 'Gate 2 Storage owner/role graph changed' using errcode='42501';
  end if;
  -- Registered SIGHUP settings prove a loaded library; custom USERSET placeholders
  -- or operator SET claims cannot satisfy this. Do not cast to jsonb: that loses
  -- duplicate object keys before ambiguity can be rejected.
  for cfg in select name,setting,context,vartype,source,pending_restart from pg_catalog.pg_settings
      where name in ('supautils.policy_grants','supautils.drop_trigger_grants') loop
    if cfg.context <> 'sighup' or cfg.vartype <> 'string' or cfg.source <> 'configuration file' or cfg.pending_restart then
      raise exception 'Gate 2 requires registered provider grants' using errcode='42501';
    end if;
    begin parsed:=cfg.setting::json;
    exception when invalid_text_representation then
      raise exception 'Gate 2 malformed provider grants' using errcode='42501';
    end;
    if pg_catalog.json_typeof(parsed) is distinct from 'object' then
      raise exception 'Gate 2 malformed provider grant object' using errcode='42501';
    end if;
    if exists(select 1 from pg_catalog.json_each(parsed) group by key having count(*) <> 1) then
      raise exception 'Gate 2 ambiguous provider role entries' using errcode='42501';
    end if;
    for entry in select * from pg_catalog.json_each(parsed) loop
      if entry.key !~ '^[a-z_][a-z0-9_]*$' or pg_catalog.json_typeof(entry.value) is distinct from 'array' then
        raise exception 'Gate 2 malformed provider role/tables' using errcode='42501';
      end if;
      for item in select value from pg_catalog.json_array_elements(entry.value) loop
        if pg_catalog.json_typeof(item) is distinct from 'string' or
           (item #>> '{}') !~ '^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$' then
          raise exception 'Gate 2 malformed provider table entry' using errcode='42501';
        end if;
      end loop;
      if exists(select 1 from pg_catalog.json_array_elements_text(entry.value) group by value having count(*) <> 1) then
        raise exception 'Gate 2 ambiguous provider table entries' using errcode='42501';
      end if;
    end loop;
    if not exists(select 1 from pg_catalog.json_array_elements_text(parsed -> 'postgres') where value='storage.objects') then
      raise exception 'Gate 2 missing exact postgres/storage.objects provider grant' using errcode='42501';
    end if;
  end loop;
  if (select count(*) from pg_catalog.pg_settings where name in ('supautils.policy_grants','supautils.drop_trigger_grants')) <> 2 then
    raise exception 'Gate 2 missing registered supautils grants' using errcode='42501';
  end if;
  if not pg_catalog.has_table_privilege(current_user,'storage.objects','TRIGGER') or
     not pg_catalog.has_schema_privilege(current_user,'submission_media','USAGE') then
    raise exception 'Gate 2 missing native trigger/schema authority' using errcode='42501';
  end if;
  if pg_catalog.to_regprocedure('extensions.digest(text,text)') is null or not exists
      (select 1 from pg_catalog.pg_extension e join pg_catalog.pg_namespace n on n.oid=e.extnamespace
       where e.extname='pgcrypto' and n.nspname='extensions') then
    raise exception 'Gate 2 requires reviewed extensions digest' using errcode='55000';
  end if;
  -- Pin exact installed Migration C routines, including definition and complete ACL.
  for f in select * from (values
    ('submission_media.guard_storage_object()', 'e119fdfbd6c74c76ed26b94d9ca00aa09662dc20884cee0ec05cecca3cc7cb3c', array['postgres','supabase_storage_admin']),
    ('submission_media.storage_setup_ready()', 'b9090979059d137e0d162029542c20c21a72f80d0729f344edc3fc66ca7ddbba', array['postgres','supabase_storage_admin']),
    ('submission_media.storage_insert_allowed(text,text)', '883dc73160eafb6f9c932438b682c751c4588e8318dd283c6e350bc453fddc58', array['authenticated','postgres'])
  ) expected(signature,sha256,roles) loop
    function_oid:=pg_catalog.to_regprocedure(f.signature);
    if function_oid is null or not exists(select 1 from pg_catalog.pg_proc p where p.oid=function_oid
        and pg_catalog.pg_get_userbyid(p.proowner)='postgres' and p.prosecdef
        and p.proconfig=array['search_path=""']::text[] and p.proacl is not null) or
        pg_catalog.encode(extensions.digest(pg_catalog.pg_get_functiondef(function_oid),'sha256'),'hex') <> f.sha256 then
      raise exception 'Gate 2 reviewed function identity/definition changed' using errcode='55000';
    end if;
    select array_agg(pg_catalog.pg_get_userbyid(a.grantee)::text order by pg_catalog.pg_get_userbyid(a.grantee)::text)
      into grants from pg_catalog.pg_proc p cross join lateral pg_catalog.aclexplode(p.proacl) a
      where p.oid=function_oid;
    if grants is distinct from f.roles or exists(select 1 from pg_catalog.pg_proc p
        cross join lateral pg_catalog.aclexplode(p.proacl) a where p.oid=function_oid
        and (a.privilege_type <> 'EXECUTE' or a.is_grantable or pg_catalog.pg_get_userbyid(a.grantor) <> 'postgres')) or
        not pg_catalog.has_function_privilege(current_user,function_oid,'EXECUTE') then
      raise exception 'Gate 2 reviewed function grants changed' using errcode='42501';
    end if;
  end loop;
  if not submission_media.storage_setup_ready() then
    raise exception 'Storage setup requires all media capabilities OFF' using errcode='55000';
  end if;
  -- Controlled policy replay accepts only these exact names AND definitions.
  -- Role arrays use names rather than deployment-specific OIDs.
  for replay_policy in select expected.*, actual.polcmd,actual.polpermissive,
      pg_catalog.pg_get_expr(actual.polqual,actual.polrelid) as actual_using,
      pg_catalog.pg_get_expr(actual.polwithcheck,actual.polrelid) as actual_check,
      (select array_agg(r.rolname::text order by r.rolname::text) from pg_catalog.pg_roles r
       where r.oid=any(actual.polroles)) as actual_roles
    from (values
      ('submission_media_private_reads','r',false,array['anon','authenticated'],deny_expression,null),
      ('submission_media_bound_insert','a',false,array['authenticated'],null,
        '(' || deny_expression || ' OR submission_media.storage_insert_allowed(bucket_id, name))'),
      ('submission_media_upload_insert','a',true,array['authenticated'],null,'submission_media.storage_insert_allowed(bucket_id, name)'),
      ('submission_media_no_update','w',false,array['anon','authenticated'],deny_expression,deny_expression),
      ('submission_media_no_delete','d',false,array['anon','authenticated'],deny_expression,null)
    ) expected(name,command,permissive,roles,using_expression,check_expression)
    join pg_catalog.pg_policy actual on actual.polname=expected.name and actual.polrelid='storage.objects'::regclass loop
    if replay_policy.polcmd::text is distinct from replay_policy.command or replay_policy.polpermissive is distinct from replay_policy.permissive or
       replay_policy.actual_roles is distinct from replay_policy.roles or replay_policy.actual_using is distinct from replay_policy.using_expression or
       replay_policy.actual_check is distinct from replay_policy.check_expression then
      raise exception 'Gate 2 existing policy is not the reviewed definition' using errcode='55000';
    end if;
  end loop;
  -- Only an absent or EXACT reviewed trigger may be reconciled. Never drop an
  -- unrelated implementation sharing a name; leave all other triggers untouched.
  if exists(select 1 from pg_catalog.pg_trigger where tgrelid='storage.objects'::regclass
      and tgname='guard_submission_media_object' and (tgisinternal or tgenabled <> 'O' or
      tgfoid <> 'submission_media.guard_storage_object()'::regprocedure or tgtype <> 31 or
      tgconstraint <> 0 or tgnargs <> 0 or tgqual is not null or
      pg_catalog.pg_get_triggerdef(oid) <> 'CREATE TRIGGER guard_submission_media_object BEFORE INSERT OR DELETE OR UPDATE ON storage.objects FOR EACH ROW EXECUTE FUNCTION submission_media.guard_storage_object()')) then
    raise exception 'Gate 2 existing guard is not the reviewed trigger' using errcode='55000';
  end if;
end $authority$;
-- END READ-ONLY AUTHORITY ASSERTION
-- Existing broad permissive policies cannot authorize a new bucket accidentally.
drop policy if exists submission_media_private_reads on storage.objects;
create policy submission_media_private_reads on storage.objects as restrictive for select to anon,authenticated
 using (bucket_id not in ('submission-source','submission-artwork','submission-derived'));
drop policy if exists submission_media_bound_insert on storage.objects;
create policy submission_media_bound_insert on storage.objects as restrictive for insert to authenticated
 with check (bucket_id not in ('submission-source','submission-artwork','submission-derived') or submission_media.storage_insert_allowed(bucket_id,name));
drop policy if exists submission_media_upload_insert on storage.objects;
create policy submission_media_upload_insert on storage.objects for insert to authenticated
 with check (submission_media.storage_insert_allowed(bucket_id,name));
drop policy if exists submission_media_no_update on storage.objects;
create policy submission_media_no_update on storage.objects as restrictive for update to anon,authenticated
 using (bucket_id not in ('submission-source','submission-artwork','submission-derived'))
 with check (bucket_id not in ('submission-source','submission-artwork','submission-derived'));
drop policy if exists submission_media_no_delete on storage.objects;
create policy submission_media_no_delete on storage.objects as restrictive for delete to anon,authenticated
 using (bucket_id not in ('submission-source','submission-artwork','submission-derived'));
drop trigger if exists guard_submission_media_object on storage.objects;
create trigger guard_submission_media_object before insert or update or delete on storage.objects for each row execute function submission_media.guard_storage_object();
commit;
-- NO bucket creation, object mutation, capability activation or worker execution.
