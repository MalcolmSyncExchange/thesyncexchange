import type {UploadState,UploadFile} from './upload-contract';
export function humanBytes(bytes:number):string;
export function activeMaster(state:UploadState):UploadFile|null;
export function currentProcessing(state:UploadState):{stage:string;state:string;jobs:UploadState['jobs']};
export function transferEstimate(samples:{at:number;bytes:number}[],now:number,bytes:number,total:number):number|null;

export function readinessActions(state:UploadState):string[];
