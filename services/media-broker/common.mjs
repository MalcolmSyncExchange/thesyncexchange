import { createHash } from 'node:crypto';
import { Transform } from 'node:stream';
export const STAGING='xgbiypruultmzbwhhjrx', PROJECT='tse-security-staging-media';
export const codes=new Set(['AUTH_DENIED','TARGET_MISMATCH','PERMIT_INVALID','JOB_NOT_ELIGIBLE','LEASE_STALE','INPUT_MISMATCH','OUTPUT_TOO_LARGE','OUTPUT_PROVENANCE_MISMATCH','STORAGE_CONFLICT','TEMPORARY_SYSTEM_ERROR']);
export class BrokerError extends Error {constructor(code){super(codes.has(code)?code:'TEMPORARY_SYSTEM_ERROR');this.code=this.message;}}
export function requireValue(ok,code='AUTH_DENIED'){if(!ok)throw new BrokerError(code);}
export const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export function exactKeys(value,keys){requireValue(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.sort().join(','),'PERMIT_INVALID');}
export function leaseBody(v){exactKeys(v,['permit_id','execution_name','job_id','lease_epoch','lease_token']);requireValue(uuid(v.permit_id)&&uuid(v.job_id)&&uuid(v.lease_token)&&Number.isSafeInteger(v.lease_epoch)&&v.lease_epoch>0,'LEASE_STALE');return v;}
export function stagingConfig(e){
 requireValue(!Object.values(e).some(v=>typeof v==='string'&&v.includes('sgpubcpldfxcuhjjdcau')),'TARGET_MISMATCH');
 requireValue(e.MEDIA_ENV==='security-staging'&&e.GCP_PROJECT===PROJECT&&e.SUPABASE_REF===STAGING&&e.SUPABASE_URL===`https://${STAGING}.supabase.co`,'TARGET_MISMATCH');
 requireValue(/^https:\/\/media-broker-staging-[0-9]+\.us-east5\.run\.app$/.test(e.BROKER_AUDIENCE)&&e.BROKER_URL===e.BROKER_AUDIENCE,'TARGET_MISMATCH');
 for(const role of ['WORKER','DISPATCHER'])requireValue(/^[0-9]{6,30}$/.test(e[role+'_SUBJECT'])&&e[role+'_EMAIL']===`media-${role.toLowerCase()}-staging@${PROJECT}.iam.gserviceaccount.com`,'TARGET_MISMATCH');
 requireValue(e.WORKER_SUBJECT!==e.DISPATCHER_SUBJECT,'TARGET_MISMATCH');
 for(const name of ['DB_SECRET','STORAGE_SECRET']) if(e[name])requireValue(new RegExp(`^projects/${PROJECT}/secrets/media-${name==='DB_SECRET'?'db':'storage'}-staging/versions/[1-9][0-9]*$`).test(e[name]),'TARGET_MISMATCH');
 return Object.freeze({...e});
}
export class BoundedStream extends Transform {
 constructor(max,expected=null,sha=null){super();this.max=max;this.expected=expected;this.sha=sha;this.bytes=0;this.hash=createHash('sha256');}
 _transform(chunk,encoding,done){this.bytes+=chunk.length;if(this.bytes>this.max)return done(new BrokerError('OUTPUT_TOO_LARGE'));this.hash.update(chunk);done(null,chunk);}
 _flush(done){this.digest=this.hash.digest('hex');if((this.expected!==null&&this.bytes!==Number(this.expected))||(this.sha&&this.digest!==this.sha))return done(new BrokerError('INPUT_MISMATCH'));done();}
}
export async function jsonBody(req,max=8192){let bytes=0;const parts=[];for await(const p of req){bytes+=p.length;requireValue(bytes<=max,'OUTPUT_TOO_LARGE');parts.push(p);}try{return JSON.parse(Buffer.concat(parts).toString());}catch{throw new BrokerError('PERMIT_INVALID');}}
export function publicJob(j){const {bucket:_bucket,path:_path,...out}=j;if(out.source){const {bucket:_b,path:_p,...source}=out.source;out.source=source;}return out;}
export function logEvent(log,value){const keys=['job_id','asset_id','permit_id','execution_id','profile','attempt','stage','duration','bytes','code'];log(Object.fromEntries(Object.entries(value).filter(([k])=>keys.includes(k))));}

export async function boundedText(response,max=65536){requireValue(response.body,'TEMPORARY_SYSTEM_ERROR');const parts=[];let size=0;for await(const chunk of response.body){size+=chunk.length;requireValue(size<=max,'OUTPUT_TOO_LARGE');parts.push(chunk);}return Buffer.concat(parts).toString();}
export async function boundedJson(response,max=65536){try{return JSON.parse(await boundedText(response,max));}catch{throw new BrokerError('TEMPORARY_SYSTEM_ERROR');}}
