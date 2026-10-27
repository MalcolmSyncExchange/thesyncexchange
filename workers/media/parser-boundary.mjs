// Trusted-controller-only invocation preparation. No request/Artist options enter
// this API. Native code receives file leaves, never a job directory capability.
import {constants} from 'node:fs';
import {lstat,realpath,open,rm} from 'node:fs/promises';
import {dirname,isAbsolute,resolve,join} from 'node:path';
import {MediaError} from './errors.mjs';
const fail=()=>{throw new MediaError('validation_failed');};
async function prepare(tool,args,toolDir,runtime,readOnly){
 if(!['ffmpeg','ffprobe'].includes(tool)||!Array.isArray(args)||args.length>80||args.some(a=>typeof a!=='string'||a.includes('\0')||a.length>2048)||!isAbsolute(toolDir)||toolDir!==resolve(toolDir)||await realpath(toolDir)!==toolDir)fail();
 const env={};
 if(runtime){
  const root=runtime.env?.MEDIA_RUNTIME_ROOT;
  if(!root||!isAbsolute(root)||root!==resolve(root)||await realpath(root)!==root)fail();
  const expected={PYTHONHOME:join(root,'usr/local'),PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1',MEDIA_RUNTIME_ROOT:root};
  if(Object.keys(runtime.env).length!==4||Object.entries(runtime.env).some(([key,value])=>expected[key]!==value))fail();
  Object.assign(env,expected);
 }
 const paths=[...new Set(args.filter(isAbsolute))];
 if(paths.length>4||new Set(paths.map(dirname)).size>1)fail();
 const inputs=[],outputs=[],created=[];
 try{
  const output=tool==='ffmpeg'&&!readOnly&&isAbsolute(args.at(-1)||'')?args.at(-1):null;
  for(const path of paths){
   const root=dirname(path),directory=await lstat(root);
   if(path!==resolve(path)||await realpath(root)!==root||!directory.isDirectory()||directory.mode&0o077||directory.uid!==process.getuid())fail();
   let facts;
   try{facts=await lstat(path);}catch(e){if(e.code!=='ENOENT'||path!==output)throw e;}
   if(facts){
    if(path===output)fail();
    if(!facts.isFile()||facts.nlink!==1||facts.size>50_000_000||await realpath(path)!==path)fail();
    inputs.push(path);
   }else{
    // Pre-create only explicitly nominated output leaves; parser gets no create,
    // rename, delete, hardlink or directory-write rights. Controller owns cleanup.
    const file=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
    created.push(path);await file.close();outputs.push(path);
   }
  }
  env.MEDIA_TOOL_DIR=toolDir;
  env.MEDIA_INPUT_FILES=JSON.stringify(inputs);
  env.MEDIA_OUTPUT_FILES=JSON.stringify(outputs);
  // FFmpeg's normal no-overwrite semantics are enforced by O_EXCL above. The
  // pre-created authorized leaf now needs explicit overwrite by the fixed tool.
  const actualArgs=outputs.length&&args[0]?.startsWith('-')?['-y',...args]:args;
  return {env,args:actualArgs,cwd:paths.length?dirname(paths[0]):toolDir,created,
   async cleanup(){for(const path of created)await rm(path,{force:true});}};
 }catch{for(const path of created)await rm(path,{force:true});fail();}
}

export async function prepareParser(...args){
 try{return await prepare(...args);}catch{throw new MediaError('validation_failed');}
}
