"""Root container supervisor; systemd encrypted credentials become RAM-only,
broker-readable copies. Neither credentials nor Docker are mounted in parser."""
import json,os,pathlib,shutil,signal,subprocess
CONFIG=pathlib.Path('/etc/tse-audio/broker-runtime.json');RAM=pathlib.Path('/run/tse-audio/credentials')
def stop(*_):
 subprocess.run(['/usr/bin/docker','stop','--time=10','tse-do-broker-beta'],capture_output=True,timeout=15)
def main():
 if os.geteuid()!=0:raise ValueError('ROOT_REQUIRED')
 config=json.loads(CONFIG.read_text());image=config['image']
 if not image.startswith('sha256:') or len(image)!=71:raise ValueError('PINNED_IMAGE_REQUIRED')
 if RAM.exists():raise ValueError('UNRECONCILED_CREDENTIAL_DIRECTORY')
 RAM.mkdir(mode=0o700);os.chown(RAM,20000,20000)
 source=pathlib.Path(os.environ['CREDENTIALS_DIRECTORY'])
 try:
  for name in ['db','host-signer']:
   data=(source/name).read_bytes()
   if not 1<=len(data)<=16384:raise ValueError('BOUNDED_CREDENTIAL_REQUIRED')
   path=RAM/name
   with path.open('xb') as f:f.write(data);f.flush();os.fsync(f.fileno())
   os.chmod(path,0o400);os.chown(path,20000,20000)
  # Root independently checks live admission over TLS before each parser start.
  root_signer=pathlib.Path('/run/tse-audio/root-signer')
  with root_signer.open('xb') as f:f.write((source/'host-signer').read_bytes())
  os.chmod(root_signer,0o400)
  for sig in [signal.SIGINT,signal.SIGTERM]:signal.signal(sig,stop)
  args=['/usr/bin/docker','run','--name=tse-do-broker-beta','--pull=never','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--network=host','--dns=127.0.0.53','--user=20000:20000','--group-add=1000','--cpus=.3','--memory=256m','--memory-swap=256m','--pids-limit=64','--restart=no','--log-opt=max-size=1m','--log-opt=max-file=3','--tmpfs=/work:rw,noexec,nosuid,nodev,size=16m,mode=700,uid=20000,gid=20000','--mount','type=bind,src=/etc/tse-audio,dst=/etc/tse-audio,readonly','--mount','type=bind,src=/run/tse-audio,dst=/run/tse-audio','--mount','type=bind,src='+str(RAM)+',dst=/run/credentials/tse-do,readonly','--mount','type=bind,src=/var/lib/tse-audio/broker-scratch,dst=/var/lib/tse-audio/broker-scratch','--env=MEDIA_DO_ENABLED=founder-beta','--env=CREDENTIALS_DIRECTORY=/run/credentials/tse-do',image]
  return subprocess.run(args,env={'PATH':'/usr/bin:/bin'}).returncode
 finally:
  subprocess.run(['/usr/bin/docker','rm','-f','tse-do-broker-beta'],capture_output=True,timeout=20)
  shutil.rmtree(RAM,ignore_errors=True);pathlib.Path('/run/tse-audio/root-signer').unlink(missing_ok=True)
if __name__=='__main__':raise SystemExit(main())
