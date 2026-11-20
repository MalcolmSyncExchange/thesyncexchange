import type {StructuredRights} from './submission-rights';
export type OwnerPool='masterOwners'|'publishingOwners';
export type OwnershipChoice='self'|'shared'|'other';
export const rightsAreas=['Master Rights','Publishing Rights','Collaborators','Licensing Permissions','Ownership Summary'] as const;
export function shareBasis(value:string):number|null{if(!/^(100([.]0{1,2})?|[0-9]{1,2}([.][0-9]{1,2})?)$/.test(value))return null;const [whole,decimal='']=value.split('.');const n=Number(whole)*100+Number(decimal.padEnd(2,'0'));return n>0?n:null;}
export function ownershipTotal(rows:StructuredRights['masterOwners']){const values=rows.map(o=>shareBasis(o.percentage));return values.some(v=>v===null)?null:values.reduce<number>((sum,v)=>sum+(v||0),0);}
export function percentageLabel(basis:number|null){return basis===null?'Incomplete':(basis/100).toFixed(2).replace(/\.00$/,'').replace(/(\.[0-9])0$/,'$1')+'%';}
export function chooseOwnership(rows:StructuredRights['masterOwners'],choice:OwnershipChoice){if(rows.length)return rows;return choice==='shared'?[{name:'',email:'',percentage:''},{name:'',email:'',percentage:''}]:[{name:'',email:'',percentage:'100'}];}
export function rightsAreaFor(field:string){return field.startsWith('masterOwners')?0:field.startsWith('publishingOwners')?1:3;}
