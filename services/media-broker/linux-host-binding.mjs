// Root-installed deployment identity only. This does not grant job admission,
// clear a watchdog hold, or substitute a DigitalOcean host for a Google identity.
import {verify,createPublicKey,KeyObject} from 'node:crypto';

const fields=['version','provider','droplet_id','region','root_uuid','boot_id','worker_manifest','broker_manifest','source_commit','issued_at','expires_at','nonce','mode'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const digest=/^sha256:[a-f0-9]{64}$/;
const deny=()=>{throw new Error('LINUX_HOST_BINDING_DENIED');};

export function bindingBytes(binding){
 if(!binding||typeof binding!=='object'||Array.isArray(binding)||Object.keys(binding).length!==fields.length||fields.some(k=>!Object.hasOwn(binding,k)))deny();
 if(binding.version!==1||binding.provider!=='digitalocean'||!/^[1-9][0-9]{5,19}$/.test(binding.droplet_id)||binding.region!=='nyc3'||
   !uuid.test(binding.root_uuid)||!uuid.test(binding.boot_id)||!uuid.test(binding.nonce)||!digest.test(binding.worker_manifest)||!digest.test(binding.broker_manifest)||
   !/^[a-f0-9]{40}$/.test(binding.source_commit)||!Number.isSafeInteger(binding.issued_at)||!Number.isSafeInteger(binding.expires_at)||
   !['maintenance','founder-beta'].includes(binding.mode))deny();
 return Buffer.from(JSON.stringify(Object.fromEntries(fields.map(k=>[k,binding[k]]))));
}

export function verifyLinuxHostBinding({binding,signature,operatorPublicKey,provisioning,guest,expected,now=Date.now()}){
 const bytes=bindingBytes(binding);
 if(typeof signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(signature))deny();
 const signed=Buffer.from(signature,'base64');
 try{const key=operatorPublicKey instanceof KeyObject?operatorPublicKey:createPublicKey(operatorPublicKey);
  if(key.type!=='public'||key.asymmetricKeyType!=='ed25519'||signed.length!==64||!verify(null,bytes,key,signed))deny();
 }catch{deny();}
 // provisioning and expected are trusted operator inputs loaded from sealed,
 // root-owned inventory. Never populate either from the guest's own metadata.
 if(!provisioning||provisioning.source!=='authenticated-digitalocean-control-panel'||provisioning.id!==binding.droplet_id||
   provisioning.region!=='nyc3'||provisioning.size!=='s-1vcpu-2gb'||provisioning.image!=='ubuntu-24-04-x64'||provisioning.root_uuid!==binding.root_uuid)deny();
 if(!guest||guest.droplet_id!==binding.droplet_id||guest.region!=='nyc3'||guest.root_uuid!==binding.root_uuid||guest.boot_id!==binding.boot_id||guest.machine!=='x86_64')deny();
 if(!expected||expected.droplet_id!==binding.droplet_id||expected.root_uuid!==binding.root_uuid||expected.worker_manifest!==binding.worker_manifest||
   expected.broker_manifest!==binding.broker_manifest||expected.source_commit!==binding.source_commit||expected.mode!==binding.mode)deny();
 if(!Number.isSafeInteger(now)||binding.issued_at>now||binding.expires_at<=now||binding.expires_at-binding.issued_at>3_600_000||binding.expires_at<=binding.issued_at)deny();
 return Object.freeze({...binding,verified:true,job_admission_granted:false});
}
