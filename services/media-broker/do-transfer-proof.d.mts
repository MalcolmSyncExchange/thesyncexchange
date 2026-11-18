export type TransferProof={version:1;host_id:'620470021';run_id:string;boot_id:string;job_id:string;lease_epoch:number;lease_token:string;nonce:string;operation:'input'|'output'|'verify';bytes:number|null;sha256:string|null;issued_at:number;expires_at:number};
export function transferBytes(proof:TransferProof):Buffer;
export function verifyTransfer(proof:unknown,signature:string,key:string,now?:number):Readonly<TransferProof>;

export type LaunchProof={version:1;host_id:'620470021';run_id:string;boot_id:string;worker_digest:string;nonce:string;issued_at:number;expires_at:number};
export function launchBytes(proof:LaunchProof):Buffer;
export function verifyLaunch(proof:unknown,signature:string,key:string,now?:number):Readonly<LaunchProof>;
