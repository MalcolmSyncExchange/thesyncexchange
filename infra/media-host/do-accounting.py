"""Root-only monotonic accounting sampler for this DO host. No Google state."""
import json,os,pathlib,time,fcntl,hashlib,argparse,uuid
ROOT=pathlib.Path('/var/lib/tse-audio/accounting');OUT=pathlib.Path('/run/tse-audio/accounting/usage.json')
def atomic(path,value):
 tmp=path.with_suffix('.tmp')
 with tmp.open('w') as f:json.dump(value,f);f.flush();os.fsync(f.fileno())
 os.chmod(tmp,0o640);os.chown(tmp,0,20000);tmp.replace(path)
 fd=os.open(path.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':')).encode()).hexdigest()
def checked(value):
 if value.get('provider')!='digitalocean' or value.get('host_id')!='620470021':raise ValueError('ACCOUNTING_IDENTITY')
 if str(uuid.UUID(value['boot_id']))!=value['boot_id']:raise ValueError('ACCOUNTING_BOOT')
 for k in ('traffic_bytes','log_bytes','sampled_at'):
  if type(value.get(k)) is not int or value[k]<0:raise ValueError('ACCOUNTING_COUNTER')
 if value.get('version')==2:
  for k in ('traffic_offset','raw_traffic_bytes','log_floor'):
   if type(value.get(k))is not int or value[k]<0:raise ValueError('ACCOUNTING_COUNTER')
  if value['traffic_bytes']!=value['traffic_offset']+value['raw_traffic_bytes'] or value['log_bytes']<value['log_floor']:raise ValueError('ACCOUNTING_TOTAL')
 return value
def exclusive_json(path,value):
 data=json.dumps(value,sort_keys=True,separators=(',',':')).encode()+b'\n'
 fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
 fd=os.open(path.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
def reconcile(root,boot,expected_digest,gap_traffic,gap_logs,evidence,now):
 # Operator-only transition. Never rewrite the retained v1 ledger or job ledger.
 old=checked(json.loads((root/'state.json' if (root/'state.json').exists() else root/'ledger.json').read_text()))
 if str(uuid.UUID(boot))!=boot or boot==old['boot_id']:raise ValueError('RECONCILIATION_BOOT')
 if digest(old)!=expected_digest:raise ValueError('RECONCILIATION_STALE')
 if any(type(n)is not int or n<0 for n in (gap_traffic,gap_logs,now)) or now<old['sampled_at']:raise ValueError('RECONCILIATION_BOUND')
 if not isinstance(evidence,dict) or evidence.get('previous_boot')!=old['boot_id'] or evidence.get('current_boot')!=boot or evidence.get('traffic_bound_bytes')!=gap_traffic or evidence.get('log_bound_bytes')!=gap_logs or not evidence.get('source') or evidence.get('coverage_start_ms',now)>old['sampled_at'] or not old['sampled_at']<=evidence.get('current_boot_start_ms',0)<=now or evidence.get('coverage_end_ms',0)<evidence.get('current_boot_start_ms',0):raise ValueError('RECONCILIATION_EVIDENCE')
 events=root/'reconciliations';events.mkdir(mode=0o700,exist_ok=True)
 event={'version':2,'previous':old,'previous_sha256':digest(old),'new_boot':boot,'traffic_offset':old['traffic_bytes']+gap_traffic,'log_floor':old['log_bytes']+gap_logs,'evidence':evidence,'created_at':now}
 path=events/(boot+'.json')
 if path.exists():
  prior=json.loads(path.read_text());event['created_at']=prior.get('created_at')
  if prior!=event:raise ValueError('RECONCILIATION_CONFLICT')
 else:exclusive_json(path,event)
 return event
def advance(root,old,boot,tx,logs,now):
 if old:checked(old)
 event_path=root/'reconciliations'/(boot+'.json')
 event=json.loads(event_path.read_text()) if event_path.exists() else None
 if old and old['boot_id']!=boot:
  if not event or event.get('new_boot')!=boot or event.get('previous_sha256')!=digest(old) or digest(event.get('previous'))!=digest(old):raise ValueError('REBOOT_ACCOUNTING_RECONCILIATION_REQUIRED')
  evidence=event.get('evidence',{})
  for field in ('traffic_bound_bytes','log_bound_bytes'):
   if type(evidence.get(field))is not int or evidence[field]<0:raise ValueError('RECONCILIATION_CORRUPT')
  if event.get('traffic_offset')!=old['traffic_bytes']+evidence['traffic_bound_bytes'] or event.get('log_floor')!=old['log_bytes']+evidence['log_bound_bytes']:raise ValueError('RECONCILIATION_CORRUPT')
  offset=event['traffic_offset'];floor=event['log_floor'];last_raw=0
 elif old:
  offset=old.get('traffic_offset',0);floor=old.get('log_floor',0);last_raw=old.get('raw_traffic_bytes',old['traffic_bytes'])
 else:raise ValueError('ACCOUNTING_BASELINE_REQUIRED')
 if tx<last_raw:raise ValueError('COUNTER_REGRESSION')
 if now<old['sampled_at']:raise ValueError('ACCOUNTING_CLOCK_REGRESSION')
 value={'version':2,'provider':'digitalocean','host_id':'620470021','boot_id':boot,'traffic_offset':offset,'log_floor':floor,'raw_traffic_bytes':tx,'traffic_bytes':offset+tx,'log_bytes':max(logs,floor,old['log_bytes']),'sampled_at':now}
 return checked(value)
def sample():
 if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED')
 ROOT.mkdir(parents=True,exist_ok=True,mode=0o700);OUT.parent.mkdir(parents=True,exist_ok=True,mode=0o750)
 with (ROOT/'lock').open('a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  boot=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()
  # All external host traffic, not merely successful job requests. Double-counting
  # transfers already reserved by SQL is deliberately conservative.
  tx=sum(int(p.read_text()) for p in pathlib.Path('/sys/class/net').glob('*/statistics/tx_bytes') if p.parents[1].name!='lo' and not p.parents[1].name.startswith(('veth','docker','br-')))
  logs=sum(p.stat().st_size for p in pathlib.Path('/var/lib/docker/containers').glob('**/*.log') if p.is_file())
  path=ROOT/'state.json';legacy=ROOT/'ledger.json';old=json.loads((path if path.exists() else legacy).read_text())
  value=advance(ROOT,old,boot,tx,logs,int(time.time()*1000))
  atomic(path,value);atomic(OUT,value)
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('--reconcile-evidence');parser.add_argument('--expected-state-sha256');args=parser.parse_args()
 if args.reconcile_evidence:
  if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED')
  evidence=json.loads(pathlib.Path(args.reconcile_evidence).read_text());boot=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()
  with (ROOT/'lock').open('a') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX);reconcile(ROOT,boot,args.expected_state_sha256,evidence['traffic_bound_bytes'],evidence['log_bound_bytes'],evidence,int(time.time()*1000))
 else:sample()
