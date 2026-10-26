// Local packaging only. No deploy API or credentials. ZISI module path is an
// explicit local build input; use the pinned registry package 16.3.0.
import {readFile,writeFile,cp,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const [runtimeInput,outputInput,zisiInput]=process.argv.slice(2),output=resolve(outputInput),runtime=resolve(runtimeInput),zisi=resolve(zisiInput);
const zisiPackage=JSON.parse(await readFile(join(zisi,'package.json'),'utf8'));assert.equal(zisiPackage.name,'@netlify/zip-it-and-ship-it');assert.equal(zisiPackage.version,'16.3.0');
const {zipFunctions}=await import(pathToFileURL(join(zisi,'dist/main.js')).href);
const project=fileURLToPath(new URL('../../',import.meta.url)),stage=join(output,'stage');await mkdir(stage,{recursive:true});
const bindingBytes=await readFile(join(runtime,'runtime-manifest.json')),manifest=JSON.parse(bindingBytes);assert.equal(manifest.arch,'x64');
for(const dir of ['workers/media','contracts/submission-media'])await cp(join(project,dir),join(stage,dir),{recursive:true});
await mkdir(join(stage,'tests/media-worker'),{recursive:true});await copyFile(join(project,'tests/media-worker/fixtures.mjs'),join(stage,'tests/media-worker/fixtures.mjs'));
await mkdir(join(stage,'scripts/media'),{recursive:true});await copyFile(join(project,'scripts/media/packaged-runtime-rehearsal.mjs'),join(stage,'scripts/media/packaged-runtime-rehearsal.mjs'));
await mkdir(join(stage,'functions'),{recursive:true});await writeFile(join(stage,'functions/packaged-media-runtime.mjs'),"export {default} from '../scripts/media/packaged-runtime-rehearsal.mjs';\nexport const config={path:'/_qualification/packaged-media-runtime',method:'POST'};\n");
await cp(runtime,join(stage,'portable-runtime'),{recursive:true});
for(const f of ['sandbox.py','runtime-kernel-probe.py'])await copyFile(join(project,'workers/media',f),join(stage,f));
const manifestSha256=createHash('sha256').update(bindingBytes).digest('hex');
await writeFile(join(stage,'runtime-binding.json'),JSON.stringify({arch:'x64',manifestSha256}));
const functions=await zipFunctions(join(stage,'functions'),join(output,'functions'),{basePath:stage,config:{'*':{nodeBundler:'esbuild',nodeVersion:'24.x',includedFilesBasePath:stage,includedFiles:['portable-runtime/**','runtime-binding.json','sandbox.py','runtime-kernel-probe.py']}}});
assert.equal(functions.length,1);const bundle=await readFile(functions[0].path);assert.ok(bundle.length<50_000_000);
assert.equal(functions[0].routes?.[0]?.pattern,'/_qualification/packaged-media-runtime');
const receipt={status:'LOCAL_PACKAGE_ONLY_NOT_DEPLOYED',siteId:'e5bcc3bc-fb1d-4e46-b302-a95cc3ed70a5',manifestSha256,bundleSha256:createHash('sha256').update(bundle).digest('hex'),bundleBytes:bundle.length,sourceImage:manifest.sourceImage,memoryMB:1024,synchronousSeconds:60,applicationDeadlineSeconds:40,maximumInvocations:1,maximumExistingCredits:1,applicationCredentials:false,productionWrites:false,functions:functions.map(({name,path,runtime,runtimeVersion,invocationMode,routes,buildData})=>({name,path,runtime,runtimeVersion,invocationMode,routes,buildData}))};
await writeFile(join(output,'rehearsal-manifest.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt));
