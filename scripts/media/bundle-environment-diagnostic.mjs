// Offline packaging only. Does not contact Netlify or inspect this Mac's env.
import {readFile, writeFile, mkdir, copyFile} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const [outputInput, zisiInput] = process.argv.slice(2);
assert.ok(outputInput && zisiInput, 'Output directory and pinned local ZISI path required');
const output=resolve(outputInput), zisi=resolve(zisiInput), stage=join(output,'stage');
const project=fileURLToPath(new URL('../../',import.meta.url));
const pkg=JSON.parse(await readFile(join(zisi,'package.json'),'utf8'));
assert.equal(pkg.name,'@netlify/zip-it-and-ship-it');assert.equal(pkg.version,'16.3.0');
await mkdir(join(stage,'functions'),{recursive:true});await mkdir(join(stage,'scripts/media'),{recursive:true});
for(const name of ['environment-names-diagnostic.mjs','isolation-runtime-guard.mjs'])await copyFile(join(project,'scripts/media',name),join(stage,'scripts/media',name));
await writeFile(join(stage,'functions/environment-names.mjs'),"export {default} from '../scripts/media/environment-names-diagnostic.mjs';\nexport const config={path:'/_qualification/environment-names',method:'POST'};\n",{flag:'wx'});
const {zipFunctions}=await import(pathToFileURL(join(zisi,'dist/main.js')).href);
const functions=await zipFunctions(join(stage,'functions'),join(output,'functions'),{basePath:stage,config:{'*':{nodeBundler:'esbuild',nodeVersion:'24.x'}}});
// The pinned Netlify bootstrap/telemetry is ~335 KB compressed on its own.
// Bound the full capsule separately from the tiny user handler.
assert.equal(functions.length,1);const bytes=await readFile(functions[0].path);assert.ok(bytes.length<1_000_000);
const receipt={status:'LOCAL_ONLY_REQUIRES_SEPARATE_AUTHORIZATION',siteId:'c91c881b-15ec-4342-82c1-381bc3cec86a',published:false,context:'deploy-preview',route:'/_qualification/environment-names',method:'POST',bundleSha256:createHash('sha256').update(bytes).digest('hex'),bundleBytes:bytes.length,maximumInvocations:1,maximumExistingCredits:1,maximumPlatformSeconds:60,memoryCeilingMB:1024,environmentValuesRead:false,mediaProcessing:false,applicationCredentialsRequired:false,productionChanges:false,protectionRequired:'Netlify team-only root and function paths independently verified before invocation',response:'Bounded names and classifications only; always HTTP409/qualified:false; no console logging',authorization:false};
await writeFile(join(output,'diagnostic-manifest.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(receipt));
