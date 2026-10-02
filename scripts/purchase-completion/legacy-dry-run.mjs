// Reads a sanitized local export only. No credentials, network or write path.
import {readFileSync} from 'node:fs';
import {classifyLegacyOrder} from '../../lib/commerce/legacy-classifier.mjs';
function run() {
 const path=process.argv[2];
 const invalid=code=>({mode:'READ_ONLY',validInput:false,validationErrors:[{field:'$',code}],orders:[]});
 if(!path)return invalid('missing_input_file');
 let text;
 try{text=readFileSync(path,'utf8');}catch{return invalid('unreadable_input_file');}
 let rows;
 try{rows=JSON.parse(text);}catch{return invalid('invalid_json');}
 if(!Array.isArray(rows))return invalid('invalid_export');
 const orders=rows.map((row,index)=>({rowIndex:index,...classifyLegacyOrder(row)}));
 const outcomes=['SAFE_TO_MAP','AMBIGUOUS','INCOMPLETE','DO_NOT_BACKFILL'];
 const counts=Object.fromEntries([...outcomes,'INVALID_INPUT'].map(k=>[k,orders.filter(o=>o.classification===k).length]));
 const operationalCounts=Object.fromEntries(outcomes.map(k=>[k,orders.filter(o=>o.operationalOutcome===k).length]));
 return {mode:'READ_ONLY',exportContractVersion:1,validInput:counts.INVALID_INPUT===0,counts,operationalCounts,orders};
}
const report=run();
console.log(JSON.stringify(report,null,2));
if(!report.validInput)process.exitCode=1;
