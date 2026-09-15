import { writeFileSync, mkdirSync } from 'node:fs';
import { database, snapshot, source } from '../../tests/helpers/artist-baseline-db.mjs';
const normalize=x=>x;
const fields={
 tables:['schema','name','kind','rls','force_rls','options'],
 columns:['schema','table','name','type','max_length','precision','scale','identity','generated','nullable','default'],
 constraints:['schema','table','name','type','validated','definition'],
 indexes:['schema','table','name','definition'],
 functions:['schema','name','args','definer','config','definition'],
 triggers:['schema','table','name','enabled','definition'],
 policies:['schema','table','name','permissive','roles','command','using','check'],
 views:['schema','name','definition']
};
export function compare(a,b,{includeStorage=false}={}) {
 const out={};
 for(const [category,keys] of Object.entries(fields)) {
  const project=rows=>(rows||[]).filter(r=>includeStorage||r.schema!=='storage').map(r=>Object.fromEntries(keys.map(k=>[k,normalize(r[k]??null)])));
  const key=r=>[r.schema,r.table||'',r.name,r.args||''].join('.');
  const left=new Map(project(a[category]).map(r=>[key(r),r])),right=new Map(project(b[category]).map(r=>[key(r),r]));
  out[category]={onlyLeft:[...left.keys()].filter(k=>!right.has(k)),onlyRight:[...right.keys()].filter(k=>!left.has(k)),changed:[...left].filter(([k,v])=>right.has(k)&&JSON.stringify(v)!==JSON.stringify(right.get(k))).map(([key,before])=>({key,before,after:right.get(key)}))};
 }
 return out;
}
if(process.argv[1] && new URL(import.meta.url).pathname===process.argv[1]) {
 const db=await database('historical-repository',{seed:false});
 try {
  const repo=(await db.query(source('scripts/artist-baseline/inventory.sql'))).rows[0].baseline;
  const production=snapshot('production'),staging=snapshot('staging');
  const report={baselineCommit:'4e47997b7bb71af443660ccd4032d12fd43bf269',limitations:['Hosted storage schema excluded from repo comparison; storage policies compared separately.','Repository ACLs inherit explicit simulated hosted grants; compare live grants separately, not inferred defaults.','Owners and hosting ACLs are captured but excluded from structural equality.'],repositoryToProduction:compare(repo,production),productionToStaging:compare(production,staging,{includeStorage:true}),storagePoliciesRepositoryToProduction:compare({policies:repo.policies.filter(p=>p.schema==='storage')},{policies:production.policies.filter(p=>p.schema==='storage')},{includeStorage:true}).policies};
  const dir=new URL('../../docs/artist-baseline/',import.meta.url);mkdirSync(dir,{recursive:true});
  writeFileSync(new URL('drift.json',dir),JSON.stringify(report,null,2)+'\n');
  for(const name of ['repositoryToProduction','productionToStaging']) console.log(name,Object.fromEntries(Object.entries(report[name]).map(([k,v])=>[k,{onlyLeft:v.onlyLeft.length,onlyRight:v.onlyRight.length,changed:v.changed.length}])));
 } finally {await db.close();}
}
