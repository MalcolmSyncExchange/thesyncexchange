// Build-only, offline extraction from the pinned cached worker image. Never handles media.
import {readFile,writeFile,readdir,stat,mkdir,copyFile,chmod,realpath} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {join,dirname} from 'node:path';
import assert from 'node:assert/strict';
export async function packageRuntime(output,sourceImage) {
 assert.equal(process.platform,'linux');assert.ok(['x64','arm64'].includes(process.arch));
 const triplet=process.arch==='x64'?'x86_64-linux-gnu':'aarch64-linux-gnu';
 assert.match(sourceImage,/^sha256:[a-f0-9]{64}$/);
 await mkdir(output,{recursive:false,mode:0o700});
 const imported=JSON.parse(execFileSync('/usr/local/bin/python3.14',['-I','-S','-c',"import ctypes,resource,platform,json,traceback,sys; print(json.dumps(sorted(set(m.__file__ for m in sys.modules.values() if getattr(m,'__file__',None) and m.__file__.startswith('/usr/local/lib/python3.14/')))))"],{encoding:'utf8',env:{PATH:'/usr/local/bin:/usr/bin',LC_ALL:'C'}}));
 const closure=JSON.parse(await readFile('/opt/runtime-files.json','utf8'));
 const files=new Set([...imported,...closure.filter(p=>p!='/usr/local/bin/node'&&!p.startsWith('/opt/media-test/'))]);
 async function addTree(p){for(const e of await readdir(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory()&&e.name!=='__pycache__')await addTree(f);else if(e.isFile()&&!e.name.endsWith('.pyc'))files.add(f);}}
 await addTree('/usr/local/lib/python3.14/encodings');await addTree('/usr/local/lib/python3.14/ctypes');await addTree('/opt/licenses');
 const records=[];
 for(const path of [...files].sort()){
  const original=await realpath(path),info=await stat(original);assert.equal(info.isFile(),true);assert.equal(info.mode&0o6000,0);
  const dest=join(output,path.slice(1));await mkdir(dirname(dest),{recursive:true,mode:0o755});await copyFile(original,dest);
  const mode=info.mode&0o111?0o555:0o444;await chmod(dest,mode);
  records.push({path:path.slice(1),bytes:info.size,mode,sha256:createHash('sha256').update(await readFile(dest)).digest('hex')});
 }
 // SONAMEs are materialized as regular files: no absolute symlinks in portable packages.
 for(const [name,version] of [['libz.so.1','libz.so.1.3.1'],['libffi.so.8','libffi.so.8.1.4'],['libatomic.so.1','libatomic.so.1.2.0'],['libstdc++.so.6','libstdc++.so.6.0.33']]){
  const alias=`usr/lib/${triplet}/${name}`,from=`usr/lib/${triplet}/${version}`;
  const r=records.find(x=>x.path===from);if(!r)continue;await copyFile(join(output,from),join(output,alias));await chmod(join(output,alias),r.mode);records.push({...r,path:alias});
 }
 const manifest={version:1,platform:'linux',arch:process.arch,sourceImage,ffmpeg:'9.0.2',python:execFileSync('/usr/local/bin/python3.14',['--version'],{encoding:'utf8'}).trim(),files:records.sort((a,b)=>a.path.localeCompare(b.path))};
 await writeFile(join(output,'runtime-manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx',mode:0o444});
 console.log(JSON.stringify({files:records.length,uncompressedBytes:records.reduce((n,f)=>n+f.bytes,0),sourceImage}));
}
if(process.argv[1]===new URL(import.meta.url).pathname)await packageRuntime(process.argv[2],process.argv[3]);
