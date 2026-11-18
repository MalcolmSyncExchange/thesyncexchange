// Approval artifact only. Deliberately outside netlify/functions: ordinary app
// builds do not deploy it. No application credentials, database or Storage calls.
import { spawn } from 'node:child_process';
import { platform, arch, release } from 'node:os';

export const SITE_ID = 'e5bcc3bc-fb1d-4e46-b302-a95cc3ed70a5';
const pythonProbe = `import ctypes,platform,os,json
libc=ctypes.CDLL(None,use_errno=True)
r={'machine':platform.machine(),'uid':os.getuid(),'landlock_abi':libc.syscall(444,0,0,1),'landlock_errno':ctypes.get_errno()}
ctypes.set_errno(0);r['no_new_privs']=libc.prctl(38,1,0,0,0)
class F(ctypes.Structure):_fields_=[('code',ctypes.c_ushort),('jt',ctypes.c_ubyte),('jf',ctypes.c_ubyte),('k',ctypes.c_uint)]
class P(ctypes.Structure):_fields_=[('len',ctypes.c_ushort),('filter',ctypes.POINTER(F))]
f=(F*1)(F(0x06,0,0,0x7fff0000));p=P(1,f)
r['seccomp_install']=libc.prctl(22,2,ctypes.byref(p),0,0);r['seccomp_errno']=ctypes.get_errno()
print(json.dumps(r))`;

export function inspectPython(path) {
  if (!['/usr/bin/python3', '/usr/local/bin/python3'].includes(path)) throw Error('UNAPPROVED_TOOL');
  return new Promise(resolve => {
    const child = spawn(path, ['-I', '-c', pythonProbe], {
      env: { PATH: '/usr/bin:/bin', LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'ignore'], detached: true
    });
    let bytes = 0, output = '', settled = false;
    const kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } };
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); kill(); resolve(value); };
    const timer = setTimeout(() => finish({ available: false, code: 'TIMEOUT' }), 4000);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 2048) finish({ available: false, code: 'OUTPUT_LIMIT' });
      else output += chunk.toString();
    });
    child.on('error', () => finish({ available: false, code: 'UNAVAILABLE' }));
    child.on('close', code => {
      try {
        const facts = JSON.parse(output);
        const keys = ['machine','uid','landlock_abi','landlock_errno','no_new_privs','seccomp_install','seccomp_errno'];
        if (code !== 0 || Object.keys(facts).sort().join() !== keys.sort().join() ||
            !['x86_64','aarch64'].includes(facts.machine) || keys.filter(k => k !== 'machine').some(k => !Number.isInteger(facts[k]))) throw Error();
        finish({ available: true, ...facts });
      } catch { finish({ available: false, code: 'UNSUPPORTED_RUNTIME' }); }
    });
  });
}

export async function probeRuntime(request, context, inspect = inspectPython) {
  // Private Deploy Preview protection must also be independently checked before
  // invocation. Never run on the published application, even with a valid session.
  if (context?.site?.id !== SITE_ID || context?.deploy?.published !== false ||
      !['deploy-preview', 'dev'].includes(context?.deploy?.context)) return new Response(null, { status: 404 });
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const python = await inspect('/usr/bin/python3');
  const facts = { platform: platform(), arch: arch(), kernel: release(), node: process.version, python,
    parserIsolationCandidate: python.available && python.landlock_abi >= 3 && python.no_new_privs === 0 && python.seccomp_install === 0,
    qualified: false, scope: 'Kernel prerequisite probe only; no media, credentials, jobs or production activation' };
  return Response.json(facts, { headers: { 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' } });
}
export default probeRuntime;
export const config = { path: '/_qualification/media-runtime', method: ['POST'] };
