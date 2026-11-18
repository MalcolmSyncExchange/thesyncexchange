// Synthetic subprocess fixture: the parent kills this process after fsync/readback.
import {readFile} from 'node:fs/promises';
import {createDurableExecutionEvidence,readDurableExecutionEvidence} from '../../scripts/diagnostics/durable-execution-evidence.mjs';
const [mode,directory,keyFile,scopeFile]=process.argv.slice(2),scope=JSON.parse(await readFile(scopeFile,'utf8'));
const keyProvider=async()=>readFile(keyFile),keyRef='synthetic-custody-key';
if(mode==='write'){
 const w=createDurableExecutionEvidence({directory,keyProvider,keyRef,scope,fingerprintKey:Buffer.alloc(32,9)});
 await w.baseline({privateMarker:'SYNTHETIC_PRIVATE_BASELINE'});await w.authorization({approvedSessionId:'synthetic-session'});await w.intent();
 process.stdout.write('DURABLE_INTENT\n');setInterval(()=>{},1000);
}else{
 const r=await readDurableExecutionEvidence({directory,keyProvider,keyRef,scope});
 process.stdout.write(JSON.stringify({mode:r.recoveryMode,kinds:r.records.map(x=>x.kind),fingerprintKeyRecovered:r.records[0].data.fingerprintKey===Buffer.alloc(32,9).toString('base64')}));
}
