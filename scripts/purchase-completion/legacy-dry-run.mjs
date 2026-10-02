// Reads a sanitized local export only. No credentials, network or write path.
import {readFileSync} from 'node:fs';
import {classifyLegacyOrder} from '../../lib/commerce/legacy-classifier.mjs';
const path=process.argv[2];
if(!path)throw Error('Usage: node scripts/purchase-completion/legacy-dry-run.mjs <sanitized-local-orders.json>');
const rows=JSON.parse(readFileSync(path,'utf8'));
if(!Array.isArray(rows))throw Error('Expected an array of sanitized order facts.');
const orders=rows.map(classifyLegacyOrder);
const counts=Object.fromEntries(['SAFE_TO_MAP','AMBIGUOUS','INCOMPLETE','DO_NOT_BACKFILL'].map(k=>[k,orders.filter(o=>o.classification===k).length]));
console.log(JSON.stringify({mode:'READ_ONLY',counts,orders},null,2));
