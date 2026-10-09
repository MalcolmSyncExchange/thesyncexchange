import { createPublicKey,verify } from 'node:crypto';
import { BrokerError,requireValue,boundedText,boundedJson } from './common.mjs';
const CERTS='https://www.googleapis.com/oauth2/v3/certs';
export class GoogleIdentity {
 constructor(config,fetcher=fetch,now=()=>Date.now()){this.config=config;this.fetcher=fetcher;this.now=now;this.keys=[];this.loaded=0;}
 async verify(header){try{
 requireValue(typeof header==='string'&&header.length<=8192&&header.startsWith('Bearer '));
 const token=header.slice(7),parts=token.split('.');requireValue(parts.length===3&&parts.every(x=>/^[a-zA-Z0-9_-]+$/.test(x)));
 const h=JSON.parse(Buffer.from(parts[0],'base64url')),c=JSON.parse(Buffer.from(parts[1],'base64url'));requireValue(h.alg==='RS256'&&typeof h.kid==='string'&&h.kid.length<=128);
 if(this.now()-this.loaded>300000||!this.loaded){const r=await this.fetcher(CERTS,{redirect:'error',signal:AbortSignal.timeout(5000)});requireValue(r.ok);this.keys=(await boundedJson(r)).keys;requireValue(Array.isArray(this.keys)&&this.keys.length<=10);this.loaded=this.now();}
 const key=this.keys.find(k=>k.kid===h.kid&&k.kty==='RSA');requireValue(key&&verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key,format:'jwk'}),Buffer.from(parts[2],'base64url')));
 const seconds=this.now()/1000;requireValue(['https://accounts.google.com','accounts.google.com'].includes(c.iss)&&c.aud===this.config.BROKER_AUDIENCE&&Number.isFinite(c.exp)&&Number.isFinite(c.iat)&&c.exp>seconds&&c.iat<=seconds+30&&c.exp-c.iat<=3700&&c.email_verified===true);
 for(const role of ['WORKER','DISPATCHER'])if(c.sub===this.config[role+'_SUBJECT']&&c.email===this.config[role+'_EMAIL'])return {role:role.toLowerCase(),subject:c.sub};
 throw new BrokerError('AUTH_DENIED');
 }catch{throw new BrokerError('AUTH_DENIED');}}
}
export async function identityToken(audience,fetcher=fetch){const url='http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience='+encodeURIComponent(audience);const r=await fetcher(url,{headers:{'Metadata-Flavor':'Google'},redirect:'error',signal:AbortSignal.timeout(5000)});requireValue(r.ok);const token=await boundedText(r,8192);return token;}
export async function accessToken(fetcher=fetch){const r=await fetcher('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',{headers:{'Metadata-Flavor':'Google'},redirect:'error',signal:AbortSignal.timeout(5000)});requireValue(r.ok);const j=await boundedJson(r,16384);requireValue(typeof j.access_token==='string'&&j.access_token.length<=8192);return j.access_token;}
