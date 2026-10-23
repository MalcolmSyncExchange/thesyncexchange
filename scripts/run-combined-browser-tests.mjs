import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {readFile,writeFile,rm} from 'node:fs/promises';
const fixture='app/combined-release-fixture-local';
if(existsSync(fixture))throw Error('Refusing to overwrite an existing fixture route');
let code=1;
try{
 code=await new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','--config','playwright.combined.config.mjs'],{stdio:'inherit'});
  child.on('error',reject);child.on('exit',result=>resolve(result??1));
 });
}finally{
 // Only this test's generated route/cache is removed. No application source reset.
 await rm(fixture,{recursive:true,force:true});
 await rm('.next/dev/types',{recursive:true,force:true});
 if(existsSync('next-env.d.ts')){
  const source=await readFile('next-env.d.ts','utf8');
  await writeFile('next-env.d.ts',source.replace('./.next/dev/types/routes.d.ts','./.next/types/routes.d.ts'));
 }
}
process.exitCode=code;
