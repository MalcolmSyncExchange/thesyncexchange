// Execute original assertion bodies unchanged; translate only disposable fixture lifecycle.
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';
const dir=await mkdtemp('/private/tmp/tse-rc-legacy-tests-'),root=new URL('../../',import.meta.url),files=[];
try{
 for(const name of ['purchase-completion-concurrency','gate-d-concurrency']){
  let source=await readFile(new URL('tests/'+name+'.test.mjs',root),'utf8');
  const start=source.indexOf('function docker('),end=source.indexOf("\ntest('",start);
  if(start<0||end<0)throw Error('Fixture lifecycle source drift');
  source=source.slice(0,start)+'const docker = nativeBackend();\n'+source.slice(end);
  source='import {nativeBackend} from '+JSON.stringify(new URL('./native-fixture-backend.mjs',import.meta.url).href)+';\n'+source;
  source=source.replaceAll("'./helpers/artist-baseline-db.mjs'",JSON.stringify(new URL('tests/helpers/artist-baseline-db.mjs',root).href));
  const file=join(dir,name+'.test.mjs');await writeFile(file,source);files.push(file);
 }
 const child=spawn(process.execPath,['--test',...files],{env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:'inherit'});
 process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
}finally{await rm(dir,{recursive:true,force:true});}
