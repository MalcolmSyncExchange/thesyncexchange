// Standalone protected rehearsal only. Outside netlify/functions: never activated
// by an application build. No credentials, Storage, jobs or environment values.
import {inspectRuntimeNames} from './isolation-runtime-guard.mjs';
import {readFile,mkdtemp,realpath,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {packagedRuntime} from '../../workers/media/packaged-runtime.mjs';
import {validateSource,waveform,preview} from '../../workers/media/media.mjs';
import {tone} from '../../tests/media-worker/fixtures.mjs';
let attempted=false;
async function kernel(tools,root){
 return new Promise((resolve,reject)=>{
  const p=spawn(tools.python,[...tools.runtime.prefix,join(root,'runtime-kernel-probe.py')],{env:tools.runtime.env,stdio:['ignore','pipe','ignore'],detached:true});
  const kill=()=>{try{process.kill(-p.pid,'SIGKILL');}catch{}};let out='',error=false;
  const timer=setTimeout(()=>{error=true;kill();},4000);
  p.stdout.on('data',b=>{out+=b;if(out.length>2048){error=true;kill();}});p.on('error',()=>{error=true;});p.on('exit',kill);
  p.on('close',code=>{clearTimeout(timer);kill();try{if(error||code!==0)throw Error();resolve(JSON.parse(out));}catch{reject(Error('DEPENDENCY_UNAVAILABLE'));}});
 });
}
export default async function rehearsal(request,context){
 const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
 if(context?.site?.id!=='c91c881b-15ec-4342-82c1-381bc3cec86a'||context?.deploy?.published!==false||context?.deploy?.context!=='deploy-preview')return new Response(null,{status:404,headers});
 if(request.method!=='POST')return new Response(null,{status:405,headers});
 if(attempted)return new Response(null,{status:409,headers});attempted=true;
 const isolation=inspectRuntimeNames(Object.keys(process.env));
 if(!isolation.pass)return Response.json({state:'STOP_ENVIRONMENT_ISOLATION',qualified:false,isolation},{status:409,headers});
 let directory;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),40000),start=performance.now();
 try{
  const root=process.cwd(),binding=JSON.parse(await readFile(join(root,'runtime-binding.json'),'utf8'));
  if(binding.arch!=='x64'||process.arch!=='x64')throw Error('TARGET_MISMATCH');
  const tools=await packagedRuntime(join(root,'portable-runtime'),binding.manifestSha256),facts=await kernel(tools,root);
  const base={platform:process.platform,arch:process.arch,node:process.version,kernel:facts,manifestSha256:binding.manifestSha256,qualified:false};
  if(facts.landlock_abi<3||facts.no_new_privs!==0||facts.seccomp_allow_all_install!==0)return Response.json({...base,state:'STOP_ISOLATION_UNAVAILABLE'},{headers});
  await tools.verify(controller.signal);
  directory=await realpath(await mkdtemp(join(tmpdir(),'tse-rehearsal-')));const input=join(directory,'input');await tone(input,{seconds:2});
  const source=await validateSource(tools,input,controller.signal),identity={asset_id:'11111111-1111-4111-8111-111111111111',object_id:'22222222-2222-4222-8222-222222222222',version:'synthetic-only',sha256:source.sha256};
  const wave=await waveform(tools,input,source,identity,join(directory,'wave'),controller.signal),cue=await preview(tools,input,source,0,2000,join(directory,'preview'),controller.signal);
  return Response.json({...base,state:'SYNTHETIC_DEPENDENCY_REHEARSAL_PASS',sourceBytes:source.actual_bytes,waveformBytes:wave.actual_bytes,previewBytes:cue.actual_bytes,parserPeakRss:tools.peakParserRss,durationMs:performance.now()-start,scope:'Synthetic local scratch only; no Storage, application credentials, jobs or production activation'},{headers});
 }catch{return Response.json({state:'STOP_REHEARSAL_FAILED',qualified:false},{status:409,headers});}
 finally{clearTimeout(timer);controller.abort();if(directory)await rm(directory,{recursive:true,force:true});}
}
export const config={path:'/_qualification/packaged-media-runtime',method:'POST'};
