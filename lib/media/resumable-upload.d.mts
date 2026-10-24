export declare const CHUNK_BYTES:number;
export function tusEndpoint(projectUrl:string):string;
export function safeUploadLocation(value:string,endpoint:string):string;
export function fileFingerprint(file:Blob,signal?:AbortSignal,progress?:(bytes:number)=>void):Promise<string>;
export function resumableUpload(options:{file:File;destination:{asset_id:string;bucket:string;path:string;maximum_bytes:number;upsert:false;expires_at:string};projectUrl:string;credential:()=>Promise<string|undefined>;storage?:Storage;signal?:AbortSignal;onProgress?:(bytes:number,total:number,stage:string)=>void;onStage?:(stage:string)=>void}):Promise<{asset_id:string;bytes:number}>;
