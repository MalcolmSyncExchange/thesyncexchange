// Synthetic loopback Auth/Storage transport with actual local migration SQL and RLS.
import { randomUUID } from 'node:crypto';
import { database, asActor } from './artist-baseline-db.mjs';
import { startAuthFixture, anonKey, serviceKey } from './auth-provider-fixture.mjs';
export { anonKey, serviceKey };
export async function startArtistFixture(options={}) {
 const db=await database('repository',{seed:false});let auth;let tail=Promise.resolve();const images=new Map();const failures=new Map();
 const serial=fn=>{const next=tail.then(fn);tail=next.catch(()=>{});return next;};
 const tables=['user_profiles','artist_profiles','artist_account_details','artist_account_acceptances','artist_account_events',...(options.tables||[])];
 const columns=new Map();for(const table of tables)columns.set(table,new Set((await db.query('select column_name from information_schema.columns where table_schema=$1 and table_name=$2',['public',table])).rows.map(r=>r.column_name)));
 const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
 async function mirror() {
  for(const a of auth.accounts.values()){
   await db.query('insert into auth.users(id,email) values($1,$2) on conflict(id) do nothing',[a.id,a.email]);
   const p=auth.profiles.get(a.id);if(p)await db.query('insert into user_profiles(id,email,role,full_name,onboarding_step,onboarding_started_at,onboarding_completed_at,onboarding_payload) values($1,$2,$3,$4,$5,$6,$7,$8::jsonb) on conflict(id) do nothing',[a.id,a.email,p.role,p.full_name,p.onboarding_step,p.onboarding_started_at,p.onboarding_completed_at,JSON.stringify(p.onboarding_payload||{})]);
  }
 }
 const execute=async(ctx,fn)=>{await mirror();if(ctx.session)await db.query('insert into auth.sessions(id,user_id) values($1,$2) on conflict(id) do nothing',[ctx.session.sid,ctx.session.account.id]);if(ctx.service)return asActor(db,null,fn,'service_role');if(!ctx.session&&ctx.url.pathname==='/rest/v1/rpc/sec_registration_open')return asActor(db,null,fn,'anon');if(!ctx.session)throw Object.assign(Error('Unauthorized'),{code:'42501'});const signed=JSON.parse(Buffer.from(ctx.session.access.split('.')[1],'base64url').toString());await db.query("select set_config('request.jwt.claim.amr',$1,false)",[JSON.stringify(signed.amr)]);try{return await asActor(db,ctx.session.account.id,fn,'authenticated',ctx.session.sid,ctx.session.aal);}finally{await db.exec("select set_config('request.jwt.claim.amr','',false)");}};
 const rpc=async(ctx,name)=>{
  const p=ctx.body;
  if(options.rpc){const handled=await options.rpc(name,p,{db,auth,images,ctx});if(handled)return handled.value;}
  if(name==='save_artist_account_step')return (await db.query('select to_jsonb(public.save_artist_account_step($1::uuid,$2::timestamptz,$3::text,$4::jsonb,$5::jsonb,$6::text,$7::boolean,$8::text,$9::boolean)) value',[p.p_actor,p.p_expected,p.p_step,JSON.stringify(p.p_public),JSON.stringify(p.p_private),p.p_avatar||null,Boolean(p.p_remove_avatar),p.p_notice_version||null,Boolean(p.p_accept)])).rows[0].value;
  if(name==='complete_artist_onboarding_atomic')return (await db.query('select to_jsonb(public.complete_artist_onboarding_atomic($1::uuid,$2::timestamptz)) value',[p.p_actor_id,p.p_expected_updated_at])).rows[0].value;
  if(name==='get_own_artist_finance')return (await db.query('select to_jsonb(r) value from public.get_own_artist_finance() r')).rows.map(x=>x.value);
  if(['auth_session_is_active','sec_has_capability','sec_context','sec_dashboard','sec_read','sec_command','sec_customer_command','sec_record_denial','sec_admit','sec_audit_manifest','sec_registration_open','notification_preferences','notification_operations','notification_retry','analytics_preferences','analytics_signup_consent','analytics_operations','analytics_financial_source','analytics_booked_finance'].includes(name)){const names=(await db.query("select proargnames,pronargs from pg_proc where proname=$1 and pronamespace='public'::regnamespace",[name])).rows[0];const params=(names.proargnames||[]).slice(0,names.pronargs).map(k=>p[k]??null);return (await db.query('select public.'+name+'('+params.map((_,i)=>'$'+(i+1)).join(',')+') value',params)).rows[0].value;}
  throw Object.assign(Error('Unsupported fixture RPC'),{code:'42501'});
 };
 auth=await startAuthFixture({
  async restHandler(req,res,ctx){
   return serial(async()=>{try{
    const name=ctx.url.pathname.slice('/rest/v1/'.length);
    if(name.startsWith('rpc/')){
     const operation=name.slice(4);const fail=failures.get(operation);if(fail?.when==='before'){failures.delete(operation);return json(res,{code:'08006',message:'Synthetic connection interrupted'},503),true;}
     const value=await execute(ctx,()=>rpc(ctx,operation));if(fail?.when==='after'){failures.delete(operation);return json(res,{code:'08006',message:'Synthetic response interrupted after commit'},503),true;}json(res,value);return true;
    }
    if(options.rest&&await options.rest(req,res,ctx,{db,auth,images,execute,json}))return true;
    if(!tables.includes(name)){if(req.method!=='GET')throw Object.assign(Error('Unsupported fixture mutation'),{code:'42501'});json(res,[]);return true;}
    const allowed=columns.get(name),params=[],filters=[];
    for(const [key,value] of ctx.url.searchParams){if(['select','limit','order','offset'].includes(key))continue;if(!allowed.has(key))throw Object.assign(Error('Invalid fixture filter'),{code:'22023'});if(value==='is.null'){filters.push('t."'+key+'" is null');continue;}if(!value.startsWith('eq.'))throw Object.assign(Error('Invalid fixture filter'),{code:'22023'});params.push(value.slice(3));filters.push('t."'+key+'"=$'+params.length);}
    const requested=(ctx.url.searchParams.get('select')||'*').split(',');if(requested.some(c=>c!=='*'&&!allowed.has(c)))throw Object.assign(Error('Invalid fixture projection'),{code:'22023'});
    const projection=requested[0]==='*'?'to_jsonb(t)':`jsonb_build_object(${requested.map(c=>"'"+c+"',t.\""+c+'"').join(',')})`;
    const value=await execute(ctx,async()=>{
     if(req.method==='POST'){
      if(!ctx.service||name!=='user_profiles')throw Object.assign(Error('Unsupported fixture write'),{code:'42501'});
      const body=Array.isArray(ctx.body)?ctx.body[0]:ctx.body;const keys=Object.keys(body);if(keys.some(c=>!allowed.has(c)))throw Object.assign(Error('Unsupported fixture column'),{code:'22023'});
      await db.query('insert into public.user_profiles('+keys.map(c=>'"'+c+'"').join(',')+') values('+keys.map((_,i)=>'$'+(i+1)).join(',')+')',keys.map(k=>body[k]!==null&&typeof body[k]==='object'?JSON.stringify(body[k]):body[k]));return null;
     }
     if(req.method==='PATCH'){
      if(!ctx.service||name!=='user_profiles')throw Object.assign(Error('Unsupported fixture write'),{code:'42501'});
      const keys=Object.keys(ctx.body);if(keys.some(c=>!allowed.has(c)))throw Object.assign(Error('Unsupported fixture column'),{code:'22023'});
      const values=keys.map(k=>ctx.body[k]!==null&&typeof ctx.body[k]==='object'?JSON.stringify(ctx.body[k]):ctx.body[k]);
      const shifted=filters.map(f=>f.replace(/\$(\d+)/g,(_,n)=>'$'+(Number(n)+values.length)));
      return (await db.query('update public.user_profiles t set '+keys.map((k,i)=>'"'+k+'"=$'+(i+1)).join(',')+(shifted.length?' where '+shifted.join(' and '):'')+' returning '+projection+' value',[...values,...params])).rows.map(r=>r.value);
     }
     if(req.method!=='GET')throw Object.assign(Error('Unsupported fixture mutation'),{code:'42501'});
     const exactCount=String(req.headers.prefer||'').split(',').some(value=>value.trim()==='count=exact');
     const countProjection=exactCount?', count(*) over() as total':'';
     const {rows}=await db.query('select '+projection+' value'+countProjection+' from public.'+name+' t'+(filters.length?' where '+filters.join(' and '):'')+' limit 100',params);
     if(exactCount)res.setHeader('Content-Range',rows.length?'0-'+(rows.length-1)+'/'+rows[0].total:'*/0');
     return rows.map(r=>r.value);
    });
    const single=String(req.headers.accept||'').includes('object');json(res,single&&Array.isArray(value)?value[0]||null:value,req.method==='POST'?201:200);return true;
   }catch(e){console.error('Synthetic Artist fixture SQL:',e.code,e.message);json(res,{code:e.code||'fixture_failure',message:e.code==='PT409'?'Synthetic version conflict':'Synthetic data request failed'},e.code==='PT409'?409:e.code==='42501'?403:400);return true;}});
  },
  async rawHandler(req,res,ctx){
   if(!ctx.url.pathname.startsWith('/storage/v1/'))return false;
   return serial(async()=>{try{
    if(options.storage && await options.storage(req,res,ctx,{db,auth,images}))return true;
    const path=decodeURIComponent(ctx.url.pathname.replace(/^\/storage\/v1\/object\/(?:public\/)?avatars\/?/,''));
    if(req.method==='GET'){
     const image=images.get(path);if(!image){res.writeHead(404);res.end();return true;}res.writeHead(200,{'content-type':image.type,'content-length':image.bytes.length});res.end(image.bytes);return true;
    }
    const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw Error('Oversized fixture upload');chunks.push(chunk);}const bytes=Buffer.concat(chunks);
    if(req.method==='DELETE'){
     const paths=JSON.parse(bytes.toString()).prefixes;if(!Array.isArray(paths)||!ctx.session?.active)throw Object.assign(Error('Unauthorized'),{code:'42501'});const deleted=[];
     await execute(ctx,async()=>{for(const key of paths){const result=await db.query("delete from storage.objects where bucket_id='avatars' and name=$1 returning name",[key]);if(result.rows.length){images.delete(key);deleted.push({name:key});}}});json(res,deleted);return true;
    }
    if(req.method!=='POST'||!ctx.service||!/^[-0-9a-f]{36}\/profile\/\d{13}-[-0-9a-f]{36}\.(png|jpg|jpeg|webp)$/.test(path))throw Object.assign(Error('Unauthorized fixture upload'),{code:'42501'});
    let image={bytes,type:String(req.headers['content-type']||'')};
    if(image.type.startsWith('multipart/form-data')){const body=await new Request('http://127.0.0.1/fixture',{method:'POST',headers:{'content-type':image.type},body:bytes}).formData();const file=[...body.values()].find(v=>v instanceof File);if(!file)throw Error('Missing fixture image');image={bytes:Buffer.from(await file.arrayBuffer()),type:file.type};}
    await mirror();await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata,version) values('avatars',$1,$2,$3::jsonb,$4)",[path,path.split('/')[0],JSON.stringify({size:image.bytes.length,mimetype:image.type}),randomUUID()]);images.set(path,image);json(res,{Key:'avatars/'+path});return true;
   }catch(e){json(res,{code:e.code||'fixture_storage_error',message:'Synthetic Storage request failed'},403);return true;}});
  }
 });
 await mirror();
 if(options.initialize)await options.initialize({db,auth,images});
 return {...auth,db,images,withDatabase:fn=>serial(()=>fn(db)),failNextRpc:(name,when='before')=>failures.set(name,{when}),query:(sql,params)=>serial(()=>db.query(sql,params)),close:async()=>{await auth.close();await tail;await db.close();}};
}
