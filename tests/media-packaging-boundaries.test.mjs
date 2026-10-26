import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import rehearsal from '../scripts/media/packaged-runtime-rehearsal.mjs';
test('packaged rehearsal rejects published/production/foreign/branch requests before dependency execution',async()=>{
 const site={id:'e5bcc3bc-fb1d-4e46-b302-a95cc3ed70a5'};
 for(const c of [{site,deploy:{context:'production',published:false}},{site,deploy:{context:'deploy-preview',published:true}},{site:{id:'foreign'},deploy:{context:'dev',published:false}},{site,deploy:{context:'branch-deploy',published:false}},{}])assert.equal((await rehearsal(new Request('https://example.invalid',{method:'POST'}),c)).status,404);
 assert.equal((await rehearsal(new Request('https://example.invalid'),{site,deploy:{context:'deploy-preview',published:false}})).status,405);
});
test('packaging and direct transport are dormant, credential-free at parser boundary and fail closed on confinement',async()=>{
 const read=f=>readFile(new URL('../'+f,import.meta.url),'utf8');
 const source=await read('scripts/media/packaged-runtime-rehearsal.mjs');assert.doesNotMatch(source,/process\.env|Netlify\.env|SUPABASE_SERVICE_ROLE|https:\/\/.*supabase|fetch\(|createClient|\.listen\(/);assert.match(source,/landlock_abi<3/);assert.match(source,/seccomp_allow_all_install!==0/);assert.match(source,/attempted=true/);
 const native=await read('workers/media/sandbox.py');assert.match(native,/if abi < 3:[\s\S]*sys.exit\(64\)/);assert.match(native,/RLIMIT_AS/);assert.match(native,/MEDIA_RUNTIME_ROOT/);assert.doesNotMatch(native,/except.*pass/);
 const transport=await read('workers/media/direct-input.mjs');assert.doesNotMatch(transport,/SERVICE_ROLE|apikey|process\.env|upsert|\b(?:PUT|POST)\b/);assert.match(transport,/redirect:'error'/);assert.match(transport,/50_000_000/);
});
