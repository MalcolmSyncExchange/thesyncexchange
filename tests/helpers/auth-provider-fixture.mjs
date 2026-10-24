// Local synthetic GoTrue/PostgREST contract fixture. Never accepts a hosted target.
import http from 'node:http';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
export const anonKey='SYNTHETIC_LOCAL_ANON_KEY',serviceKey='SYNTHETIC_LOCAL_SERVICE_KEY';
export async function startAuthFixture(options={}){
 const accounts=new Map(),profiles=new Map(),sessions=new Map(),refresh=new Map(),tokens=new Map(),calls=[];const signing=randomBytes(32);
 const seed=(email,role,{confirmed=true,complete=false,factors=[]}={})=>{
  const id=randomUUID();const record={id,email,password:'SyntheticPassword!123',confirmed,factors,fullName:'Synthetic '+role};accounts.set(email,record);profiles.set(id,{id,email,role,full_name:record.fullName,onboarding_step:complete?'complete':'basics',onboarding_started_at:new Date().toISOString(),onboarding_completed_at:complete?new Date().toISOString():null,onboarding_payload:{}});return record;
 };
 const buyer=seed('buyer@fixture.invalid','buyer'),artist=seed('artist@fixture.invalid','artist');const admin=seed('admin@fixture.invalid','admin',{factors:[{id:randomUUID(),factor_type:'totp',status:'verified',friendly_name:'Synthetic authenticator'}]});
 const user=a=>({id:a.id,aud:'authenticated',role:'authenticated',email:a.email,email_confirmed_at:a.confirmed?'2026-01-01T00:00:00Z':null,confirmed_at:a.confirmed?'2026-01-01T00:00:00Z':null,created_at:'2026-01-01T00:00:00Z',updated_at:new Date().toISOString(),app_metadata:{provider:'email',providers:['email']},user_metadata:{full_name:a.fullName,role:'admin'},factors:a.factors,identities:[{id:a.id,user_id:a.id,provider:'email',identity_data:{email:a.email}}]});
 function session(a,aal='aal1'){
  const sid=randomUUID(),now=Math.floor(Date.now()/1000);const encoded=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const body=encoded({alg:'HS256',typ:'JWT'})+'.'+encoded({sub:a.id,role:'authenticated',aud:'authenticated',iss:'SYNTHETIC_LOOPBACK',exp:now+3600,iat:now,session_id:sid,aal,amr:[{method:aal==='aal2'?'totp':'password',timestamp:now}]});const access=body+'.'+createHmac('sha256',signing).update(body).digest('base64url'),refreshToken=randomBytes(24).toString('hex');const s={account:a,aal,sid,access,refreshToken,active:true};sessions.set(access,s);refresh.set(refreshToken,s);return {access_token:access,refresh_token:refreshToken,expires_in:3600,expires_at:now+3600,token_type:'bearer',user:user(a)};
 }
 const getSession=req=>sessions.get((req.headers.authorization||'').replace(/^Bearer /,''));
 const issue=(a,type)=>{const token=randomBytes(32).toString('hex');tokens.set(token,{account:a,type,used:false});return token;};
 const readJson=async req=>{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)throw Error('Fixture request too large');chunks.push(chunk);}return chunks.length?JSON.parse(Buffer.concat(chunks).toString()):{};};
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://127.0.0.1'),route=url.pathname;calls.push({method:req.method,path:route,grantType:url.searchParams.get('grant_type')});
  const json=(value,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'GET,POST,PATCH,DELETE,OPTIONS'});res.end(JSON.stringify(value));};
  const error=(code,status=400)=>json({code,msg:'Synthetic auth request failed',message:'Synthetic auth request failed',error_code:code},status);
  if(req.method==='OPTIONS')return json({});
  if(options.rawHandler && await options.rawHandler(req,res,{url,session:getSession(req),service:req.headers.apikey===serviceKey}))return;
  const body=['POST','PATCH','PUT'].includes(req.method)?await readJson(req):{};
  const current=getSession(req),active=current?.active?current:null;calls.at(-1).sessionLevel=active?.aal||null;
  if(route.endsWith('/verify')&&route.includes('/factors/'))calls.at(-1).acceptedSyntheticCode=body.code==='123456';
  if(route==='/auth/v1/signup'){
   const email=String(body.email||'').toLowerCase();if(accounts.has(email))return json({...user(accounts.get(email)),identities:[]});
   const account=seed(email,null,{confirmed:false});account.password=body.password;account.fullName=body.data?.full_name||'Synthetic account';profiles.delete(account.id);issue(account,'signup');return json(user(account));
  }
  if(route==='/auth/v1/token'){
   if(url.searchParams.get('grant_type')==='refresh_token'){const old=refresh.get(body.refresh_token);if(!old?.active)return error('refresh_token_not_found');old.active=false;return json(session(old.account,old.aal));}
   const account=accounts.get(String(body.email||'').toLowerCase());if(!account||account.password!==body.password)return error('invalid_credentials');if(!account.confirmed)return error('email_not_confirmed');return json(session(account));
  }
  if(route==='/auth/v1/user'){
   if(!active)return error('session_not_found',401);
   if(req.method==='PUT'){if(body.password)active.account.password=body.password;if(body.email){active.account.pendingEmail=body.email;issue(active.account,'email_change');}return json(user(active.account));}
   return json(user(active.account));
  }
  if(route==='/auth/v1/logout'){if(active){for(const s of sessions.values())if((url.searchParams.get('scope')||'global')==='global'?s.account.id===active.account.id:s.sid===active.sid)s.active=false;}res.writeHead(204);return res.end();}
  if(route==='/auth/v1/recover'){const account=accounts.get(body.email);if(account)issue(account,'recovery');return json({});}
  if(route==='/auth/v1/resend'){const account=accounts.get(body.email);if(account&&!account.confirmed)issue(account,'signup');return json({});}
  if(route==='/auth/v1/verify'){
   const found=tokens.get(body.token_hash);if(!found||found.used||found.type!==body.type)return error('otp_expired');found.used=true;found.account.confirmed=true;if(found.type==='email_change'){accounts.delete(found.account.email);found.account.email=found.account.pendingEmail;delete found.account.pendingEmail;accounts.set(found.account.email,found.account);}return json(session(found.account));
  }
  if(route.startsWith('/auth/v1/factors')){
   if(!active)return error('session_not_found',401);
   if(route==='/auth/v1/factors'&&req.method==='POST'){const f={id:randomUUID(),factor_type:'totp',status:'unverified',friendly_name:'Synthetic fixture'};active.account.factors.push(f);return json({...f,type:'totp',totp:{qr_code:'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="white"/><text x="10" y="100">SYNTHETIC QR</text></svg>'),secret:'JBSWY3DPEHPK3PXP',uri:'otpauth://totp/SYNTHETIC?secret=JBSWY3DPEHPK3PXP'}});}
   const id=route.split('/')[4],f=active.account.factors.find(f=>f.id===id);if(!f)return error('mfa_factor_not_found');
   if(req.method==='DELETE'){active.account.factors=active.account.factors.filter(f=>f.id!==id);return json({id});}
   if(route.endsWith('/challenge'))return json({id:'synthetic-challenge',type:'totp',expires_at:Math.floor(Date.now()/1000)+60});
   if(route.endsWith('/verify')){if(body.code!=='123456')return error('mfa_verification_failed');f.status='verified';return json(session(active.account,'aal2'));}
  }
  if(!options.restHandler&&route==='/rest/v1/rpc/sec_registration_open')return json(true);
  if(!options.restHandler&&route==='/rest/v1/rpc/auth_session_is_active')return json(Boolean(active));
  if(!options.restHandler&&route==='/rest/v1/rpc/sec_has_capability')return json(Boolean(active&&active.aal==='aal2'&&profiles.get(active.account.id)?.role==='admin'&&body.p_cap==='full_admin'));
  if(route.startsWith('/rest/v1/') && options.restHandler && await options.restHandler(req,res,{url,body,session:active,service:req.headers.apikey===serviceKey}))return;
  if(route.startsWith('/rest/v1/')){
   const table=route.slice('/rest/v1/'.length);const privileged=req.headers.apikey===serviceKey;
   if(table==='user_profiles'){
    const id=String(url.searchParams.get('id')||'').replace(/^eq\./,'');let rows=[...profiles.values()].filter(p=>(!id||p.id===id)&&(privileged||active&&(p.id===active.account.id||profiles.get(active.account.id)?.role==='admin'&&active.aal==='aal2')));
    if(req.method==='POST'){if(!privileged)return error('42501',403);for(const row of Array.isArray(body)?body:[body]){if(profiles.has(row.id))return json({code:'23505',message:'Synthetic duplicate'},409);profiles.set(row.id,row);}return json(null,201);}
    if(req.method==='PATCH'){if(!privileged)return error('42501',403);if(url.searchParams.get('role')==='is.null')rows=rows.filter(p=>p.role===null);for(const row of rows)Object.assign(row,body);}
    const single=String(req.headers.accept||'').includes('object');return json(single?rows[0]||null:rows);
   }
   if(table==='artist_profiles'||table==='buyer_profiles'){const role=table==='artist_profiles'?'artist':'buyer';const id=String(url.searchParams.get('user_id')||'').replace(/^eq\./,'');const a=[...accounts.values()].find(a=>a.id===id);const value=a&&profiles.get(id)?.role===role?{id:randomUUID(),user_id:id,artist_name:'Synthetic artist',company_name:'Synthetic buyer'}:null;return json(String(req.headers.accept||'').includes('object')?value:value?[value]:[]);}
   // No domain mutations are implemented or permitted by this Auth-only fixture.
   if(req.method!=='GET'&& !route.startsWith('/rest/v1/rpc/'))return error('fixture_mutation_forbidden',403);
   return json([]);
  }
  return error('fixture_endpoint_forbidden',403);
 }catch{res.writeHead(500,{'content-type':'application/json'});res.end('{"error":"SYNTHETIC_FIXTURE_ERROR"}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 return {url:'http://127.0.0.1:'+server.address().port,accounts,profiles,calls,buyer,artist,admin,issue,seed,invalidate:id=>{for(const s of sessions.values())if(s.account.id===id)s.active=false;},latestToken:(email,type)=>[...tokens].reverse().find(([,v])=>v.account.email===email&&v.type===type&&!v.used)?.[0],close:()=>new Promise(resolve=>server.close(resolve))};
}
