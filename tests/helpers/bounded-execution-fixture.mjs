import {preservationDomains,capturePreservationSnapshot} from '../../scripts/diagnostics/postflight-preservation.mjs';
export const admin='6faee3df-7b4b-4d63-ba8d-1275139ccff5',artist='9e61c9ea-ed51-4328-8937-0b989dece2c9',authorization='a2926e46-df3b-4631-807e-4643e1f8c1f5',eventId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',lease='cccccccc-cccc-4ccc-8ccc-cccccccccccc',session='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export function executionFixture(){
 const now=Date.now(),iso=n=>new Date(n).toISOString(),executionStartedAt=iso(now-4000),loginStartedAt=iso(now-2000),loginFinishedAt=iso(now-1000);
 const domains=Object.fromEntries(preservationDomains.map(d=>[d,[{id:'historical-'+d,value:'unchanged',execution:null}]]));
 domains['auth.users']=[{id:admin,last_sign_in_at:iso(now-10000),updated_at:iso(now-10000)}];domains['auth.sessions']=[];
 domains.staging_analytics_validation[0].id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
 domains.staging_analytics_validation_slot=[{id:'true',execution:{singleton:true,authorization_id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'}}];
 const raw={environmentId:'oppijylbkcbiqfuvckgj',approvedAdminId:admin,transactionId:'before',readOnly:true,complete:true,consistent:true,startedAt:iso(now-6000),finishedAt:iso(now-5000),domains};
 const before=capturePreservationSnapshot(raw,admin);
 const auth={mode:'AUTHENTICATED_REHEARSAL',approvedAdminId:admin,environmentId:raw.environmentId,expectedNewSessions:1,approvedSessionId:session,loginStartedAt,loginFinishedAt};
 const makeAfter=(mutate=()=>{},held=false)=>{
  const after=structuredClone(raw),at=iso(now);after.startedAt=iso(Date.now()+2);after.finishedAt=after.startedAt;after.transactionId='after';
  after.domains['auth.users'][0].last_sign_in_at=loginFinishedAt;after.domains['auth.users'][0].updated_at=loginFinishedAt;
  after.domains['auth.sessions'].push({id:session,user_id:admin,created_at:loginFinishedAt});
  const g={id:authorization,singleton:true,artist_id:artist,operator_id:admin,event:'submission_started',event_limit:1,created_at:executionStartedAt,expires_at:iso(Date.parse(executionStartedAt)+300000),expiryExact:true,revoked_at:null,consumed_at:at,event_id:eventId,lease_id:lease,finished_at:held?null:at,outcome:held?null:'accepted'};
  const e={id:eventId,dedupe_key:'bounded-validation:'+authorization,environment:'preview',event:'submission_started',actor_id:artist,actor_role:'artist',is_test:true,is_internal:false,occurred_at:at,last_attempt_at:at,delivered_at:held?null:at,lease_id:held?lease:null,lease_until:held?iso(Date.parse(at)+30000):null,delivery_status:held?'held':'delivered',attempt_count:1,delivery_cycle:0,next_retry_at:null,failure_category:null,propertiesMatch:true};
  after.domains.staging_analytics_validation.push({id:authorization,execution:g});after.domains.analytics_outbox.push({id:eventId,execution:e});after.domains.staging_analytics_validation_slot[0].execution.authorization_id=authorization;
  mutate(after,g,e);return capturePreservationSnapshot(after,admin);
 };
 return {before,makeAfter,auth,executionStartedAt};
}
