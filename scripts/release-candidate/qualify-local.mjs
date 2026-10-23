// Local qualification only. No deployment, hosted credential lookup, migration
// application, commerce activation or external transaction commands are allowed.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {isAbsolute,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--output'||!isAbsolute(args[1]))throw Error('Usage: npm run qualify:local -- --output /absolute/local/evidence/directory');
const output=args[1];await mkdir(join(output,'validation-logs'),{recursive:true});
async function execute(bin,args){return new Promise(resolve=>{
 const startedAt=new Date().toISOString(),child=spawn(bin,args,{cwd:root,env:process.env,stdio:['ignore','pipe','pipe']});let text='';
 child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);
 child.on('error',()=>resolve({exitCode:null,text:'Local executable unavailable',startedAt,finishedAt:new Date().toISOString()}));
 child.on('close',exitCode=>resolve({exitCode,text,startedAt,finishedAt:new Date().toISOString()}));
});}
const git=async args=>(await execute('git',args)).text.trim();
const candidate=await git(['rev-parse','HEAD']),tree=await git(['rev-parse','HEAD^{tree}']);
if(await git(['status','--porcelain','--untracked-files=no']))throw Error('Freeze and commit tracked candidate changes before qualification');
const p=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const registered=new Set(p.scripts['test:unit'].match(/tests\/[\w-]+\.test\.mjs/g));
const native=['release-candidate-replay','release-candidate-recovery-native','checkout-recovery-concurrency','secure-delivery-concurrency','immutable-source-concurrency','financial-ledger-concurrency','financial-worker-concurrency','refund-evidence-concurrency'].map(x=>'tests/'+x+'.test.mjs');
const docker=['purchase-completion-concurrency','gate-d-concurrency','managed-storage-baseline'].map(x=>'tests/'+x+'.test.mjs');
const media=['media-worker-media','media-worker-remediation','media-worker-security'].map(x=>'tests/'+x+'.test.mjs');
const mediaDb=['submission-media-postgres','media-execution-postgres','media-broker-transport','media-worker-postgres'].map(x=>'tests/'+x+'.test.mjs');
const excluded=new Set([...registered,...native,...docker,...media,...mediaDb]);
const additional=(await readdir(join(root,'tests'))).filter(x=>x.endsWith('.test.mjs')).map(x=>'tests/'+x).filter(x=>!excluded.has(x));
const nodeTests=files=>['node',['--test','--experimental-strip-types','--test-concurrency=1',...files]];
const commands=[
 ['unit','npm',['run','test:unit']],
 ['native',...nodeTests(native)],
 ['additional',...nodeTests(additional)],
 ['security','npm',['run','test:security-pr2']],
 ['legacy-native','npm',['run','test:release-legacy-native']],
 ...['validation-renewal','preservation-collector','execution-coordinator'].map(x=>[x+'-native','npm',['run','test:'+x+':native']]),
 ['codec',...nodeTests(media)],
 ['media-native','npm',['run','test:release-media-native']],
 ['browser','npm',['run','test:combined-browser']],
 ['analytics-performance','npm',['run','test:analytics-performance']],
 ['typecheck','npm',['run','typecheck']],['lint','npm',['run','lint']],['build','npm',['run','build']],
 ['diff-check','git',['-c','core.whitespace=cr-at-eol','diff','--check',candidate+'^',candidate]]
];
const migrations=[];for(const file of(await readdir(join(root,'supabase/migrations'))).filter(f=>f.endsWith('.sql')).sort())migrations.push({file,sha256:createHash('sha256').update(await readFile(join(root,'supabase/migrations',file))).digest('hex')});
const report={candidate,tree,platform:{os:process.platform,arch:process.arch,node:process.version},migrations,commands:[],notRun:[],startedAt:new Date().toISOString()};
const dockerProbe=await execute('docker',['info','--format','{{.OSType}} {{.Architecture}}']);await writeFile(join(output,'validation-logs/docker-preflight.log'),dockerProbe.text);
if(dockerProbe.exitCode===0)commands.splice(4,0,['docker',...nodeTests(docker)]);else report.notRun.push({id:'docker',tests:docker,reason:'Docker daemon unavailable; preflight failed before integration assertions',exitCode:dockerProbe.exitCode});
report.notRun.push({id:'native-linux-amd64',reason:process.platform==='linux'&&process.arch==='x64'?'Native host detected; media runtime still requires pinned image/kernel/resource attestation':'This host is '+process.platform+'/'+process.arch+'; no native Linux AMD64 runner available'});
// Worker PostgreSQL media fixture is now part of the same disposable runner.
for(const [id,bin,args]of commands){
 process.stdout.write('Starting '+id+'\n');const result=await execute(bin,args),log='validation-logs/'+id+'.log';await writeFile(join(output,log),result.text);
 const number=label=>{const matches=[...result.text.matchAll(new RegExp('^(?:# |ℹ )'+label+' (\\d+)','gm'))];return matches.length?matches.reduce((n,m)=>n+Number(m[1]),0):null;};
 report.commands.push({id,command:[bin,...args],exitCode:result.exitCode,status:result.exitCode===0?'PASS':'FAIL',tests:number('tests'),pass:number('pass'),fail:number('fail'),skipped:number('skipped'),startedAt:result.startedAt,finishedAt:result.finishedAt,log,sha256:createHash('sha256').update(result.text).digest('hex')});
 await writeFile(join(output,'qualification-results.json'),JSON.stringify(report,null,2));process.stdout.write(id+': '+report.commands.at(-1).status+'\n');
}
report.finishedAt=new Date().toISOString();report.finalCandidate=await git(['rev-parse','HEAD']);report.trackedStatus=await git(['status','--porcelain','--untracked-files=no']);report.untrackedStatus=await git(['ls-files','--others','--exclude-standard']);
await writeFile(join(output,'qualification-results.json'),JSON.stringify(report,null,2));
process.exitCode=report.commands.some(c=>c.status==='FAIL')||report.notRun.length||report.trackedStatus?1:0;
