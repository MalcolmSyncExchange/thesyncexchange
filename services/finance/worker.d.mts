import type Stripe from 'stripe';
import type {ProviderSummary} from '../../lib/finance/provider-events.mjs';
export type ProviderJob={id:string;token:string;account:string;event:ProviderSummary;attempt:number;generation:number};
export type WorkerResult={claimed:number;posted:number;retried:number;dead:number;uncertain:number};
export function runFinancialWorker(input:{claim:()=>Promise<ProviderJob|null>;complete:(id:string,token:string,proof:unknown)=>Promise<{state:string}>;fail:(id:string,token:string,code:string,terminal:boolean,rejected?:unknown)=>Promise<string>;observe?:(r:WorkerResult)=>Promise<void>;stripe:Stripe;now?:()=>number;limit?:number;budgetMs?:number}):Promise<WorkerResult>;
