import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,symlinkSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {BUILD_ARGS,DEPLOY_ARGS,validateCliArguments,verifyLocalSiteLink,runCheckedPublication} from '../scripts/publish-staging-checked.mjs';
import {SITE} from '../scripts/verify-staging-publication.mjs';
const buildHelp='  --context <context>\n  --dry\n  --offline\n  --help\n';
const deployHelp='  --no-build\n  --prod\n  --context <context>\n  -s, --site <site>\n';
test('supported build/deploy commands validate; regression --site on build is rejected before execution',()=>{validateCliArguments(BUILD_ARGS,buildHelp);validateCliArguments(DEPLOY_ARGS,deployHelp);assert.throws(()=>validateCliArguments([...BUILD_ARGS,'--site',SITE],buildHelp));});
test('local link is exact, preserved, and rejects production/override before execution',()=>{const d=mkdtempSync(join(tmpdir(),'tse-cli-link-'));try{assert.equal(verifyLocalSiteLink(d),SITE);const original=readFileSync(d+'/.netlify/state.json','utf8');verifyLocalSiteLink(d);assert.equal(readFileSync(d+'/.netlify/state.json','utf8'),original);assert.throws(()=>verifyLocalSiteLink(d,'production'));writeFileSync(d+'/.netlify/state.json',JSON.stringify({siteId:'production'}));assert.throws(()=>verifyLocalSiteLink(d));}finally{rmSync(d,{recursive:true,force:true});}});
for(const stage of ['prepare','build','verify'])test('complete workflow stops without upload when '+stage+' fails',async()=>{const calls=[];const operation=name=>()=>{calls.push(name);if(name===stage)throw Error('stop');};await assert.rejects(runCheckedPublication({prepare:operation('prepare'),build:operation('build'),verify:operation('verify'),publish:operation('upload')}));assert.ok(!calls.includes('upload'));});
test('complete supported workflow checks selected site and flags before building, verification before one upload',async()=>{const calls=[];await runCheckedPublication({prepare:()=>{validateCliArguments(BUILD_ARGS,buildHelp);validateCliArguments(DEPLOY_ARGS,deployHelp);calls.push('selected-site');},build:()=>calls.push('build'),verify:()=>calls.push('artifact-credential-capability-gates'),publish:()=>calls.push('upload')});assert.deepEqual(calls,['selected-site','build','artifact-credential-capability-gates','upload']);});
test('complete offline dry-run validates arguments and link with zero upload calls',async()=>{const d=mkdtempSync(join(tmpdir(),'tse-dry-'));const calls=[];try{await runCheckedPublication({prepare:()=>{verifyLocalSiteLink(d);validateCliArguments(BUILD_ARGS,buildHelp);validateCliArguments(DEPLOY_ARGS,deployHelp);},build:()=>calls.push(BUILD_ARGS),verify:()=>calls.push('offline-plan'),publish:()=>calls.push('skipped-upload')});assert.deepEqual(calls,[BUILD_ARGS,'offline-plan','skipped-upload']);}finally{rmSync(d,{recursive:true,force:true});}});
const cli=process.env.NETLIFY_CLI_TEST_BIN;
if(cli)test('installed CLI accepts generated flags and rejects unsupported build site flag locally',()=>{const build=execFileSync(cli,['build','--help'],{encoding:'utf8'});const deploy=execFileSync(cli,['deploy','--help'],{encoding:'utf8'});validateCliArguments(BUILD_ARGS,build);validateCliArguments(DEPLOY_ARGS,deploy);assert.throws(()=>validateCliArguments([...BUILD_ARGS,'--site',SITE],build));});

test('complete corrected commands match required build and no-rebuild upload',async()=>{
 const {validateCliCombination}=await import('../scripts/publish-staging-checked.mjs');
 assert.deepEqual(BUILD_ARGS,['build','--context','production']);
 assert.deepEqual(DEPLOY_ARGS,['deploy','--no-build','--prod','--site',SITE]);
 validateCliCombination(BUILD_ARGS);validateCliCombination(DEPLOY_ARGS);
 assert.throws(()=>validateCliCombination(['deploy','--no-build','--prod','--context','production','--site',SITE]));
});
test('artifact mutation after publication verification prevents upload',async()=>{
 const calls=[];let fingerprint='built';
 await assert.rejects(runCheckedPublication({build:()=>calls.push('build'),fingerprint:()=>({sha256:fingerprint}),verify:()=>{calls.push('verify');fingerprint='changed';},publish:()=>calls.push('upload')}));
 assert.deepEqual(calls,['build','verify']);
});
test('unchanged exact build artifact is uploaded once without a second build',async()=>{
 const calls=[];await runCheckedPublication({build:()=>calls.push('build'),fingerprint:()=>({sha256:'verified-bytes',files:1}),verify:()=>calls.push('verify'),publish:()=>calls.push(DEPLOY_ARGS)});
 assert.deepEqual(calls,['build','verify',DEPLOY_ARGS]);
});

test('artifact fingerprint detects actual output and in-project symlink target mutations',async()=>{
 const {artifactFingerprint}=await import('../scripts/publish-staging-checked.mjs');const d=mkdtempSync(join(tmpdir(),'tse-artifact-'));
 try{mkdirSync(d+'/.next');mkdirSync(d+'/.netlify');writeFileSync(d+'/.next/build','build');writeFileSync(d+'/dependency','first');symlinkSync(d+'/dependency',d+'/.netlify/linked');const before=artifactFingerprint(d);writeFileSync(d+'/dependency','changed');assert.notEqual(artifactFingerprint(d).sha256,before.sha256);writeFileSync(d+'/.next/build','changed-build');assert.notEqual(artifactFingerprint(d).sha256,before.sha256);}finally{rmSync(d,{recursive:true,force:true});}
});
test('artifact fingerprint rejects external and cyclic links',async()=>{
 const {artifactFingerprint}=await import('../scripts/publish-staging-checked.mjs');const d=mkdtempSync(join(tmpdir(),'tse-artifact-'));
 try{mkdirSync(d+'/.next');mkdirSync(d+'/.netlify');symlinkSync(tmpdir(),d+'/.netlify/external');assert.throws(()=>artifactFingerprint(d));rmSync(d+'/.netlify/external');symlinkSync(d+'/.netlify',d+'/.netlify/cycle');assert.throws(()=>artifactFingerprint(d));}finally{rmSync(d,{recursive:true,force:true});}
});

if(cli)test('actual installed deploy option parser accepts full corrected combination without executing action',async()=>{
 const {createRequire}=await import('node:module');const {pathToFileURL}=await import('node:url');const {dirname,resolve}=await import('node:path');
 const {Command}=createRequire(cli)('commander');
 class ParserCommand extends Command { createCommand(name){return new ParserCommand(name);} addExamples(){return this;} }
 const {createDeployCommand}=await import(pathToFileURL(resolve(dirname(cli),'../dist/commands/deploy/index.js')).href);
 const parsed=createDeployCommand(new ParserCommand());parsed.parseOptions(DEPLOY_ARGS.slice(1));
 const options=parsed.opts();assert.equal(options.build,false);assert.equal(options.prod,true);assert.equal(options.site,SITE);assert.equal(options.context,undefined);
 const rejected=createDeployCommand(new ParserCommand());rejected.parseOptions(['--no-build','--prod','--context','production','--site',SITE]);
 assert.equal(Boolean(rejected.opts().context&&!rejected.opts().build),true);
});

test('only the generated root deno.lock is ignored; every other source change blocks publication',async()=>{
 const d=mkdtempSync(join(tmpdir(),'tse-generated-lock-'));
 const git=(...args)=>execFileSync('git',args,{cwd:d,encoding:'utf8'}).trim();
 try{
  git('init','--quiet');writeFileSync(d+'/.gitignore',readFileSync(new URL('../.gitignore',import.meta.url)));writeFileSync(d+'/source','approved');git('add','.gitignore','source');git('-c','user.name=Unit Test','-c','user.email=unit@example.test','commit','--quiet','-m','fixture');
  const commit=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}');
  mkdirSync(d+'/.next');mkdirSync(d+'/.netlify');writeFileSync(d+'/.next/build','verified');writeFileSync(d+'/.netlify/function','verified-function');
  const {artifactFingerprint}=await import('../scripts/publish-staging-checked.mjs');const fingerprint=artifactFingerprint(d);
  writeFileSync(d+'/deno.lock',JSON.stringify({version:'5',remote:{'https://edge.netlify.com/':'a'.repeat(64)}}));
  assert.equal(git('status','--porcelain'),'');assert.equal(git('check-ignore','deno.lock'),'deno.lock');assert.equal(git('rev-parse','HEAD'),commit);assert.equal(git('rev-parse','HEAD^{tree}'),tree);assert.deepEqual(artifactFingerprint(d),fingerprint);
  for(const name of ['unexpected.txt','other.lock','package-lock.json','nested/deno.lock']){if(name.includes('/'))mkdirSync(d+'/nested',{recursive:true});writeFileSync(d+'/'+name,'unexpected');assert.ok(git('status','--porcelain'),name+' must block');rmSync(d+'/'+name);}
  writeFileSync(d+'/source','changed');assert.match(git('status','--porcelain'),/M source/);writeFileSync(d+'/source','approved');
  git('add','-f','deno.lock');git('-c','user.name=Unit Test','-c','user.email=unit@example.test','commit','--quiet','-m','deliberately tracked lock fixture');writeFileSync(d+'/deno.lock','changed');assert.match(git('status','--porcelain'),/M deno.lock/);
 }finally{rmSync(d,{recursive:true,force:true});}
});

test('publication wrapper still enforces exact approved source and clean status before build',()=>{
 const wrapper=readFileSync(new URL('../scripts/publish-staging-checked.mjs',import.meta.url),'utf8');const verifier=readFileSync(new URL('../scripts/verify-staging-publication.mjs',import.meta.url),'utf8');
 assert.match(wrapper,/rev-parse','HEAD/);assert.match(wrapper,/!==approved/);assert.match(wrapper,/status','--porcelain/);assert.match(verifier,/source!==approvedSource/);assert.match(verifier,/!clean/);
});
