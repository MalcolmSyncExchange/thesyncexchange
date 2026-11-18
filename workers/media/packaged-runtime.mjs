import {readFile,lstat,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {MediaTools} from './process.mjs';
import {MediaError} from './errors.mjs';
const deny=()=>{throw new MediaError('temporary_system_error');};
// Factory is server-only. The manifest digest comes from the reviewed deployment
// manifest, never a request or an environment value controlled by an Artist.
export async function packagedRuntime(root,expectedManifestSha256){
 if(process.platform!=='linux'||!['x64','arm64'].includes(process.arch)||root!==resolve(root)||await realpath(root)!==root||!/^[a-f0-9]{64}$/.test(expectedManifestSha256))deny();
 const bytes=await readFile(join(root,'runtime-manifest.json'));
 if(createHash('sha256').update(bytes).digest('hex')!==expectedManifestSha256)deny();
 const m=JSON.parse(bytes);if(m.version!==1||m.platform!=='linux'||m.arch!==process.arch||m.ffmpeg!=='9.0.2'||!Array.isArray(m.files)||m.files.length>500)deny();
 const names=new Set();let total=0;
 for(const f of m.files){
  if(typeof f.path!=='string'||!/^((usr|opt)\/[a-zA-Z0-9_.+/-]+|etc\/[a-zA-Z0-9_.-]+)$/.test(f.path)||f.path.split('/').some(x=>!x||x==='.'||x==='..')||names.has(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<0||!/^[a-f0-9]{64}$/.test(f.sha256))deny();
  names.add(f.path);total+=f.bytes;if(total>150_000_000)deny();
  const path=join(root,f.path),s=await lstat(path);if(!s.isFile()||s.nlink!==1||s.size!==f.bytes||s.mode&0o6022||await realpath(path)!==path)deny();
  if(createHash('sha256').update(await readFile(path)).digest('hex')!==f.sha256)deny();
 }
 const triplet=process.arch==='x64'?'x86_64-linux-gnu':'aarch64-linux-gnu';
 const loader=join(root,'usr/lib',triplet,process.arch==='x64'?'ld-linux-x86-64.so.2':'ld-linux-aarch64.so.1'),python=join(root,'usr/local/bin/python3.14');
 for(const file of [loader,python,join(root,'opt/media/bin/ffmpeg'),join(root,'opt/media/bin/ffprobe')])if(!names.has(file.slice(root.length+1)))deny();
 const library=join(root,'usr/lib',triplet)+':'+join(root,'usr/local/lib');
 // Application launcher is bundled next to portable-runtime, with its source
 // covered by the deployment ZIP hash. Do not infer its path from bundled
 // import.meta.url: Netlify relocates JS modules into functions/.
 const launcher=resolve(root,'../sandbox.py'),script=await lstat(launcher);
 if(!script.isFile()||script.nlink!==1||script.size>32768||await realpath(launcher)!==launcher)deny();
 const runtime=Object.freeze({launcher,prefix:Object.freeze(['--library-path',library,python,'-S','-P']),env:Object.freeze({PYTHONHOME:join(root,'usr/local'),PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1',MEDIA_RUNTIME_ROOT:root})});
 return new MediaTools(join(root,'opt/media/bin'),loader,runtime);
}
