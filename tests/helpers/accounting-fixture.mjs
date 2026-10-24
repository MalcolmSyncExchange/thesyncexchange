import {randomUUID} from 'node:crypto';
import {database,ids,asActor} from './artist-baseline-db.mjs';
import {seedDelivery} from './secure-delivery-fixture.mjs';import {call} from './purchase-legal-fixture.mjs';
export {ids,asActor,call,randomUUID};
export const admin=(db,name,args=[])=>asActor(db,ids.admin,()=>call(db,name,args));
export const artist=async(db,id=ids.a,page=1,size=20)=>{const session=randomUUID();await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,id]);try{return await asActor(db,id,()=>call(db,'accounting_artist_earnings',[page,size]),'authenticated',session);}finally{await db.query('delete from auth.sessions where id=$1',[session]);}};
export const report=db=>admin(db,'accounting_admin_report',[1,20]);
export const bind=(db,c,party='master',account=ids.a,expected=null,key=randomUUID())=>admin(db,'accounting_bind_payee',[c.order,party,account,expected,key,'SYNTHETIC verified payee identity','SYNTHETIC identity approval']);
export const freeze=(db,c,overrides={})=>admin(db,'freeze_finance_simulation_policy',[c.order,{synthetic:true,version:'ALPHA-SYNTHETIC',tier:'fixture-only',approvalReference:'SYNTHETIC ONLY',commissionBasis:'gross',maturitySeconds:0,reserveBps:0,refundPolicy:'proportional-floor-suspense-v1',...overrides}]);
export const prepare=(db,c,{party='master',amount=2400,key=randomUUID(),date=new Date().toISOString().slice(0,10)}={})=>admin(db,'accounting_prepare_payout',[c.order,party,amount,date,key,'SYNTHETIC monthly payout review']);
export const act=(db,payout,revision,command,key=randomUUID())=>admin(db,'accounting_act_payout',[payout,revision,command,key,'SYNTHETIC financial action','SYNTHETIC action evidence']);
export const balance=async(db,c,account)=>BigInt((await db.query('select finance_private.balance($1,$2) value',[c.order,account])).rows[0].value);
export const payment=(db,c,state,refund=0)=>call(db,'record_purchase_completion_event',[c.order,'acct_fixture','evt_s10'+randomUUID().replaceAll('-',''),'cs_test_fixture','pi_fixture',state==='DISPUTED'?'charge.dispute.created':state==='PAYMENT_FAILED'?'checkout.session.async_payment_failed':'charge.refunded',state,5000,refund,'USD','b'.repeat(64),new Date().toISOString()]);
export async function setup(db,{paid=true}={}){await db.exec('update finance_private.capabilities set synthetic_posting_enabled=true');const c=await seedDelivery(db,{paid});if(!paid)await db.query("update orders set stripe_checkout_session_id='cs_test_fixture',stripe_payment_intent_id='pi_fixture' where id=$1",[c.order]);await call(db,'post_financial_order',[c.order]);return c;}
export const fixture=async(fn,options)=>{const db=await database();try{const c=await setup(db,options);await fn(db,c);}finally{await db.close();}};
export const inspected=(db,c)=>admin(db,'read_financial_order',[c.order]);
export const balanced=async db=>(await db.query('select count(*)::int n from(select journal_id from finance_private.lines group by journal_id having sum(signed_minor)<>0 or count(*)<2) q')).rows[0].n===0;
