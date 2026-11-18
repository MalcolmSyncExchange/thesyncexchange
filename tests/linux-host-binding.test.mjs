import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {bindingBytes,verifyLinuxHostBinding} from '../services/media-broker/linux-host-binding.mjs';
const keys=generateKeyPairSync('ed25519');
function fixture(){
 const now=Date.now();
 const binding={version:1,provider:'digitalocean',droplet_id:'620470021',region:'nyc3',root_uuid:'59134bd0-a76f-4ea0-8e4a-770b2e1eafc2',boot_id:randomUUID(),worker_manifest:'sha256:'+'a'.repeat(64),broker_manifest:'sha256:'+'b'.repeat(64),source_commit:'c'.repeat(40),issued_at:now-1000,expires_at:now+60000,nonce:randomUUID(),mode:'maintenance'};
 const expected={...binding};
 const provisioning={source:'authenticated-digitalocean-control-panel',id:binding.droplet_id,region:'nyc3',size:'s-1vcpu-2gb',image:'ubuntu-24-04-x64',root_uuid:binding.root_uuid};
 const guest={droplet_id:binding.droplet_id,region:'nyc3',root_uuid:binding.root_uuid,boot_id:binding.boot_id,machine:'x86_64'};
 return {binding,expected,provisioning,guest,now,operatorPublicKey:keys.publicKey,signature:sign(null,bindingBytes(binding),keys.privateKey).toString('base64')};
}
test('authenticated provisioning, guest boot and signed sealed inventory bind exactly; no processing authority implied',()=>{
 const result=verifyLinuxHostBinding(fixture());assert.equal(result.verified,true);assert.equal(result.job_admission_granted,false);assert.ok(Object.isFrozen(result));
});
for(const [label,mutate] of [
 ['missing independent evidence',f=>delete f.provisioning],
 ['guest metadata masquerading as authoritative record',f=>f.provisioning.source='guest-metadata'],
 ['wrong provider ID',f=>f.provisioning.id='8797328859122759463'],
 ['wrong guest ID',f=>f.guest.droplet_id='620470022'],
 ['wrong disk',f=>f.guest.root_uuid=randomUUID()],
 ['wrong boot',f=>f.guest.boot_id=randomUUID()],
 ['wrong region',f=>f.provisioning.region='sfo2'],
 ['wrong architecture',f=>f.guest.machine='aarch64'],
 ['unexpected image',f=>f.expected.worker_manifest='sha256:'+'d'.repeat(64)],
 ['modified signature',f=>f.signature='A'.repeat(86)+'=='],
 ['unexpected signing algorithm',f=>f.operatorPublicKey=generateKeyPairSync('rsa',{modulusLength:2048}).publicKey],
 ['expired binding',f=>f.now=f.binding.expires_at],
 ['future binding',f=>f.now=f.binding.issued_at-1],
 ['unapproved production flag',f=>f.binding.production_enabled=true],
 ['changed mode',f=>f.binding.mode='founder-beta'],
 ['missing seal',f=>delete f.expected]
])test(`host binding rejects ${label}`,()=>{const f=fixture();mutate(f);assert.throws(()=>verifyLinuxHostBinding(f),/LINUX_HOST_BINDING_DENIED/);});
