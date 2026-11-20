import type {UploadState,UploadFile} from './upload-contract';
export function humanBytes(bytes:number):string;
export function activeMaster(state:UploadState):UploadFile|null;
export function currentMedia(state:UploadState):{source:UploadState['source'];waveform:UploadState['waveform'];previews:UploadState['derivatives']};
export function currentProcessing(state:UploadState):{stage:string;state:string;jobs:UploadState['jobs']};
export function transferEstimate(samples:{at:number;bytes:number}[],now:number,bytes:number,total:number):number|null;

export function readinessActions(state:UploadState):string[];

export function processingPollDelay(state:import('./upload-contract').UploadState|null,failures?:number):number;

export function previewGenerationNeeded(state:UploadState):boolean;

export function uploadDisplay(state:UploadState|null,options?:{hasLocal?:boolean;selectedAsset?:string|null;busy?:boolean;transferring?:boolean;paused?:boolean;transferIsMaster?:boolean}):{stored:boolean;localPending:boolean;selectionOnly:boolean;transferVisible:boolean;preliminary:boolean;unboundLocal:boolean};

export function publicPreviewMessage(state:import('./upload-contract').UploadState):string;
