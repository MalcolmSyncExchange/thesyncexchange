import {execFileSync} from 'node:child_process';
export const STAGING_PROJECT='oppijylbkcbiqfuvckgj';
export const STAGING_KEYCHAIN_SERVICE='The Sync Exchange | staging publication | oppijylbkcbiqfuvckgj | service_role';
const fields=['foundation_enabled','asset_preparation_enabled','receipt_generation_enabled','entitlement_activation_enabled','transaction_projection_enabled','payment_adapter_enabled'];
const fail=()=>{throw new Error('Staging publication credential verification failed. No secrets logged.');};
export function assertStagingCredential(value){
 try{const parts=value?.split('.');if(parts?.length!==3)fail();const claims=JSON.parse(Buffer.from(parts[1],'base64url'));if(claims.ref!==STAGING_PROJECT||claims.role!=='service_role')fail();}catch{fail();}
 return value;
}
function readKeychain(service){
 try{return execFileSync('/usr/bin/security',['find-generic-password','-s',service,'-w'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:10000}).trim();}
 catch(error){if(error.status===44)return undefined;fail();}
}
// Reads only existing secrets. Never creates/rotates keys or writes credentials.
// Returning the key is exclusively for private in-memory publication verification.
export async function getStagingPublicationCredential({env=process.env,keychain=readKeychain,request=fetch}={}){
 try{
  let credential=env.SUPABASE_SERVICE_ROLE_KEY;
  if(!credential){credential=keychain(STAGING_KEYCHAIN_SERVICE);}
  if(!credential){
   const pat=keychain('Supabase CLI');if(!pat)fail();
   const response=await request(`https://api.supabase.com/v1/projects/${STAGING_PROJECT}/api-keys?reveal=true`,{headers:{Authorization:`Bearer ${pat}`},redirect:'error',signal:AbortSignal.timeout(10000)});
   if(!response.ok)fail();const rows=await response.json();if(!Array.isArray(rows))fail();
   const matches=rows.filter(row=>{try{assertStagingCredential(row.api_key);return true;}catch{return false;}});
   if(matches.length!==1)fail();credential=matches[0].api_key;
  }
  assertStagingCredential(credential);
  const response=await request(`https://${STAGING_PROJECT}.supabase.co/rest/v1/rpc/get_admin_purchase_capabilities`,{method:'POST',headers:{apikey:credential,Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:'{}',redirect:'error',signal:AbortSignal.timeout(10000)});
  if(!response.ok)fail();const rows=await response.json();if(!Array.isArray(rows)||rows.length!==1||!fields.every(f=>rows[0][f]===false))fail();
  return credential;
 }catch{fail();}
}
