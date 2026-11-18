import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyStagingAssets, withPreparedDeployConfig } from '../scripts/verify-staging-assets.mjs';
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'tse-assets-'));
  try {
    for (const [name, content] of Object.entries({'.next/static/chunks/main.css':'body{color:red}', '.next/static/chunks/main.js':'console.log(1)', 'public/brand/logo.png':'image', '.netlify/static/_next/static/chunks/main.css':'body{color:red}', '.netlify/static/_next/static/chunks/main.js':'console.log(1)', '.netlify/static/brand/logo.png':'image', '.netlify/netlify.toml':'[[redirects]]\nfrom="/_next/image"\nto="/.netlify/images"\nstatus=200\n'})) {
      mkdirSync(join(root, name, '..'), { recursive:true }); writeFileSync(join(root,name), content);
    }
    run(root);
  } finally { rmSync(root, { recursive:true, force:true }); }
}
test('all compiled and public assets are checked at browser-visible paths',()=>fixture(root=>{
  assert.deepEqual(verifyStagingAssets(root), {chunks:2,css:1,javascript:1,publicFiles:1,publishDirectory:'.netlify/static'});
}));
for (const path of ['_next/static/chunks/main.css','_next/static/chunks/main.js','brand/logo.png']) {
  test('missing asset blocks upload: '+path,()=>fixture(root=>{rmSync(join(root,'.netlify/static',path));assert.throws(()=>verifyStagingAssets(root),/missing or mismatched/);}));
  test('corrupt asset blocks upload: '+path,()=>fixture(root=>{writeFileSync(join(root,'.netlify/static',path),'wrong');assert.throws(()=>verifyStagingAssets(root),/missing or mismatched/);}));
}
test('external static symlink and missing adapter config are rejected',()=>fixture(root=>{
  rmSync(join(root,'.netlify/static/brand/logo.png'));symlinkSync(join(root,'public/brand/logo.png'),join(root,'.netlify/static/brand/logo.png'));
  assert.throws(()=>verifyStagingAssets(root),/missing or mismatched/);
}));
test('generated adapter redirects and headers reach upload unchanged, with cleanup on failure',()=>fixture(root=>{
  const original=readFileSync(join(root,'.netlify/netlify.toml'));
  for(const fail of [false,true]) {
    const upload=()=>{assert.deepEqual(readFileSync(join(root,'netlify.toml')),original);if(fail)throw Error('upload stopped');return 'done';};
    if(fail)assert.throws(()=>withPreparedDeployConfig(root,upload),/upload stopped/);
    else assert.equal(withPreparedDeployConfig(root,upload),'done');
    assert.equal(existsSync(join(root,'netlify.toml')),false);
  }
}));
test('authored root configuration is restored after successful and failed upload',()=>fixture(root=>{
  writeFileSync(join(root,'netlify.toml'),'authored');
  for(const fail of [false,true]) {
    const upload=()=>{assert.notEqual(readFileSync(join(root,'netlify.toml'),'utf8'),'authored');if(fail)throw Error('upload failed');};
    if(fail)assert.throws(()=>withPreparedDeployConfig(root,upload),/upload failed/);
    else withPreparedDeployConfig(root,upload);
    assert.equal(readFileSync(join(root,'netlify.toml'),'utf8'),'authored');
  }
}));
test('missing adapter config blocks publication',()=>fixture(root=>{
  rmSync(join(root,'.netlify/netlify.toml'));assert.throws(()=>verifyStagingAssets(root),/routing configuration missing/);
}));
