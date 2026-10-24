// Test-process-only adapter. Application code has no override or test endpoint.
import Stripe from 'stripe';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import https from 'node:https';
https.request=()=>{throw Error('External HTTPS is forbidden in synthetic checkout qualification.');};syncBuiltinESMExports();
const CommonStripe=createRequire(import.meta.url)('stripe');
const target=new URL(process.env.TSE_SYNTHETIC_STRIPE_ORIGIN||'http://invalid');
if(target.hostname!=='127.0.0.1'||target.protocol!=='http:')throw Error('Synthetic Stripe must be loopback only.');
const prototypes=[Stripe,CommonStripe].map(C=>Object.getPrototypeOf(new C('sk_test_SYNTHETIC_ONLY').checkout.sessions));
async function invoke(operation,input,options){const r=await fetch(target.origin+'/synthetic-stripe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({operation,input,key:options?.idempotencyKey})});if(!r.ok)throw Error('Synthetic Stripe response interrupted.');return r.json();}
for(const prototype of prototypes){prototype.create=function(input,options){return invoke('create',input,options);};prototype.retrieve=function(input){return invoke('retrieve',input);};}
