import { spawn } from 'node:child_process';
import { statfs,mkdtemp,chmod,rm } from 'node:fs/promises';
import { stagingConfig,requireValue } from '../../services/media-broker/common.mjs';
export async function runtimePreflight(config){
 stagingConfig(config);requireValue(process.platform==='linux'&&process.arch==='x64'&&process.getuid()===1000,'TARGET_MISMATCH');
 requireValue(!config.DB_SECRET&&!config.STORAGE_SECRET&&!config.SUPABASE_SERVICE_ROLE_KEY&&!config.DATABASE_URL,'TARGET_MISMATCH');
 requireValue(config.MEDIA_RUNTIME==='cloud-run-gen2'&&config.MEDIA_TOOL_DIR==='/opt/media/bin'&&config.TMPDIR==='/work','TARGET_MISMATCH');
 const fs=await statfs('/work');requireValue(fs.type===0x01021994&&fs.bsize*fs.blocks<=536870912&&fs.bsize*fs.bavail>=260000000,'TARGET_MISMATCH');
 const dir=await mkdtemp('/work/preflight-');await chmod(dir,0o700);await rm(dir,{recursive:true});
 // Full isolation/cleanup regression before any claim; fixed tools, no tokens/env inheritance.
 await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--test','tests/media-worker-media.test.mjs','tests/media-worker-remediation.test.mjs'],{stdio:['ignore','ignore','ignore'],env:{PATH:'/usr/bin:/bin',TMPDIR:'/work',MEDIA_TOOL_DIR:'/opt/media/bin',MEDIA_DESCENDANT_TOOL_DIR:'/opt/media-test/bin'},detached:true});const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}reject(Error('RUNTIME_PREFLIGHT_FAILED'));},90000);child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error('RUNTIME_PREFLIGHT_FAILED'));});});
}
