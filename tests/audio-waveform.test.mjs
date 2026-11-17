import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWaveform, previewEnvelope, envelopePath, readWaveformResponse } from '../lib/media/waveform.mjs';
const hash = 'a'.repeat(64);
function binary(seconds = 30, overrides = {}) {
  const points = Math.ceil(seconds * 100), bytes = new Uint8Array(512 + points * 4), view = new DataView(bytes.buffer);
  const header = new TextEncoder().encode(JSON.stringify({encoding:'waveform_minmax_i16_v1', profile:'waveform-minmax-v1', points_per_second:100, duration_us:Math.round(seconds*1e6), points, source_sha256:hash, ...overrides}));
  view.setUint32(0, header.length, true); bytes.set(header, 4);
  for (let i=0;i<points;i++) { view.setInt16(512+i*4,-100,true); view.setInt16(514+i*4,100,true); }
  return bytes;
}
test('source binding, exact size and supported profile are mandatory', () => {
  const bytes=binary(); assert.equal(parseWaveform(bytes,hash).minima.length,3000);
  for(const bad of [bytes.slice(0,-1),new Uint8Array(400000),binary(30,{encoding:'image'}),binary(30,{points:0}),binary(30,{duration_us:NaN}),binary(30,{source_sha256:'wrong'})]) assert.throws(()=>parseWaveform(bad));
  assert.throws(()=>parseWaveform(bytes,'b'.repeat(64)));
  const inverted=binary();new DataView(inverted.buffer).setInt16(512,200,true);assert.throws(()=>parseWaveform(inverted));
});
test('preview crop excludes unrelated master and preserves narrow peaks between display samples', () => {
  const bytes=binary(90), view=new DataView(bytes.buffer);
  view.setInt16(514+100*4,32000,true); // Outside authorized 30–60 second window.
  view.setInt16(514+3002*4,12000,true); // Would be lost by sampling every fifth point.
  const envelope=previewEnvelope(parseWaveform(bytes,hash),{startSample:30*16000,endSample:60*16000,sampleRate:16000,durationUs:30000000});
  assert.equal(envelope.points.length,600);assert.equal(envelope.points[0][1],12000);
  assert.ok(envelope.points.every(p=>p[1]!==32000));
  assert.doesNotMatch(JSON.stringify(envelope),/source|sha256|asset|path|version|bucket/);
  assert.match(envelopePath(envelope),/^M/);
});
test('short clips, fractional source duration and measured AAC padding have bounded time domains', () => {
  const short=previewEnvelope(parseWaveform(binary(2)),{startSample:0,endSample:32000,sampleRate:16000,durationUs:2000000},200);
  assert.equal(short.points.length,200);
  const padded=previewEnvelope(parseWaveform(binary(30)),{startSample:0,endSample:480000,sampleRate:16000,durationUs:30090000});
  assert.deepEqual(padded.points.at(-1),[0,0]);
  assert.throws(()=>previewEnvelope(parseWaveform(binary()),{startSample:0,endSample:480000,sampleRate:16000,durationUs:30110000}));
});
test('bad region, rates, duration and display payloads fail closed', () => {
  const wave=parseWaveform(binary()), valid={startSample:0,endSample:480000,sampleRate:16000,durationUs:30000000};
  for(const v of [{startSample:-1},{endSample:0},{endSample:9999999},{sampleRate:0},{durationUs:Infinity}])assert.throws(()=>previewEnvelope(wave,{...valid,...v}));
  assert.throws(()=>previewEnvelope(wave,valid,601));
  for(const points of [[[100,0]],[[NaN,1]],[[0,32768]],[[0,'<script>']]])assert.throws(()=>envelopePath({encoding:'tse-preview-envelope-v1',duration_us:1,points}));
});
test('bounded streaming reader cancels oversized or broken bodies, including without content-length', async () => {
  let cancelled=false;
  const stream=new ReadableStream({pull(c){c.enqueue(new Uint8Array(100));},cancel(){cancelled=true;}});
  await assert.rejects(readWaveformResponse(new Response(stream),150));assert.equal(cancelled,true);
  assert.equal((await readWaveformResponse(new Response(binary()))).length,12512);
  await assert.rejects(readWaveformResponse(new Response(null,{status:403})));
  const broken=new ReadableStream({start(c){c.error(Error('cancelled'));}});await assert.rejects(readWaveformResponse(new Response(broken)));
});
