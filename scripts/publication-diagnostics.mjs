// Fixed labels only: never retain upstream messages, stacks, headers or bodies.
const steps=new Set(['source','cli-build-help','cli-deploy-help','site-link','provider-site','credential','configuration','build','assets','fingerprint','verification','upload']);
const receipts=new WeakMap();
export function category(error){
 if(error?.name==='TimeoutError'||error?.name==='AbortError')return 'timeout';
 if(error?.code==='ENOENT')return 'missing-resource';
 if(error?.code==='EACCES'||error?.code==='EPERM')return 'access-denied';
 if(Number.isInteger(error?.status))return 'process-failure';
 return 'gate-failure';
}
export function diagnostic(error){return receipts.get(error)||{step:'source',category:'gate-failure',processExitCode:null,buildBegan:false,uploadBegan:false,failedAt:new Date().toISOString()};}
export async function publicationStep(step,operation,state={buildBegan:false,uploadBegan:false}){
 if(!steps.has(step))throw new Error('Invalid publication step identifier.');
 try{return await operation();}catch(error){
  if(receipts.has(error))throw error;
  const safe=new Error('Checked publication failed.');
  receipts.set(safe,{step,category:category(error),processExitCode:Number.isInteger(error?.status)&&error.status>=0&&error.status<=255?error.status:null,buildBegan:state.buildBegan===true,uploadBegan:state.uploadBegan===true,failedAt:new Date().toISOString()});
  throw safe;
 }
}
