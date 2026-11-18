import test from 'node:test';import assert from 'node:assert/strict';
import{publicationStep,diagnostic}from'../scripts/publication-diagnostics.mjs';
import{runCheckedPublication}from'../scripts/publish-staging-checked.mjs';
for(const step of ['credential','site-link','cli-build-help','cli-deploy-help','configuration','build','upload'])test('sanitized failure boundary: '+step,async()=>{
 const secret='private-token-header-cookie-body-stack';const raw=Object.assign(new Error(secret),{status:7,stdout:secret,stderr:secret,cause:secret});
 const state={buildBegan:step==='build'||step==='upload',uploadBegan:step==='upload'};
 let caught;try{await publicationStep(step,()=>{throw raw;},state);}catch(e){caught=e;}
 const receipt=diagnostic(caught);assert.equal(receipt.step,step);assert.equal(receipt.category,'process-failure');assert.equal(receipt.processExitCode,7);assert.equal(receipt.buildBegan,state.buildBegan);assert.equal(receipt.uploadBegan,state.uploadBegan);assert.match(receipt.failedAt,/^\d{4}-\d\d-\d\dT/);
 assert.ok(!JSON.stringify(receipt).includes(secret));assert.ok(!caught.stack.includes(secret));assert.equal(caught.cause,undefined);
});
test('provider timeout classification survives nested verification wrapper',async()=>{let caught;try{await publicationStep('verification',()=>publicationStep('provider-site',()=>{throw Object.assign(Error('Bearer secret'),{name:'TimeoutError'});}));}catch(e){caught=e;}assert.equal(diagnostic(caught).step,'provider-site');assert.equal(diagnostic(caught).category,'timeout');});
test('unknown message/code is not copied and invalid status is not retained',async()=>{let caught;try{await publicationStep('credential',()=>{throw Object.assign(Error('secret'),{code:'secret',status:999});});}catch(e){caught=e;}assert.equal(diagnostic(caught).processExitCode,null);assert.equal(diagnostic(caught).category,'process-failure');assert.ok(!JSON.stringify(diagnostic(caught)).includes('secret'));});
test('CLI command rejection never reaches build/upload',async()=>{let builds=0,uploads=0;await assert.rejects(runCheckedPublication({prepare:()=>publicationStep('cli-deploy-help',()=>{throw Error('Unsupported option');}),build:()=>builds++,verify:()=>{},publish:()=>uploads++}));assert.equal(builds,0);assert.equal(uploads,0);});
test('missing configuration stops before upload',async()=>{let uploads=0;await assert.rejects(runCheckedPublication({build:()=>{},verify:()=>publicationStep('configuration',()=>{throw Error('Missing private variable');}),publish:()=>uploads++}));assert.equal(uploads,0);});
test('build process failure preserves flags and no upload',async()=>{const state={buildBegan:false,uploadBegan:false};let caught;try{await runCheckedPublication({build:()=>{state.buildBegan=true;return publicationStep('build',()=>{throw Object.assign(Error('private stderr'),{status:2});},state);},verify:()=>{},publish:()=>{state.uploadBegan=true;}});}catch(e){caught=e;}assert.deepEqual([diagnostic(caught).buildBegan,diagnostic(caught).uploadBegan],[true,false]);});
test('unknown step cannot inject data into diagnostics',async()=>{await assert.rejects(publicationStep('secret-provided-step',()=>{}),/Invalid publication step/);});
