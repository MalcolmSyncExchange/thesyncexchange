export function exactMinor(value: unknown): bigint;
export function calculateCommission(input:{grossMinor:string|number|bigint;currency:string;commissionBps:number;allocations:Array<{partyId:string;bps:number}>}):{currency:string;grossMinor:string;platformFeeMinor:string;netMinor:string;allocations:Array<{partyId:string;bps:number;amountMinor:string}>;rounding:string};
export function formatMinor(value:string|null|undefined,currency:string):string;
export function earningsPageTotals(orders:Array<{currency:string;allocations:Array<{attributedToYou:boolean;owedMinor:string;heldMinor:string;pendingMinor:string;simulatedCompletedMinor:string;recoveryMinor:string}>}>):Array<Record<string,string>>;
