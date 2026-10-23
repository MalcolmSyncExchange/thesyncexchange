// Review-only backend for executing original SQL/concurrency assertions on isolated native PG17.
// It translates only three known fixture lifecycle operations; no Docker daemon,
// external DSN, host port, volume, key, credential, or package installation.
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
const run=(bin,args,input='')=>new Promise((resolve,reject)=>{
 const c=spawn(bin,args,{env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:['pipe','pipe','pipe']});
 let out='',err='';c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('close',n=>n===0?resolve(out.trim()):reject(Error(bin+': '+err)));c.stdin.on('error',()=>{});c.stdin.end(input);
});
export function nativeBackend(){
 let dir,socket,data,name,started=false;
 return async(args,input='')=>{
  if(args[0]==='run'){
   if(started||!args.includes('--network')||args[args.indexOf('--network')+1]!=='none'||args.at(-1)!=='postgres:17')throw Error('Unknown native test lifecycle');
   if(!/PostgreSQL\) 17\./.test(await run('postgres',['--version'])))throw Error('Native PG17 required');
   name=args[args.indexOf('--name')+1];dir=await mkdtemp('/private/tmp/tse-review-legacy-');data=join(dir,'data');socket=join(dir,'socket');
   await mkdir(socket,{mode:0o700});await run('initdb',['-D',data,'-U','postgres','--auth=trust','--encoding=UTF8','--no-locale']);
   await run('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o','-c listen_addresses= -c unix_socket_directories='+socket+' -c max_connections=15 -c shared_buffers=16MB','-w','start']);started=true;return name;
  }
  if(args[0]==='exec'&&started){
   const index=args.indexOf(name);if(index<0)throw Error('Unknown test cluster');
   const bin=args[index+1];if(bin==='pg_isready')return run('pg_isready',['-h',socket,'-U','postgres']);
   if(bin!=='psql')throw Error('Unsupported native fixture operation');
   return run('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-h',socket,'-U','postgres','-d','postgres'],input);
  }
  if(args[0]==='rm'&&started&&args.at(-1)===name){
   await run('pg_ctl',['-D',data,'-m','immediate','-w','stop']);started=false;await rm(dir,{recursive:true,force:true});return '';
  }
  throw Error('Unsupported native fixture lifecycle');
 };
}
