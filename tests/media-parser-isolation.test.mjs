import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,realpath,mkdir,symlink,link,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync,spawnSync} from 'node:child_process';
import {prepareParser} from '../workers/media/parser-boundary.mjs';
import {MediaTools} from '../workers/media/process.mjs';
const fixture=async fn=>{const d=await realpath(await mkdtemp(join(tmpdir(),'parser-boundary-')));try{await fn(d);}finally{await rm(d,{recursive:true,force:true});}};

test('controller passes exact environment and file leaves; inherited canary never enters launch configuration',()=>fixture(async d=>{
 const input=join(d,'input'),output=join(d,'output');await writeFile(input,'synthetic');
 const previous=process.env.TSE_PRIVATE_CANARY;process.env.TSE_PRIVATE_CANARY='synthetic-never-pass';
 try{
  const p=await prepareParser('ffmpeg',['-i',input,output],d,null,false);
  assert.deepEqual(Object.keys(p.env).sort(),['MEDIA_INPUT_FILES','MEDIA_OUTPUT_FILES','MEDIA_TOOL_DIR']);
  assert.deepEqual(JSON.parse(p.env.MEDIA_INPUT_FILES),[input]);assert.deepEqual(JSON.parse(p.env.MEDIA_OUTPUT_FILES),[output]);
  assert.equal(p.args[0],'-y');assert.equal(p.cwd,d);assert.doesNotMatch(JSON.stringify(p),/synthetic-never-pass/);
  assert.equal((await readFile(input)).toString(),'synthetic');await p.cleanup();assert.deepEqual(await readdir(d),['input']);
 }finally{if(previous===undefined)delete process.env.TSE_PRIVATE_CANARY;else process.env.TSE_PRIVATE_CANARY=previous;}
}));
test('credentials and renamed credentials in packaged launcher configuration fail closed',()=>fixture(async d=>{
 const root=d;const env={PYTHONHOME:join(root,'usr/local'),PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1',MEDIA_RUNTIME_ROOT:root};
 for(const name of ['AWS_ACCESS_KEY_ID','NETLIFY_FUNCTIONS_TOKEN','SUPABASE_SERVICE_ROLE_KEY','INNOCENT_NAME']){
  await assert.rejects(prepareParser('ffprobe',['-version'],d,{env:{...env,[name]:'synthetic-canary'}},true),/validation_failed/);
 }
 await assert.rejects(prepareParser('ffprobe',['-version'],d,{env:{...env,PYTHONHOME:'synthetic-canary'}},true),/validation_failed/);
}));
test('read-only calls never create output; canonical ownership, private directories, size, symlink and hardlink checks',()=>fixture(async d=>{
 const input=join(d,'input');await writeFile(input,'synthetic');
 const p=await prepareParser('ffprobe',[input],d,null,true);assert.equal(p.env.MEDIA_OUTPUT_FILES,'[]');
 await assert.rejects(prepareParser('ffprobe',[join(d,'missing')],d,null,true));
 await symlink(input,join(d,'sym'));await link(input,join(d,'hard'));
 await assert.rejects(prepareParser('ffprobe',[join(d,'sym')],d,null,true));
 await assert.rejects(prepareParser('ffprobe',[input],d,null,true));
 const publicDir=join(d,'public');await mkdir(publicDir,{mode:0o755});await writeFile(join(publicDir,'input'),'x');
 await assert.rejects(prepareParser('ffprobe',[join(publicDir,'input')],d,null,true));
 const large=join(d,'large');const {open}=await import('node:fs/promises');const fd=await open(large,'w');await fd.truncate(50_000_001);await fd.close();
 await assert.rejects(prepareParser('ffprobe',[large],d,null,true));
}));
test('malformed invocation, mixed directories and partial preparation roll back without touching input',()=>fixture(async d=>{
 const input=join(d,'input');await writeFile(input,'synthetic');
 for(const [tool,args] of [['sh',['-c','anything']],['ffmpeg',[input+'\0']],['ffprobe',Array(81).fill('-version')],['ffmpeg',[input,join(tmpdir(),'outside')]]])await assert.rejects(prepareParser(tool,args,d,null,false));
 const created=join(d,'created');await symlink(input,join(d,'sym'));
 await assert.rejects(prepareParser('ffmpeg',[join(d,'sym'),created],d,null,false));assert.deepEqual((await readdir(d)).sort(),['input','sym']);
}));
test('cancelled and unsupported-platform launches clean pre-created files without modifying source',()=>fixture(async d=>{
 const input=join(d,'input'),out=join(d,'output');await writeFile(input,'synthetic');const tools=new MediaTools(d);
 const c=new AbortController();c.abort();await assert.rejects(tools.run('ffmpeg',[input,out],{signal:c.signal}));
 if(process.platform!=='linux')await assert.rejects(tools.run('ffmpeg',['-i',input,out]),/audio_unreadable/);
 assert.deepEqual(await readdir(d),['input']);
 for(const options of [{timeout:0},{timeout:480001},{maxBytes:-1},{fileLimit:50000001}])await assert.rejects(tools.run('ffprobe',['-version'],options),/validation_failed/);
}));
test('compiled seccomp policy: architectures, unknown syscalls, process/memory/network/privilege and thread boundaries',()=>{
 const out=execFileSync('/usr/bin/python3',['-B','tests/media-worker/policy-check.py'],{cwd:new URL('../',import.meta.url),encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});
 const result=JSON.parse(out);assert.equal(result.pass,true);assert.ok(result.assertions>4000);
});
test('launcher syntax and security-install ordering are valid; no environment guard relaxation',async()=>{
 const source=await readFile(new URL('../workers/media/sandbox.py',import.meta.url),'utf8');
 const r=spawnSync('/usr/bin/python3',['-B','-c','import ast,sys;ast.parse(sys.stdin.read())'],{input:source});assert.equal(r.status,0);
 assert.ok(source.indexOf('install_filesystem(libc,inputs')<source.indexOf('os.execve(loader'));
 assert.match(source,/RLIMIT_NPROC/);assert.match(source,/RLIMIT_AS/);assert.match(source,/libc\.capget/);assert.match(source,/os\.closerange/);
 const {inspectRuntimeNames}=await import('../scripts/media/isolation-runtime-guard.mjs');assert.equal(inspectRuntimeNames(['PATH','AWS_ACCESS_KEY_ID']).pass,false);
});

test('concurrent output reservations have one winner; existing output cannot be overwritten even with -y',()=>fixture(async d=>{
 const input=join(d,'input'),output=join(d,'output');await writeFile(input,'synthetic');
 const both=await Promise.allSettled([prepareParser('ffmpeg',['-i',input,output],d,null,false),prepareParser('ffmpeg',['-i',input,output],d,null,false)]);
 assert.equal(both.filter(x=>x.status==='fulfilled').length,1);assert.equal(both.filter(x=>x.status==='rejected').length,1);
 await assert.rejects(prepareParser('ffmpeg',['-y','-i',input,output],d,null,false),/validation_failed/);
 assert.equal((await readFile(output)).length,0);await both.find(x=>x.status==='fulfilled').value.cleanup();assert.deepEqual(await readdir(d),['input']);
}));
