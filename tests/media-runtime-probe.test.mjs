import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { probeRuntime, inspectPython, SITE_ID } from '../scripts/media/netlify-runtime-probe.mjs';

const context = { site: { id: SITE_ID }, deploy: { published: false, context: 'deploy-preview' } };
const request = method => new Request('https://synthetic.invalid/_qualification/media-runtime', { method });
test('runtime probe refuses published, production, branch and foreign targets before any child process', async () => {
  let calls = 0;
  for (const ctx of [{}, { ...context, site: { id: 'foreign' } },
    { ...context, deploy: { published: true, context: 'deploy-preview' } },
    { ...context, deploy: { published: false, context: 'production' } },
    { ...context, deploy: { published: false, context: 'branch-deploy' } }]) {
    assert.equal((await probeRuntime(request('POST'), ctx, async () => { calls++; })).status, 404);
  }
  assert.equal(calls, 0);
});
test('runtime probe rejects unsupported methods and tools', async () => {
  let called = false;
  assert.equal((await probeRuntime(request('GET'), context, async () => { called = true; })).status, 405);
  assert.equal(called, false);
  assert.throws(() => inspectPython('/tmp/user-controlled'), /UNAPPROVED_TOOL/);
});
test('missing Python or confinement never qualifies a host', async () => {
  for (const python of [{ available: false, code: 'UNAVAILABLE' },
    { available: true, landlock_abi: 2, no_new_privs: 0, seccomp_install: 0 },
    { available: true, landlock_abi: 8, no_new_privs: 0, seccomp_install: -1 }]) {
    const response = await probeRuntime(request('POST'), context, async () => python);
    assert.match(response.headers.get('cache-control'), /no-store/);
    const facts = await response.json();
    assert.equal(facts.parserIsolationCandidate, false);
    assert.equal(facts.qualified, false);
  }
});
test('kernel prerequisites are not presented as codec or hosted workflow qualification', async () => {
  const response = await probeRuntime(request('POST'), context, async () => ({ available: true, landlock_abi: 8, no_new_privs: 0, seccomp_install: 0 }));
  const facts = await response.json();
  assert.equal(facts.parserIsolationCandidate, true);
  assert.equal(facts.qualified, false);
  const source = await readFile(new URL('../scripts/media/netlify-runtime-probe.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /process\.env|fetch\(|createClient|createAdmin|readFile|execSync|shell\s*:/);
});
test('an unpublished manual draft is supported; published manual context still fails closed', async () => {
  const inspect = async () => ({ available: false, code: 'UNAVAILABLE' });
  assert.equal((await probeRuntime(request('POST'), { ...context, deploy: { context: 'dev', published: false } }, inspect)).status, 200);
  assert.equal((await probeRuntime(request('POST'), { ...context, deploy: { context: 'dev', published: true } }, inspect)).status, 404);
});
