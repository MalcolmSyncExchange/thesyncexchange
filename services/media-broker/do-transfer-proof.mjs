import {createPublicKey,verify} from 'node:crypto';
const keys=['version','host_id','run_id','boot_id','job_id','lease_epoch','lease_token','nonce','operation','bytes','sha256','issued_at','expires_at'];
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const deny=()=>{throw Error('DO_TRANSFER_DENIED');};
export function transferBytes(p){
 if(!p||Object.keys(p).length!==keys.length||keys.some(k=>!Object.hasOwn(p,k))||p.version!==1||p.host_id!=='620470021'||!['run_id','boot_id','job_id','lease_token','nonce'].every(k=>uuid(p[k]))||!Number.isSafeInteger(p.lease_epoch)||p.lease_epoch<1||!['input','output','verify'].includes(p.operation)||!Number.isSafeInteger(p.issued_at)||!Number.isSafeInteger(p.expires_at))deny();
 if(p.operation==='input'?(p.bytes!==null||p.sha256!==null):(!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>4000000||!/^[a-f0-9]{64}$/.test(p.sha256)))deny();
 return Buffer.from(JSON.stringify(Object.fromEntries(keys.map(k=>[k,p[k]]))));
}
export function verifyTransfer(p,signature,key,now=Date.now()){
 const bytes=transferBytes(p);if(typeof signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(signature)||p.issued_at>now||p.expires_at<=now||p.expires_at<=p.issued_at||p.expires_at-p.issued_at>30000)deny();
 try{const publicKey=createPublicKey(key);if(publicKey.asymmetricKeyType!=='ed25519'||!verify(null,bytes,publicKey,Buffer.from(signature,'base64')))deny();}catch{deny();}
 return Object.freeze({...p});
}

const launchKeys=['version','host_id','run_id','boot_id','worker_digest','nonce','issued_at','expires_at'];
export function launchBytes(p){if(!p||Object.keys(p).length!==launchKeys.length||launchKeys.some(k=>!Object.hasOwn(p,k))||p.version!==1||p.host_id!=='620470021'||!['run_id','boot_id','nonce'].every(k=>uuid(p[k]))||p.worker_digest!=='sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876'||!Number.isSafeInteger(p.issued_at)||!Number.isSafeInteger(p.expires_at))deny();return Buffer.from(JSON.stringify(Object.fromEntries(launchKeys.map(k=>[k,p[k]]))));}
export function verifyLaunch(p,signature,key,now=Date.now()){const bytes=launchBytes(p);if(typeof signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(signature)||p.issued_at>now||p.expires_at<=now||p.expires_at<=p.issued_at||p.expires_at-p.issued_at>10000)deny();try{const publicKey=createPublicKey(key);if(publicKey.asymmetricKeyType!=='ed25519'||!verify(null,bytes,publicKey,Buffer.from(signature,'base64')))deny();}catch{deny();}return Object.freeze({...p});}
