"""Root Unix-socket launcher. Fixed image/command, no SQL/Storage credentials."""
import fcntl
import http.server
import json
import math
import base64
import urllib.request
import ssl
import tempfile
import signal
import threading
import os
import pathlib
import platform
import re
import shutil
import socketserver
import subprocess
import time
import uuid

ROOT = pathlib.Path('/var/lib/tse-audio/launcher')
CONFIG = pathlib.Path('/etc/tse-audio/launcher.json')
SOCKET = '/run/tse-audio/control/launcher.sock'


def atomic(path, value):
    tmp = path.with_suffix('.tmp')
    with tmp.open('w') as f:
        json.dump(value, f); f.flush(); os.fsync(f.fileno())
    tmp.replace(path)
    fd = os.open(path.parent, os.O_RDONLY)
    try: os.fsync(fd)
    finally: os.close(fd)


def docker(args):
    r = subprocess.run(['/usr/bin/docker'] + args, env={'PATH':'/usr/bin:/bin'}, capture_output=True, text=True, timeout=15)
    if r.returncode:
        raise ValueError('DOCKER_OPERATION_FAILED')
    return r.stdout


def require_live_permit(config, run, now=time.time):
    milliseconds=int(now()*1000)
    proof=dict(version=1,host_id='620470021',run_id=run,boot_id=config['boot_id'],worker_digest=config['build_digest'],nonce=str(uuid.uuid4()),issued_at=milliseconds,expires_at=milliseconds+10000)
    payload=json.dumps(proof,separators=(',',':')).encode()
    # Ed25519 oneshot requires a seekable input with known size on Ubuntu's
    # OpenSSL. The root-only RAM file contains public authorization metadata.
    with tempfile.NamedTemporaryFile(dir='/run/tse-audio/signing',prefix='permit-') as evidence:
        evidence.write(payload);evidence.flush()
        signature=subprocess.run(['/usr/bin/openssl','pkeyutl','-sign','-rawin','-inkey','/run/tse-audio/root-signer','-in',evidence.name],capture_output=True,timeout=3,check=True).stdout
    if len(signature)!=64:raise ValueError('SIGNER_UNAVAILABLE')
    request=urllib.request.Request('https://thesyncexchange.com/api/media/worker-launch',data=b'',method='POST',headers={'x-tse-proof':payload.decode(),'x-tse-signature':base64.b64encode(signature).decode()})
    # No redirects; strict system CA and hostname verification are mandatory.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*args):raise ValueError('REDIRECT_DENIED')
    opener=urllib.request.build_opener(urllib.request.HTTPSHandler(context=ssl.create_default_context()),NoRedirect())
    with opener.open(request,timeout=5) as response:
        if response.status!=200:raise ValueError('LAUNCH_NOT_AUTHORIZED')
        data=response.read(2049)
        if len(data)>2048:raise ValueError('OVERSIZED_AUTHORITY')
    value=json.loads(data)
    if value!={'authorized':True,'run_id':run,'boot_id':config['boot_id'],'host_id':'620470021','worker_digest':config['build_digest']}:raise ValueError('LAUNCH_IDENTITY_MISMATCH')


class Engine:
    def __init__(self, config, root=ROOT, execute=docker, now=time.time, status_path='/run/tse-audio/status/runtime-status.json', authorize=require_live_permit):
        self.config, self.root, self.execute, self.now = config, root, execute, now
        self.status_path=pathlib.Path(status_path)
        self.authorize=authorize
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)

    def identity(self, run):
        if str(uuid.UUID(run)) != run: raise ValueError('RUN_ID_INVALID')
        return self.root / (run + '.json'), 'tse-media-run-' + run

    def inspect(self, name):
        # A successful list distinguishes a missing container from daemon failure.
        ids = self.execute(['ps','-a','--filter','name=^/' + name + '$','--format','{{.ID}}']).strip()
        if not ids: return None
        value = json.loads(self.execute(['inspect',name]))[0]
        if value['Config']['Image'] != self.config['image'] or value['Config']['Labels'].get('io.thesyncexchange.vm-run') != name[14:]:
            raise ValueError('CONTAINER_IDENTITY_CONFLICT')
        return value

    def status(self, run):
        path,name = self.identity(run)
        if not path.exists():
            if self.inspect(name): raise ValueError('ORPHAN_REQUIRES_REVIEW')
            return {'state':'NONE'}
        record=json.loads(path.read_text()); value=self.inspect(name)
        if not value:
            if record['state'] != 'intent': raise ValueError('CONTAINER_DISAPPEARED')
            return {'state':'NONE'}
        if value['State']['Running']:
            if self.now()-record['created_at']>560:
                self.execute(['kill',name]);return self.status(run)
            return {'state':'RUNNING'}
        # CREATED is never restarted after an interrupted launch; a new DB run
        # must be admitted. EXITED containers can never be started a second time.
        record.update(state='exited',exit_code=value['State']['ExitCode'])
        atomic(path,record)
        context=self.root/(run+'.context')
        if context.exists(): context.unlink()
        return {'state':'EXITED','exit_code':record['exit_code']}

    def start(self, context):
        if set(context)!={'run_id','capability','build_digest'} or not re.fullmatch('[a-f0-9]{64}',context['capability']) or context['build_digest'] != self.config['build_digest']:
            raise ValueError('CONTEXT_INVALID')
        path,name=self.identity(context['run_id'])
        if path.exists(): return self.status(context['run_id'])
        if (self.root.parent/'SUSPENDED').exists() or not self.config['enabled'] or shutil.disk_usage(self.root).free<2*1024**3:
            raise ValueError('ADMISSION_CLOSED')
        status=json.loads(self.status_path.read_text())
        if type(status.get('projected_usd')) not in (int,float) or not math.isfinite(status['projected_usd']) or status['projected_usd']<12:raise ValueError('INVALID_ACCOUNTING')
        if status.get('host_id')!='620470021' or status.get('boot_id')!=self.config['boot_id'] or status['paused'] or status['projected_usd']>=15 or not 0<=self.now()*1000-status['sampled_at']<90000:
            raise ValueError('BUDGET_OR_ACCOUNTING_CLOSED')
        for other in self.root.glob('*.json'):
            if self.status(other.stem)['state']=='RUNNING': raise ValueError('ONE_JOB_ONLY')
        image=json.loads(self.execute(['image','inspect',self.config['image']]))[0]
        if image['Architecture']!='amd64' or self.config['image'] not in [image.get('Id')]+image.get('RepoDigests',[]): raise ValueError('IMAGE_NOT_VERIFIED')
        self.authorize(self.config,context['run_id'])
        context_path=self.root/(context['run_id']+'.context')
        with context_path.open('x') as f: json.dump(context,f);f.flush();os.fsync(f.fileno())
        os.chown(context_path,1000,1000);os.chmod(context_path,0o400)
        atomic(path,{'run_id':context['run_id'],'image':self.config['image'],'created_at':self.now(),'state':'intent'})
        args=['create','--name',name,'--pull=never','--label','io.thesyncexchange.vm-run='+context['run_id'],'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--user=1000:1000','--cpus=1','--memory=1g','--memory-swap=1g','--pids-limit=32','--restart=no','--ipc=private','--cgroup-parent=tse-media-worker.slice','--log-opt=max-size=1m','--log-opt=max-file=1','--log-opt=compress=false','--tmpfs=/work:rw,noexec,nosuid,nodev,size=512m,mode=700,uid=1000,gid=1000','--mount','type=bind,src=/run/tse-audio/worker,dst=/run/tse-media,readonly','--mount',f'type=bind,src={context_path},dst=/run/tse-job/context.json,readonly','--env=MEDIA_VM_CONTEXT=/run/tse-job/context.json','--env=TMPDIR=/work','--env=MEDIA_TOOL_DIR=/opt/media/bin','--env=HOME=/nonexistent','--entrypoint=/usr/local/bin/node',self.config['image'],'/app/workers/media/vm-entrypoint.mjs']
        self.execute(args)
        # No retry after an uncertain start. Status reconciles the exact name.
        self.execute(['start',name])
        return self.status(context['run_id'])

    def stop(self, run):
        _,name=self.identity(run)
        if self.status(run)['state']=='RUNNING': self.execute(['kill',name])
        return self.status(run)


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self,*_): pass
    def do_POST(self):
        try:
            self.connection.settimeout(5)
            size=int(self.headers.get('content-length','0'))
            if not 0<size<=4096 or self.path not in ['/start','/stop','/status']: raise ValueError('DENIED')
            body=json.loads(self.rfile.read(size))
            if self.path!='/start' and set(body)!={'run_id'}: raise ValueError('DENIED')
            with (ROOT/'active.lock').open('a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX)
                result=engine.start(body) if self.path=='/start' else getattr(engine,self.path[1:])(body['run_id'])
            data=json.dumps(result).encode();self.send_response(200)
        except BaseException:
            data=b'{"state":"RECONCILIATION_REQUIRED"}';self.send_response(409)
        self.send_header('content-type','application/json');self.send_header('content-length',str(len(data)));self.end_headers();self.wfile.write(data)


class Server(socketserver.UnixStreamServer):
    last_sweep=0
    def service_actions(self):
        if time.time()-self.last_sweep<5:return
        self.last_sweep=time.time()
        try:
            with (ROOT/'active.lock').open('a') as lock:
                fcntl.flock(lock,fcntl.LOCK_EX)
                for p in ROOT.glob('*.json'): engine.status(p.stem)
        except BaseException:
            # The cgroup kill is independent of Docker API availability.
            try:subprocess.run(['/usr/bin/systemctl','kill','--kill-whom=all','--signal=KILL','tse-media-worker.slice'],capture_output=True,timeout=5)
            except BaseException:pass
            marker=ROOT.parent/'SUSPENDED'
            if not marker.exists():marker.write_text('LAUNCHER_RECONCILIATION_REQUIRED\n')


if __name__=='__main__':
    if os.geteuid()!=0 or platform.machine()!='x86_64':raise SystemExit('NATIVE_ROOT_REQUIRED')
    config=json.loads(CONFIG.read_text())
    if config.get('provider')!='digitalocean' or config.get('host_id')!='620470021' or config.get('root_uuid')!='59134bd0-a76f-4ea0-8e4a-770b2e1eafc2' or config.get('enabled') is not True or config.get('image')!='sha256:c678ad81c316b0e8f56dd9a822e7da80ed7dbee09f8d667e2f5a64e6e64239b0' or config.get('build_digest')!=config.get('image'):raise SystemExit('APPROVED_DO_CONFIG_REQUIRED')
    actual_root=subprocess.run(['/usr/bin/findmnt','-n','-o','UUID','/'],check=True,capture_output=True,text=True,timeout=5).stdout.strip()
    actual_boot=pathlib.Path('/proc/sys/kernel/random/boot_id').read_text().strip()
    if actual_root!=config['root_uuid'] or actual_boot!=config.get('boot_id'):raise SystemExit('LIVE_DO_IDENTITY_MISMATCH')
    engine=Engine(config)
    if pathlib.Path(SOCKET).exists():raise SystemExit('EXISTING_CONTROL_SOCKET')
    with Server(SOCKET,Handler) as server:
        os.chown(SOCKET,0,20000);os.chmod(SOCKET,0o660)
        def shutdown(*_):
            threading.Thread(target=server.shutdown,daemon=True).start()
        signal.signal(signal.SIGTERM,shutdown);signal.signal(signal.SIGINT,shutdown)
        try:server.serve_forever(poll_interval=.5)
        finally:
            try:
                for path in ROOT.glob('*.json'):engine.stop(path.stem)
            finally:pathlib.Path(SOCKET).unlink(missing_ok=True)
