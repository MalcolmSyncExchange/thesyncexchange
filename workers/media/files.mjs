import { constants } from 'node:fs';
import { open, realpath, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { MediaError } from './errors.mjs';

const proofs = new WeakMap();
const fail = () => { throw new MediaError('validation_failed'); };
export function checkAbort(signal) { if (signal?.aborted) throw new MediaError('worker_lease_expired'); }
const same = (a,b) => ['dev','ino','size','mtimeNs','ctimeNs','nlink'].every(k=>a[k]===b[k]);
// Open-time no-follow/nonblocking checks precede any read. The coordinator owns
// the scratch root; native parsers never supply this argument.
export async function openRegular(path, root, maxBytes, signal) {
  checkAbort(signal);
  if (!isAbsolute(path)||!isAbsolute(root)||path!==resolve(path)||root!==resolve(root)) fail();
  const rel=relative(root,path);if(!rel||rel.startsWith('..')||isAbsolute(rel))fail();
  let fd;
  try {
    if(await realpath(root)!==root)fail();
    fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
    const initial=await fd.stat({bigint:true});
    if(!initial.isFile()||initial.nlink!==1n)fail();
    if(initial.size>BigInt(maxBytes))throw new MediaError('file_too_large');
    const assertStable=async()=>{
      checkAbort(signal);
      const current=await fd.stat({bigint:true}),named=await lstat(path,{bigint:true});
      if(!current.isFile()||!named.isFile()||!same(initial,current)||!same(initial,named)||await realpath(path)!==path)fail();
    };
    await assertStable();
    return {fd,initial,assertStable};
  } catch(error) {await fd?.close();throw error instanceof MediaError?error:new MediaError('validation_failed');}
}
export async function readBounded(file,maxBytes,signal,onChunk=()=>{}) {
  await file.assertStable();let bytes=0;const hash=createHash('sha256'),buffer=Buffer.alloc(65536);
  while(true) {
    checkAbort(signal);const n=await file.fd.read(buffer,0,buffer.length,bytes);checkAbort(signal);
    if(!n.bytesRead)break;bytes+=n.bytesRead;if(bytes>maxBytes)throw new MediaError('file_too_large');
    const chunk=buffer.subarray(0,n.bytesRead);hash.update(chunk);await onChunk(chunk);
  }
  await file.assertStable();return {sha256:hash.digest('hex'),actual_bytes:bytes};
}
// Validation and both hashes use a stable opened file. Subsequent native reads
// are filesystem-read-only and their process groups finish before this returns.
export async function verifyOutput(path,maxBytes,signal,validate) {
  const root=dirname(path),file=await openRegular(path,root,maxBytes,signal);
  try {
    const before=await readBounded(file,maxBytes,signal),result=await validate();
    const after=await readBounded(file,maxBytes,signal);
    if(before.sha256!==after.sha256||before.actual_bytes!==after.actual_bytes)fail();
    const value=Object.freeze({...result,...after});
    proofs.set(value,{path,root,maxBytes,identity:file.initial,facts:after});return value;
  } finally {await file.fd.close();}
}
// Opaque in-process proof, not a worker-controlled path or serialized DTO.
export async function withVerifiedOutput(value,maxBytes,signal,body) {
  const proof=proofs.get(value);if(!proof||proof.maxBytes>maxBytes)fail();
  const file=await openRegular(proof.path,proof.root,maxBytes,signal);
  try {
    if(!same(proof.identity,file.initial))fail();
    const facts=await readBounded(file,maxBytes,signal);
    if(facts.sha256!==proof.facts.sha256||facts.actual_bytes!==proof.facts.actual_bytes)fail();
    const result=await body(file,facts);await file.assertStable();return result;
  } finally {await file.fd.close();}
}
