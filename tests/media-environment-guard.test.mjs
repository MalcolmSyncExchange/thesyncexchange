import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {classifyRuntimeNames, inspectRuntimeNames} from '../scripts/media/isolation-runtime-guard.mjs';

const approved = ['_HANDLER','AWS_DEFAULT_REGION','AWS_REGION','AWS_EXECUTION_ENV',
 'AWS_LAMBDA_FUNCTION_NAME','AWS_LAMBDA_FUNCTION_MEMORY_SIZE','AWS_LAMBDA_FUNCTION_VERSION',
 'AWS_LAMBDA_INITIALIZATION_TYPE','AWS_LAMBDA_LOG_GROUP_NAME','AWS_LAMBDA_LOG_STREAM_NAME',
 'LAMBDA_TASK_ROOT','LAMBDA_RUNTIME_DIR','LANG','PATH','TZ','URL','SITE_NAME','SITE_ID'];
const site={id:'c91c881b-15ec-4342-82c1-381bc3cec86a'}, context={site,deploy:{context:'deploy-preview',published:false}};

test('exact documented non-sensitive runtime names pass without prefix grants',()=>{
 assert.equal(inspectRuntimeNames(approved).pass,true);
 assert.equal(classifyRuntimeNames(approved).classifications.length,18);
 assert.equal(classifyRuntimeNames(['AWS_LAMBDA_INITIALIZATION_TYPE']).classifications[0].category,'Required runtime metadata');
 assert.equal(classifyRuntimeNames(['SITE_ID']).classifications[0].category,'Harmless platform configuration');
});
test('provider execution credentials, AI keys and application credentials remain blocked',()=>{
 for(const name of ['AWS_ACCESS_KEY','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN','AWS_LAMBDA_METADATA_TOKEN','NETLIFY_AI_GATEWAY_KEY','NETLIFY_AUTH_TOKEN','OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','OPENROUTER_API_KEY','TYPESAFE_API_KEY','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','STRIPE_SECRET_KEY']){
  const result=classifyRuntimeNames([name]); assert.equal(result.pass,false,name);
  assert.equal(result.classifications[0].category,'Potential credential or sensitive configuration',name);
 }
});
test('documented loader configuration and privileged endpoints are not automatically safe',()=>{
 for(const name of ['NODE_OPTIONS','NODE_PATH','LD_PRELOAD','LD_LIBRARY_PATH','PYTHONPATH','AWS_LAMBDA_RUNTIME_API','AWS_LAMBDA_METADATA_API','_X_AMZN_TRACE_ID','NETLIFY_AI_GATEWAY_URL']){
  assert.equal(classifyRuntimeNames([name]).classifications[0].category,'Potential credential or sensitive configuration',name);
  assert.equal(inspectRuntimeNames([name]).pass,false,name);
 }
});
test('future platform names and credential renaming/prefix spoofs fail closed',()=>{
 for(const name of ['AWS_NEW_PLATFORM_SETTING','NETLIFY_FUTURE_METADATA','NETLIFY','HOME','NODE_ENV','DEPLOY_URL','AWS_REGION_TOKEN','PATH_SECRET','MY_RENAMED_SETTING','site_id','Site_ID','SITE_ID_BACKUP'])assert.equal(inspectRuntimeNames([name]).pass,false,name);
});
test('malformed, duplicate, oversized and hostile metadata returns no names or values',()=>{
 for(const names of [null,{},['PATH','PATH'],['PATH',1],['A'.repeat(81)],['PATH\nSECRET'],['PАTH'],new Array(2),Array.from({length:257},(_,i)=>'N'+i),new Proxy([],{get(){throw Error('SYNTHETIC_SECRET');}})]){
  assert.deepEqual(classifyRuntimeNames(names),{pass:false,state:'STOP_INVALID_METADATA'});
 }
});
test('summary responses expose only counts, while diagnostics classify names only',()=>{
 const report=classifyRuntimeNames(['SUPABASE_SERVICE_ROLE_KEY','PATH','MYSTERY']);
 assert.equal(report.unexpectedCount,2);
 const summary=JSON.stringify(inspectRuntimeNames(['SUPABASE_SERVICE_ROLE_KEY','PATH','MYSTERY']));
 assert.doesNotMatch(summary,/SUPABASE|PATH|MYSTERY/);
 assert.equal(report.classifications.find(x=>x.name==='MYSTERY').category,'Unknown');
});
test('guard and standalone diagnostic have no value access, logging or media imports',async()=>{
 const policy=await readFile(new URL('../scripts/media/isolation-runtime-guard.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(policy,/process\.env|Netlify\.env|console\.|fetch\(/);
 const diagnostic=await readFile(new URL('../scripts/media/environment-names-diagnostic.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(diagnostic.replace('Object.keys(process.env)','NAMES_ONLY'),/process\.env|Netlify\.env|console\.|fetch\(|node:|workers\/|packagedRuntime|spawn|Buffer/);
 assert.match(diagnostic,/qualified:false/);
});
test('protected diagnostic rejects wrong site/context/method without reading names',async()=>{
 const {default: diagnostic}=await import('../scripts/media/environment-names-diagnostic.mjs?boundaries');
 for(const c of [{},{site:{id:'foreign'},deploy:context.deploy},{site,deploy:{context:'production',published:false}},{site,deploy:{context:'deploy-preview',published:true}},{site,deploy:{context:'dev',published:false}}])assert.equal((await diagnostic(new Request('https://example.invalid',{method:'POST'}),c)).status,404);
 assert.equal((await diagnostic(new Request('https://example.invalid'),context)).status,405);
});
test('names-only diagnostic never reads synthetic secret values and never runs media',async()=>{
 const original=process.env, fake={}; let reads=0;
 for(const name of ['SITE_ID','AWS_SESSION_TOKEN','MYSTERY'])Object.defineProperty(fake,name,{enumerable:true,get(){reads++;throw Error('SYNTHETIC_VALUE_MUST_NOT_BE_READ');}});
 const {default: diagnostic}=await import('../scripts/media/environment-names-diagnostic.mjs?names');
 let response;
 try { process.env=fake; response=await diagnostic(new Request('https://example.invalid',{method:'POST'}),context); }
 finally { process.env=original; }
 const text=await response.text();assert.equal(response.status,409);assert.equal(reads,0);
 assert.doesNotMatch(text,/SYNTHETIC_VALUE/);const result=JSON.parse(text);
 assert.equal(result.state,'STOP_DIAGNOSTIC_ONLY');assert.equal(result.qualified,false);assert.equal(result.inventory.unexpectedCount,2);
 assert.equal((await diagnostic(new Request('https://example.invalid',{method:'POST'}),context)).status,409);
});
test('media guard blocks before dependency, filesystem and interpreter execution',async()=>{
 const original=process.env, fake={};
 Object.defineProperty(fake,'UNREVIEWED_FUTURE_NAME',{enumerable:true,get(){throw Error('SYNTHETIC_SECRET');}});
 const {default: rehearsal}=await import('../scripts/media/packaged-runtime-rehearsal.mjs?guard');
 let response;
 try{process.env=fake;response=await rehearsal(new Request('https://example.invalid',{method:'POST'}),context);}
 finally{process.env=original;}
 assert.deepEqual(await response.json(),{state:'STOP_ENVIRONMENT_ISOLATION',qualified:false,isolation:{pass:false,state:'STOP_UNEXPECTED_ENVIRONMENT_KEYS',unexpectedCount:1}});
 assert.equal(response.status,409);
 assert.equal((await rehearsal(new Request('https://example.invalid',{method:'POST'}),context)).status,409);
});
test('media subprocesses retain explicit environment instead of inheriting the host',async()=>{
 const source=await readFile(new URL('../workers/media/process.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\.\.\.process\.env|env:\s*process\.env/);
 assert.match(source,/env:prepared.env/);
 const boundary=await readFile(new URL('../workers/media/parser-boundary.mjs',import.meta.url),'utf8');assert.doesNotMatch(boundary,/process\.env/);assert.match(boundary,/Object.keys\(runtime.env\).length!==4/);
});
