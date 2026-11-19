"""Root-only identity renewal, not job or budget authorization.

The operator installs a finite monthly policy. Neither broker nor parser can
renew it. Existing SQL admission, financial gates and per-job deadlines remain.
No database credentials or private signing keys are read or persisted here.
"""
import base64,json,os,pathlib,stat,time,uuid,subprocess

BASE=pathlib.Path('/etc/tse-audio')
RAM=pathlib.Path('/run/tse-audio')
FIELDS='version provider droplet_id region root_uuid boot_id worker_manifest broker_manifest source_commit issued_at expires_at nonce mode'.split()
HOST='620470021'
ROOT='59134bd0-a76f-4ea0-8e4a-770b2e1eafc2'

def sealed(path):
 st=path.lstat()
 if not stat.S_ISREG(st.st_mode) or st.st_uid!=0 or st.st_mode&0o022 or st.st_size>65536:
  raise ValueError('SEALED_OPERATOR_FILE_REQUIRED')
 return json.loads(path.read_text())

def validate(policy,seed,usage,boot,root,now):
 if type(now)is not int or str(uuid.UUID(boot))!=boot:raise ValueError('LIVE_BOOT_REQUIRED')
 expected={'version','enabled','host_id','root_uuid','boot_id','month','ceiling_usd','expires_at','max_workers'}
 if set(policy)!=expected or policy['version']!=1 or policy['enabled'] is not True or policy['host_id']!=HOST or policy['root_uuid']!=ROOT or root!=ROOT or policy['boot_id']!=boot:
  raise ValueError('SERVICE_IDENTITY_DENIED')
 # This implementation cannot authorize another month, host or spending limit.
 if policy['month']!='2026-11' or policy['ceiling_usd']!=20 or policy['max_workers']!=1 or type(policy['expires_at'])is not int or not now<policy['expires_at']<=1796083200000:
  raise ValueError('FINITE_SERVICE_POLICY_REQUIRED')
 if time.strftime('%Y-%m',time.gmtime(now/1000))!=policy['month']:
  raise ValueError('SERVICE_MONTH_EXPIRED')
 p=seed.get('provisioning',{});b=seed.get('binding',{});g=seed.get('guest',{})
 if set(b)!=set(FIELDS) or b.get('version')!=1 or b.get('provider')!='digitalocean' or b.get('region')!='nyc3' or p.get('source')!='authenticated-digitalocean-control-panel' or p.get('id')!=HOST or p.get('root_uuid')!=ROOT or p.get('region')!='nyc3' or p.get('size')!='s-1vcpu-2gb' or p.get('image')!='ubuntu-24-04-x64' or b.get('droplet_id')!=HOST or b.get('root_uuid')!=ROOT or b.get('boot_id')!=boot or g.get('boot_id')!=boot or g.get('droplet_id')!=HOST or g.get('root_uuid')!=ROOT or g.get('machine')!='x86_64' or b.get('mode')!='founder-beta':
  raise ValueError('OPERATOR_PROVISIONING_REQUIRED')
 if usage.get('host_id')!=HOST or usage.get('boot_id')!=boot or usage.get('provider')!='digitalocean' or type(usage.get('sampled_at'))is not int or not 0<=now-usage['sampled_at']<90000:
  raise ValueError('FRESH_RECONCILED_ACCOUNTING_REQUIRED')
 for key in ('traffic_bytes','log_bytes'):
  if type(usage.get(key))is not int or usage[key]<0:raise ValueError('ACCOUNTING_COUNTER_REQUIRED')
 return min(now+3600000,policy['expires_at'])

def renew(policy,seed,usage,boot,root,now):
 from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
 from cryptography.hazmat.primitives import serialization
 until=validate(policy,seed,usage,boot,root,now)
 # Verify the original sealed signature, even though its old lease may expire.
 public=serialization.load_pem_public_key(seed['operatorPublicKey'].encode())
 original=json.dumps({k:seed['binding'][k] for k in FIELDS},separators=(',',':')).encode()
 public.verify(base64.b64decode(seed['signature'],validate=True),original)
 binding=dict(seed['binding']);binding.update(issued_at=now,expires_at=until,nonce=str(uuid.uuid4()))
 binding={k:binding[k] for k in FIELDS}
 key=Ed25519PrivateKey.generate()
 raw=json.dumps(binding,separators=(',',':')).encode()
 return dict(seed,binding=binding,signature=base64.b64encode(key.sign(raw)).decode(),operatorPublicKey=key.public_key().public_bytes(serialization.Encoding.PEM,serialization.PublicFormat.SubjectPublicKeyInfo).decode())

def main():
 if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED')
 if pathlib.Path('/var/lib/tse-audio/SUSPENDED').exists():raise ValueError('HOLD_PRESERVED')
 policy=sealed(BASE/'availability-policy.json');seed=sealed(BASE/'availability-seed.json')
 usage=sealed(RAM/'accounting/usage.json')
 root=subprocess.run(['/usr/bin/findmnt','-n','-o','UUID','/'],capture_output=True,text=True,check=True,timeout=5).stdout.strip()
 boot=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()
 value=renew(policy,seed,usage,boot,root,int(time.time()*1000))
 path=RAM/('host-binding.'+uuid.uuid4().hex+'.next')
 with path.open('x') as f:
  os.fchmod(f.fileno(),0o640);os.fchown(f.fileno(),0,20000)
  json.dump(value,f);f.flush();os.fsync(f.fileno())
 path.replace(RAM/'host-binding.json')
 fd=os.open(RAM,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)

if __name__=='__main__':main()
