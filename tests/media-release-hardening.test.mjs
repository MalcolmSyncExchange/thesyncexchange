import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {scanSummary} from '../scripts/media-release/release.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('scans must cover real Debian packages; unsupported/empty OS is never clean evidence',()=>{
 for(const x of [{},{Metadata:{OS:{Family:'none'}},Results:[]},{Metadata:{OS:{Family:'debian'}},Results:[]}])assert.throws(()=>scanSummary(x));
 assert.deepEqual(scanSummary({Metadata:{OS:{Family:'debian'}},Results:[{Class:'os-pkgs',Packages:[{}],Vulnerabilities:[{Severity:'HIGH'}]}]}),{CRITICAL:0,HIGH:1,MEDIUM:0,LOW:0,UNKNOWN:0});
});
test('minimal runtime retains inventory and pinned security inputs; no sandbox bypass',async()=>{
 const [w,b,assembly,sandbox]=await Promise.all(['workers/media/Dockerfile','services/media-broker/Dockerfile','services/media-broker/runtime-rootfs.py','workers/media/sandbox.py'].map(read));
 for(const image of [w,b]){assert.match(image,/FROM scratch/);assert.match(image,/24.21.0-trixie-slim@sha256:173f/);assert.match(image,/USER 1000:1000/);}
 assert.match(w,/3.14.8-slim-trixie@sha256:f85c/);assert.match(w,/VALIDSIG FCF986EA15E6E293A5644F10B4322F04D67658D8/);
 assert.match(assembly,/var\/lib\/dpkg\/status/);assert.match(assembly,/etc\/os-release/);assert.match(sandbox,/abi < 3/);assert.match(sandbox,/sys\.exit\(64\)/);
});
test('native CI is manual, immutable actions, no secrets/hosted target and no emulation skips',async()=>{
 const source=await read('.github/workflows/media-native-amd64.yml');assert.match(source,/workflow_dispatch/);assert.doesNotMatch(source,/pull_request_target|secrets\.|id-token:|docker push|terraform|supabase/);assert.match(source,/persist-credentials: false/);assert.match(source,/--network none/);assert.match(source,/--self-test/);assert.match(source,/tests\/media-worker\/resource.mjs/);assert.match(source,/uname -m/);
});
