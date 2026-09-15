import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const filename = '1770000000000-33333333-3333-4333-8333-333333333333.png';
const path = `${owner}/profile/${filename}`;
function harness(options = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: owner } }, error: options.authError }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: options.role || 'artist' }, error: options.roleError }) }) }) }),
    storage: { from: bucket => ({ remove: async paths => { calls.push({ bucket, paths }); return { error: options.removeError }; } }) }
  };
  const mocks = {
    'server-only': {},
    '@/lib/env': { hasSupabaseEnv: !options.noConfig, env: { demoMode: !!options.demo, avatarsBucket: 'avatars' } },
    '@/services/supabase/server': { createServerSupabaseClient: async () => { calls.push('session'); return client; } }
  };
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../services/storage/avatar-cleanup.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; }, Error });
  return { run: loadedModule.exports.deleteOwnAvatar, calls };
}
test('avatar replacement and rollback delete only the verified artist canonical object', async () => {
  const h = harness(); await h.run(path);
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].bucket, 'avatars');
  assert.equal(h.calls[1].paths[0], path);
});
test('cross-owner, traversal, encoded delimiters and other namespaces never reach removal', async () => {
  for (const bad of [`${path}\n`, `${path}\r`, `${path} `, path.replace(owner, other), `${owner}/profile/../${other}/${filename}`, `${owner}/profile/%2e%2e%2f${filename}`, `${owner}/profile/${filename}%00`, path.replace('/profile/', '\\profile\\'), `/${path}`, `https://evil.invalid/${path}`, `${owner}/audio/${filename}`]) {
    const h = harness(); await assert.rejects(h.run(bad)); assert.equal(h.calls.length, 1, bad);
  }
});
test('demo and missing configuration never create a client; invalid identities cannot remove', async () => {
  for (const options of [{ demo: true }, { noConfig: true }]) {
    const h = harness(options); await h.run(path); assert.equal(h.calls.length, 0);
  }
  for (const options of [{ noUser: true }, { authError: true }, { role: 'buyer' }, { role: 'admin' }, { roleError: true }]) {
    const h = harness(options); await assert.rejects(h.run(path)); assert.equal(h.calls.length, 1);
  }
});
test('storage errors do not report successful deletion', async () => {
  await assert.rejects(harness({ removeError: true }).run(path), /Unable to clean up/);
});
