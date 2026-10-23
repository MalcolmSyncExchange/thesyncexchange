import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {requireFixedRuntime,residualDispositions} from '../scripts/media-release/policy.mjs';
import {scanSummary} from '../scripts/media-release/release.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('scans must cover real Debian packages; unsupported/empty OS is never clean evidence',()=>{
 for(const x of [{},{Metadata:{OS:{Family:'none'}},Results:[]},{Metadata:{OS:{Family:'debian'}},Results:[]}])assert.throws(()=>scanSummary(x));
 assert.deepEqual(scanSummary({Metadata:{OS:{Family:'debian'}},Results:[{Class:'os-pkgs',Packages:[{}],Vulnerabilities:[{Severity:'HIGH'}]}]}),{CRITICAL:0,HIGH:1,MEDIUM:0,LOW:0,UNKNOWN:0});
});
test('minimal runtime retains inventory and pinned security inputs; no sandbox bypass',async()=>{
 const [w,b,assembly,sandbox]=await Promise.all(['workers/media/Dockerfile','services/media-broker/Dockerfile','services/media-broker/runtime-rootfs.py','workers/media/sandbox.py'].map(read));
 for(const image of [w,b]){assert.match(image,/FROM scratch/);assert.match(image,/26.11.1-trixie-slim@sha256:193fe/);assert.match(image,/USER 1000:1000/);}
 assert.match(w,/ca-certificates libatomic1/);assert.match(w,/COPY --from=node \/tmp\/bootstrap-ca.pem/);assert.match(assembly,/Setuid\/setgid runtime file forbidden/);
 assert.match(w,/3.14.8-slim-trixie@sha256:f85c/);assert.match(w,/VALIDSIG FCF986EA15E6E293A5644F10B4322F04D67658D8/);
 assert.match(assembly,/var\/lib\/dpkg\/status/);assert.match(assembly,/etc\/os-release/);assert.match(sandbox,/abi < 3/);assert.match(sandbox,/sys\.exit\(64\)/);
});
test('native CI is restricted to reviewed feature source, immutable actions, no secrets/hosted target and no emulation skips',async()=>{
 const source=await read('.github/workflows/media-native-amd64.yml');assert.match(source,/workflow_dispatch/);assert.doesNotMatch(source,/pull_request_target|secrets\.|id-token:|docker push|terraform|supabase/);assert.match(source,/persist-credentials: false/);assert.doesNotMatch(source,/\/private\/tmp/);assert.match(source,/RUNNER_TEMP/);assert.match(source,/runner.temp/);assert.match(source,/branches: \[codex\/phase-2-slice-3-media-worker\]/);assert.match(source,/scripts\/media-release\/release.mjs/);assert.match(source,/uname -m/);
});

test('bundled OpenSSL version is proved independently; no old or unreviewed runtime accepted',()=>{
 requireFixedRuntime({node:'26.11.1',openssl:'3.5.9'});
 for(const v of [{node:'24.21.0',openssl:'3.5.8'},{node:'26.11.1',openssl:'3.5.8'},{node:'26.12.0',openssl:'3.5.9'}])assert.throws(()=>requireFixedRuntime(v));
});
test('residual dispositions preserve scanner counts and reject C/H, changed tuples, new fixes and unsupported excuses',async()=>{
 const policy=JSON.parse(await read('scripts/media-release/residual-dispositions.json'));
 const first=policy.rows.find(r=>r.disposition==='NO FIX AVAILABLE');
 const finding={VulnerabilityID:first.advisory,PkgName:first.package,InstalledVersion:first.installed,Severity:first.severity};
 const scan={Metadata:{OS:{Family:'debian'}},Results:[{Class:'os-pkgs',Packages:[{}],Vulnerabilities:[finding]}]};
 const before=JSON.stringify(scan);assert.equal(residualDispositions(scan,'worker',policy).length,1);assert.equal(JSON.stringify(scan),before);
 for(const change of [{Severity:'HIGH'},{Severity:'CRITICAL'},{InstalledVersion:'unexpected'},{VulnerabilityID:'CVE-2099-0001'},{FixedVersion:'new-security-fix'}])assert.throws(()=>residualDispositions({...scan,Results:[{Vulnerabilities:[{...finding,...change}]}]},'worker',policy));
 assert.throws(()=>residualDispositions(scan,'worker',{version:1,rows:[{...first,disposition:'probably unreachable'}]}));
 assert.throws(()=>residualDispositions(scan,'worker',{version:1,rows:[first,first]}));
 assert.throws(()=>residualDispositions(scan,'unknown',policy));
});
test('native collector preserves isolation, broker tests, kernel and bounded resource evidence',async()=>{
 const s=await read('scripts/media-release/release.mjs');
 for(const term of ['--network','none','--read-only','--cap-drop','no-new-privileges','worker-kernel.json','worker-resource.txt','tests/media-broker-security.test.mjs','tests/media-worker/resource.mjs','native_amd64','requireFixedRuntime(versions)','residualDispositions(scan,kind,policy)'])assert.ok(s.includes(term),term);
 assert.match(s,/landlock_abi>=3/);assert.match(s,/seccomp_allow_all_install===0/);assert.match(s,/source annotation mismatch/);
});
