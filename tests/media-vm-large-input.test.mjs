import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import {randomUUID,createHash} from 'node:crypto';
import {UnixBroker} from '../workers/media/vm-broker.mjs';

async function transfer(bytes,{expected=bytes,hash=null,signal}={}){
 const root=await mkdtemp(join(tmpdir(),'tse-vm-input-'));
 const broker=new UnixBroker({run_id:randomUUID(),capability:'a'.repeat(64)});
 let resolves=0;
 broker.request=async path=>{
  if(path==='/resolve'){resolves++;return {bytes:expected,sha256:hash};}
  assert.equal(path,'/input');
  return Readable.from((function*(){const block=Buffer.alloc(65536);for(let left=bytes;left>0;left-=Math.min(left,block.length))yield block.subarray(0,Math.min(left,block.length));})());
 };
 try{await broker.read({},join(root,'input'),signal);assert.equal((await stat(join(root,'input'))).size,bytes);assert.equal(resolves,2);}
 finally{await rm(root,{recursive:true,force:true});}
}
for(const bytes of [50_000_000,75_000_000,100_000_000,150_000_000])test(`Unix transport streams ${bytes} bytes without buffering the full input`,()=>transfer(bytes));
test('Unix transport rejects one byte above 150 MB',()=>assert.rejects(transfer(150_000_001),e=>e.code==='OUTPUT_TOO_LARGE'));
test('Unix transport rejects incorrect declared length',()=>assert.rejects(transfer(1024,{expected:1025}),e=>e.code==='INPUT_MISMATCH'));
test('Unix transport preserves source checksum verification',async()=>{
 await transfer(1024,{hash:createHash('sha256').update(Buffer.alloc(1024)).digest('hex')});
 await assert.rejects(transfer(1024,{hash:'a'.repeat(64)}),e=>e.code==='INPUT_MISMATCH');
});
test('Unix transport respects cancellation and cleans the test workspace',()=>{
 const controller=new AbortController();controller.abort();return assert.rejects(transfer(100_000_000,{signal:controller.signal}),{name:'AbortError'});
});
