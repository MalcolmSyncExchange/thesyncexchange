import base64,copy,importlib.util,json,pathlib,subprocess,unittest,uuid
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('availability',ROOT/'infra/media-host/do-availability.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
NOW=1795070000000;BOOT=str(uuid.uuid4())
def fixture():
 p=dict(version=1,enabled=True,host_id=m.HOST,root_uuid=m.ROOT,boot_id=BOOT,month='2026-11',ceiling_usd=20,expires_at=1796083200000,max_workers=1)
 b=dict(version=1,provider='digitalocean',droplet_id=m.HOST,region='nyc3',root_uuid=m.ROOT,boot_id=BOOT,worker_manifest='sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876',broker_manifest='sha256:f654923c3b73d6e9d506be36e868a9c33b116872212070a8a98db56d9dc35b15',source_commit='bed61df8f3a98f6d59a48d56a4a8cf4eb2880e55',issued_at=NOW-7200000,expires_at=NOW-3600000,nonce=str(uuid.uuid4()),mode='founder-beta')
 k=Ed25519PrivateKey.generate()
 seed=dict(binding=b,signature=base64.b64encode(k.sign(json.dumps(b,separators=(',',':')).encode())).decode(),operatorPublicKey=k.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode(),provisioning=dict(source='authenticated-digitalocean-control-panel',id=m.HOST,root_uuid=m.ROOT,region='nyc3',size='s-1vcpu-2gb',image='ubuntu-24-04-x64'),guest=dict(droplet_id=m.HOST,region='nyc3',root_uuid=m.ROOT,boot_id=BOOT,machine='x86_64'))
 u=dict(provider='digitalocean',host_id=m.HOST,boot_id=BOOT,traffic_bytes=123,log_bytes=99,sampled_at=NOW)
 return p,seed,u
class Tests(unittest.TestCase):
 def test_renewal_is_bounded_and_cross_verified_by_existing_node_verifier(self):
  p,s,u=fixture();v=m.renew(p,s,u,BOOT,m.ROOT,NOW)
  self.assertEqual(v['binding']['expires_at'],NOW+3600000)
  self.assertNotEqual(v['binding']['nonce'],s['binding']['nonce'])
  self.assertNotIn('private',json.dumps(v).lower())
  script="import {verifyLinuxHostBinding} from './services/media-broker/linux-host-binding.mjs';let t='';for await(const b of process.stdin)t+=b;const s=JSON.parse(t),b=s.binding;verifyLinuxHostBinding({...s,now:"+str(NOW)+",expected:{droplet_id:b.droplet_id,root_uuid:b.root_uuid,worker_manifest:b.worker_manifest,broker_manifest:b.broker_manifest,source_commit:b.source_commit,mode:'founder-beta'}});console.log('verified');"
  r=subprocess.run(['node','--input-type=module','-e',script],input=json.dumps(v),text=True,capture_output=True,cwd=ROOT,check=True)
  self.assertEqual(r.stdout.strip(),'verified')
 def test_month_end_is_not_extended(self):
  p,s,u=fixture();p['expires_at']=NOW+1
  self.assertEqual(m.renew(p,s,u,BOOT,m.ROOT,NOW)['binding']['expires_at'],NOW+1)
 def test_policy_failures(self):
  for patch in [dict(enabled=False),dict(host_id='other'),dict(root_uuid=str(uuid.uuid4())),dict(boot_id=str(uuid.uuid4())),dict(month='2026-12'),dict(ceiling_usd=21),dict(max_workers=2),dict(expires_at=NOW),dict(expires_at=1796083200001),dict(extra=True)]:
   with self.subTest(patch=patch):
    p,s,u=fixture();p.update(patch)
    with self.assertRaises(ValueError):m.renew(p,s,u,BOOT,m.ROOT,NOW)
 def test_stale_or_ambiguous_accounting_and_wrong_boot_fail_closed(self):
  for patch in [dict(sampled_at=NOW-90000),dict(sampled_at=NOW+1),dict(boot_id=str(uuid.uuid4())),dict(host_id='other'),dict(traffic_bytes=-1),dict(log_bytes=None)]:
   with self.subTest(patch=patch):
    p,s,u=fixture();u.update(patch)
    with self.assertRaises(ValueError):m.renew(p,s,u,BOOT,m.ROOT,NOW)
 def test_invalid_operator_seed_is_not_replaced_with_trust(self):
  p,s,u=fixture();s['signature']=base64.b64encode(bytes(64)).decode()
  with self.assertRaises(Exception):m.renew(p,s,u,BOOT,m.ROOT,NOW)
  for field,value in [('provider','google'),('droplet_id','8797328859122759463'),('mode','maintenance')]:
   p,s,u=fixture();s['binding'][field]=value
   with self.assertRaises(ValueError):m.renew(p,s,u,BOOT,m.ROOT,NOW)
if __name__=='__main__':unittest.main()
