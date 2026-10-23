import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
const command=(bin,args,input='')=>new Promise((resolve,reject)=>{
 const c=spawn(bin,args,{env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:['pipe','pipe','pipe']});let out='',err='';
 c.stdout.on('data',b=>out+=b);c.stderr.on('data',b=>err+=b);c.on('error',reject);c.on('close',code=>code===0?resolve(out.trim()):reject(Error(`${bin}: ${err}`)));c.stdin.on('error',()=>{});c.stdin.end(input);
});
const dir=await mkdtemp('/private/tmp/tse-media-rc-'),data=join(dir,'data'),socket=join(dir,'socket');let running=false;
try{
 await mkdir(socket,{mode:0o700});await command('initdb',['-D',data,'-U','slice3_fixture_admin','--auth=trust','--encoding=UTF8','--no-locale']);
 await command('pg_ctl',['-D',data,'-l',join(dir,'postgres.log'),'-o',`-c listen_addresses= -c unix_socket_directories=${socket} -c max_connections=30 -c shared_buffers=16MB`,'-w','start']);running=true;
 const child=spawn(process.execPath,['--test','--experimental-strip-types','--test-concurrency=1',
 'tests/submission-media-postgres.test.mjs','tests/media-execution-postgres.test.mjs','tests/media-broker-transport.test.mjs'],{env:{PATH:process.env.PATH,LC_ALL:'C',TSE_MEDIA_TEST_SOCKET:socket},stdio:'inherit'});
 process.exitCode=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});
}finally{if(running)await command('pg_ctl',['-D',data,'-m','immediate','-w','stop']);await rm(dir,{recursive:true,force:true});}
