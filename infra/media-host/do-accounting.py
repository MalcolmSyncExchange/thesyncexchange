"""Root-only monotonic accounting sampler for this DO host. No Google state."""
import json,os,pathlib,time,fcntl
ROOT=pathlib.Path('/var/lib/tse-audio/accounting');OUT=pathlib.Path('/run/tse-audio/accounting/usage.json')
def atomic(path,value):
 tmp=path.with_suffix('.tmp')
 with tmp.open('w') as f:json.dump(value,f);f.flush();os.fsync(f.fileno())
 os.chmod(tmp,0o640);os.chown(tmp,0,20000);tmp.replace(path)
 fd=os.open(path.parent,os.O_RDONLY)
 try:os.fsync(fd)
 finally:os.close(fd)
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
  path=ROOT/'ledger.json';old=json.loads(path.read_text()) if path.exists() else None
  if old and old['boot_id']!=boot:raise ValueError('REBOOT_ACCOUNTING_RECONCILIATION_REQUIRED')
  if old and tx<old['traffic_bytes']:raise ValueError('COUNTER_REGRESSION')
  value={'provider':'digitalocean','host_id':'620470021','boot_id':boot,'traffic_bytes':tx,'log_bytes':max(logs,old['log_bytes'] if old else 0),'sampled_at':int(time.time()*1000)}
  atomic(path,value);atomic(OUT,value)
if __name__=='__main__':sample()
