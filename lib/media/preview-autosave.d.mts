import type {UploadState} from './upload-contract';
export type PreviewIntent={source:string;start:number;end:number};
export type PreviewCommand=PreviewIntent&{revision:number;key:string};
export type PreviewSaveStatus={dirty:boolean;saving:boolean;error:string;source?:string};
export function previewAutosave(options:{read:()=>Promise<UploadState>;save:(command:PreviewCommand)=>Promise<unknown>;generate:(state:UploadState)=>Promise<unknown>;store:{read:()=>{desired:PreviewIntent;pending:PreviewCommand|null}|null;write:(value:{desired:PreviewIntent;pending:PreviewCommand|null}|null)=>void};onState?:(status:PreviewSaveStatus)=>void;onRead?:(state:UploadState)=>void;delay?:number}):{update:(region:PreviewIntent)=>void;flush:(options?:{preview?:boolean})=>Promise<void>;retry:()=>Promise<void>;snapshot:()=>{desired:PreviewIntent|null;pending:PreviewCommand|null;error:string};restore:()=>void;dispose:()=>void};
