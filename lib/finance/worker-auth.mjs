import {createHash,timingSafeEqual} from 'node:crypto';
export function authorizeFinancialWorker(header,secret){
 if(typeof secret!=='string'||secret.length<32||typeof header!=='string'||header.length>512||!header.startsWith('Bearer '))return false;
 const hash=x=>createHash('sha256').update(x).digest();return timingSafeEqual(hash(header.slice(7)),hash(secret));
}
