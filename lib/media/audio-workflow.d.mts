export function waveformTransfer(bytes:number,total:number):number|null;
export function processingCopy(stage:string,state:string,reason?:string|null):{title:string;detail:string};
export function recordingPresentation(input?:{stage?:string;state?:string;local?:boolean;analyzed?:boolean;transfer?:boolean;paused?:boolean;unavailable?:boolean}):{label:string;animate:boolean};
export function studioStages(state:import('./upload-contract').UploadState,options?:{localPending?:boolean;transferring?:boolean;paused?:boolean;unavailable?:boolean}):{label:string;state:string}[];
