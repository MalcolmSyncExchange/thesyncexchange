import type Stripe from 'stripe';
export class FinancialEvidenceError extends Error {code:string;evidence?:unknown;constructor(code:string);}
export type ProviderSummary={id:string;type:string;created:number;livemode:false;supported:boolean;objectId?:string;paymentIntent?:string|null;session?:string|null;charge?:string|null;orderHint?:string|null;amount?:number;currency?:string;refunded?:number;state?:string};
export function digest(value:string):string;
export function normalizeProviderEvent(event:unknown):ProviderSummary;
export function verifyFinancialWebhook(raw:string,signature:string,secret:string,stripe:Stripe):{event:Stripe.Event;summary:ProviderSummary};
export function canonical(value:unknown):string;
