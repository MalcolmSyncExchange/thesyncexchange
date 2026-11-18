export const project='oppijylbkcbiqfuvckgj';
export const databaseSources={
 'auth.users':'select * from auth.users',
 'auth.identities':'select * from auth.identities',
 'auth.sessions':'select * from auth.sessions',
 'public.user_profiles':'select * from public.user_profiles',
 'public.artist_profiles':'select * from public.artist_profiles',
 'public.buyer_profiles':'select * from public.buyer_profiles',
 'storage.objects':'select * from storage.objects',
 'storage.buckets':'select * from storage.buckets',
 analytics_outbox:'select * from public.analytics_outbox',
 staging_analytics_validation:'select * from public.staging_analytics_validation',
 staging_analytics_validation_slot:"select singleton::text as id,to_jsonb(t) as state from public.staging_analytics_validation_slot t",
 existing_policies:"select jsonb_build_array(schemaname,tablename,policyname)::text as id,to_jsonb(p) as state from pg_policies p where schemaname in ('public','storage','auth','security_private','commerce_private')",
 onboarding_records:'select id,onboarding_started_at,onboarding_completed_at,onboarding_step,onboarding_payload from public.user_profiles',
 purchase_capabilities:"select singleton::text as id,to_jsonb(t) as state from commerce_private.capabilities t",
 authorization_grants:`select 'relation:'||c.oid as id,jsonb_build_object('owner',c.relowner,'acl',(select jsonb_agg(a::text order by a::text) from unnest(c.relacl) a)) as state from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage','auth','security_private','commerce_private')
 union all select 'schema:'||n.oid,jsonb_build_object('owner',n.nspowner,'acl',(select jsonb_agg(a::text order by a::text) from unnest(n.nspacl) a)) from pg_namespace n where n.nspname in ('public','storage','auth','security_private','commerce_private')
 union all select 'routine:'||p.oid,jsonb_build_object('owner',p.proowner,'acl',(select jsonb_agg(a::text order by a::text) from unnest(p.proacl) a),'definer',p.prosecdef,'config',p.proconfig,'body',p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','storage','auth','security_private','commerce_private')
 union all select 'column:'||a.attrelid||':'||a.attnum,jsonb_build_object('acl',(select jsonb_agg(x::text order by x::text) from unnest(a.attacl) x)) from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace where a.attnum>0 and not a.attisdropped and n.nspname in ('public','storage','auth','security_private','commerce_private')
 union all select 'default:'||d.oid,to_jsonb(d) from pg_default_acl d
 union all select 'role:'||r.oid,to_jsonb(r) from pg_roles r where rolname in ('anon','authenticated','service_role')
 union all select 'membership:'||roleid||':'||member||':'||grantor,to_jsonb(m) from pg_auth_members m`,
 table_security:"select c.oid::text as id,jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',c.relowner,'kind',c.relkind,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) as state from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage','auth','security_private','commerce_private')",
 migration_history:'select version as id,name,statements from supabase_migrations.schema_migrations'
};
export function preservationQuery(adminId,executionAuthorization){
 if(!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(adminId))throw Error('invalid_admin_identity');
 if(executionAuthorization!==undefined&&!/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(executionAuthorization))throw Error('invalid_execution_authorization');
 const sources=Object.entries(databaseSources).map(([name,query])=>{
  const approved=name==='auth.users'?`t.id::text='${adminId}'`:name==='auth.identities'?`t.user_id::text='${adminId}'`:'false';
  let execution='null';
  if(executionAuthorization){
   if(name==='staging_analytics_validation')execution=`case when t.id='${executionAuthorization}'::uuid then (to_jsonb(t)-'rn')||jsonb_build_object('expiryExact',t.expires_at=t.created_at+interval '5 minutes') else null end`;
   if(name==='analytics_outbox')execution=`case when t.dedupe_key='bounded-validation:${executionAuthorization}' then (to_jsonb(t)-'rn'-'properties')||jsonb_build_object('propertiesMatch',t.properties=jsonb_build_object('submission_attempt_id','${executionAuthorization}','surface','submission_create')) else null end`;
   if(name==='staging_analytics_validation_slot')execution='t.state';
  }
  const special=['auth.users','auth.identities'].includes(name);
  return `'${name}',(select jsonb_build_object('success',true,'count',count(*),'complete',count(*)<=20000,'readAt',clock_timestamp(),'rows',coalesce(jsonb_agg(jsonb_build_object(
  'id',t.id::text,'fingerprint',encode(sha256(convert_to((to_jsonb(t)-'rn')::text,'UTF8')),'hex'),
  'loginFingerprint',${special?`case when ${approved} then encode(sha256(convert_to((to_jsonb(t)-'rn'-'last_sign_in_at'-'updated_at')::text,'UTF8')),'hex') else null end`:'null'},
  'loginTimes',${special?`case when ${approved} then jsonb_build_object('last_sign_in_at',to_jsonb(t)->'last_sign_in_at','updated_at',to_jsonb(t)->'updated_at') else null end`:'null'},
  'execution',${execution},'ownerId',${name==='auth.sessions'?'t.user_id::text':'null'},'createdAt',${name==='auth.sessions'?'t.created_at':'null'}) order by t.id::text) filter(where rn<=20000),'[]'::jsonb)) from (select s.*,row_number() over(order by id::text) rn from (${query}) s) t)`;
 });
 // One aggregate SELECT uses a single PostgreSQL MVCC statement snapshot.
 // No caller-supplied SQL, DDL, login, mutation or database-side helper creation.
 return `with stamp as materialized(select clock_timestamp() as started_at,pg_current_snapshot()::text as transaction_id),
 captured as materialized(select jsonb_build_object(${sources.join(',')}) as data from stamp)
 select jsonb_build_object('environmentId','${project}','readOnly',true,'privilegedRead',(select rolsuper or rolbypassrls from pg_roles where rolname=current_user),'consistent',true,'complete',true,'startedAt',(select started_at from stamp),'finishedAt',clock_timestamp(),'transactionId',(select transaction_id from stamp),'sources',data) as snapshot from captured;`;
}
