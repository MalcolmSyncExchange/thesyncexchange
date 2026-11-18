// Private same-snapshot execution projections; no raw properties or secrets.
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(x);
const time=x=>typeof x==='string'?Date.parse(x):NaN;
const shape=(x,keys)=>x&&Object.keys(x).sort().join(',')===keys.split(',').sort().join(',');
export function executionPreservationAssertions(before,after,a){
 const assertions=[];const record=(assertion,passed)=>assertions.push({assertion:'execution.'+assertion,passed:Boolean(passed),category:passed?'preserved':'execution_contract_mismatch'});
 const start=time(a.executionStartedAt),end=time(a.executionFinishedAt);
 record('authorization',uuid(a.executionAuthorization)&&uuid(a.approvedAdminId)&&uuid(a.artistId)&&uuid(a.eventId)&&Number.isFinite(start)&&Number.isFinite(end)&&end>=start&&time(before.finishedAt)<=start&&end<=time(after.startedAt)&&start<=time(a.loginStartedAt)&&time(a.loginFinishedAt)<=end);
 const added=d=>after.domains[d].filter(r=>!before.domains[d].some(old=>old.id===r.id));
 const grants=added('staging_analytics_validation'),events=added('analytics_outbox');
 record('one_grant',grants.length===1&&grants[0]?.id===a.executionAuthorization);
 record('one_event',events.length===1&&events[0]?.id===a.eventId);
 const g=grants[0]?.execution,e=events[0]?.execution;
 const within=x=>Number.isFinite(time(x))&&time(x)>=start&&time(x)<=end;
 record('grant_schema',shape(g,'id,singleton,artist_id,event,event_limit,created_at,expires_at,revoked_at,consumed_at,event_id,lease_id,finished_at,outcome,operator_id,expiryExact'));
 record('grant_identity',g?.id===a.executionAuthorization&&g?.operator_id===a.approvedAdminId&&g?.artist_id===a.artistId&&g?.event==='submission_started'&&g?.event_limit===1&&g?.singleton===true);
 record('grant_expiry',g?.expiryExact===true&&within(g?.created_at)&&time(g?.expires_at)-time(g?.created_at)===300000);
 record('grant_consumption',within(g?.consumed_at)&&time(g?.consumed_at)>=time(g?.created_at)&&time(g?.consumed_at)<time(g?.expires_at)&&g?.event_id===a.eventId&&uuid(g?.lease_id)&&g?.revoked_at===null);
 record('event_schema',shape(e,'id,dedupe_key,environment,event,actor_id,actor_role,is_internal,is_test,occurred_at,delivered_at,lease_id,lease_until,delivery_status,attempt_count,delivery_cycle,last_attempt_at,next_retry_at,failure_category,propertiesMatch'));
 record('event_contract',e?.id===a.eventId&&e?.actor_id===a.artistId&&e?.actor_role==='artist'&&e?.event==='submission_started'&&e?.is_test===true&&e?.is_internal===false&&e?.environment==='preview'&&e?.dedupe_key==='bounded-validation:'+a.executionAuthorization&&e?.propertiesMatch===true);
 record('one_attempt',e?.attempt_count===1&&e?.delivery_cycle===0&&e?.next_retry_at===null&&within(e?.occurred_at)&&within(e?.last_attempt_at)&&time(e?.occurred_at)>=time(g?.created_at)&&time(e?.last_attempt_at)>=time(e?.occurred_at));
 const accepted=g?.outcome==='accepted'&&within(g?.finished_at)&&time(g?.finished_at)>=time(g?.consumed_at)&&time(g?.finished_at)<time(g?.expires_at)&&e?.delivery_status==='delivered'&&within(e?.delivered_at)&&time(e?.delivered_at)>=time(g?.consumed_at)&&e?.lease_id===null&&e?.lease_until===null&&e?.failure_category===null;
 const held=e?.delivery_status==='held'&&e?.delivered_at===null&&e?.next_retry_at===null&&((g?.outcome==='held'&&within(g?.finished_at)&&time(g?.finished_at)>=time(g?.consumed_at)&&e?.lease_id===null&&e?.lease_until===null&&e?.failure_category==='unknown_error')||(g?.outcome===null&&g?.finished_at===null&&e?.lease_id===g?.lease_id&&Number.isFinite(time(e?.lease_until))&&time(e?.lease_until)<=time(g?.expires_at)&&time(e?.lease_until)<=time(e?.last_attempt_at)+30000&&e?.failure_category===null));
 record('delivery_state',accepted||held);
 const old=before.domains.staging_analytics_validation_slot,next=after.domains.staging_analytics_validation_slot;
 record('slot_transition',old.length===1&&next.length===1&&old[0].id==='true'&&old[0].id===next[0].id&&shape(old[0].execution,'singleton,authorization_id')&&old[0].execution.singleton===true&&(old[0].execution.authorization_id===null||before.domains.staging_analytics_validation.some(r=>r.id===old[0].execution.authorization_id))&&shape(next[0].execution,'singleton,authorization_id')&&next[0].execution.singleton===true&&next[0].execution.authorization_id===a.executionAuthorization&&old[0].execution?.authorization_id!==a.executionAuthorization);
 return assertions;
}
