import test from 'node:test';import assert from 'node:assert/strict';
import {comparePreservationSnapshots} from '../scripts/diagnostics/postflight-preservation.mjs';
import {executionFixture,authorization,artist,eventId} from './helpers/bounded-execution-fixture.mjs';
function compare(mutate=()=>{},held=false){const f=executionFixture(),executionFinishedAt=new Date().toISOString(),after=f.makeAfter(mutate,held);return comparePreservationSnapshots(f.before,after,{...f.auth,mode:'BOUNDED_EVENT_EXECUTION',executionAuthorization:authorization,artistId:artist,eventId,executionStartedAt:f.executionStartedAt,executionFinishedAt});}
test('exact one consumed immutable grant/event/slot and approved Auth change pass',()=>assert.equal(compare().status,'passed'));
test('ambiguous transport remains held without replay; preservation passes but is not delivery proof',()=>assert.equal(compare(()=>{},true).status,'passed'));
for(const [name,mutate]of [
 ['wrong Admin',(_r,g)=>g.operator_id=artist],['wrong Artist',(_r,g)=>g.artist_id=authorization],['expired grant',(_r,g)=>g.expires_at=g.created_at],
 ['wrong event',(_r,_g,e)=>e.event='catalog_searched'],['wrong dedupe',(_r,_g,e)=>e.dedupe_key='arbitrary'],['not test',(_r,_g,e)=>e.is_test=false],['production',(_r,_g,e)=>e.environment='production'],['arbitrary properties',(_r,_g,e)=>e.propertiesMatch=false],
 ['two attempts',(_r,_g,e)=>e.attempt_count=2],['automatic retry',(_r,_g,e)=>e.next_retry_at=new Date().toISOString()],['extra event',r=>r.domains.analytics_outbox.push({id:'extra'})],['extra grant',r=>r.domains.staging_analytics_validation.push({id:'extra'})],
 ['historical grant mutation',r=>r.domains.staging_analytics_validation[0].value='mutated'],['profile mutation',r=>r.domains['public.user_profiles'][0].value='mutated'],['Storage mutation',r=>r.domains['storage.objects'][0].value='mutated'],['payment change',r=>r.domains.purchase_capabilities[0].value='mutated'],['unexpected slot',r=>r.domains.staging_analytics_validation_slot[0].execution.authorization_id=eventId],['unknown grant field',(_r,g)=>g.extra='unexpected']
])test(name+' rejected independently',()=>assert.equal(compare(mutate).status,'failed'));
test('incomplete source is rejected, never an empty success',()=>{const f=executionFixture(),after=f.makeAfter();delete after.domains['storage.objects'];const r=comparePreservationSnapshots(f.before,after,{...f.auth,mode:'BOUNDED_EVENT_EXECUTION'});assert.equal(r.status,'failed');assert.equal(r.assertions.find(x=>x.assertion==='snapshot.completeness').passed,false);});
