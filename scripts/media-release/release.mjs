// LOCAL ONLY. No cloud API, push, activation or hosted credential loading.
import {spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,realpath} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,join,relative,isAbsolute,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {requireFixedRuntime,residualDispositions} from './policy.mjs';
const root=resolve(new URL('../../',import.meta.url).pathname);
const sha=b=>createHash('sha256').update(b).digest('hex');
function execute(exe,args,extra={}) {
 const r=spawnSync(exe,args,{cwd:root,encoding:'utf8',env:{PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,...extra},maxBuffer:32e6});
 return {status:r.status??1,stdout:r.stdout||'',stderr:r.stderr||''};
}
function run(exe,args,extra={}) {const r=execute(exe,args,extra);if(r.status!==0)throw Error('Release check failed: '+exe+' '+args[0]);return r.stdout.trim();}
export function scanSummary(scan) {
 if(scan.Metadata?.OS?.Family!=='debian'||!scan.Results?.some(r=>r.Class==='os-pkgs'&&r.Packages?.length))throw Error('Scanner OS/package coverage missing');
 const vulnerabilities=scan.Results.flatMap(r=>r.Vulnerabilities||[]);
 return Object.fromEntries(['CRITICAL','HIGH','MEDIUM','LOW','UNKNOWN'].map(s=>[s,vulnerabilities.filter(v=>v.Severity===s).length]));
}
async function context() {
 const entries=[];
 for(const dir of ['workers/media','services/media-broker','contracts/submission-media','tests/media-worker']) {
  async function walk(path) {for(const e of (await readdir(join(root,path),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
   if(['node_modules','.DS_Store'].includes(e.name))continue;const p=path+'/'+e.name;
   if(e.isDirectory())await walk(p);else if(e.isFile())entries.push([p,sha(await readFile(join(root,p)))]);else throw Error('Unexpected symlink in release context');
  }}await walk(dir);
 }
 for(const p of ['.dockerignore','tests/media-worker-media.test.mjs','tests/media-worker-remediation.test.mjs','tests/media-broker-security.test.mjs'])entries.push([p,sha(await readFile(join(root,p)))]);
 return sha(JSON.stringify(entries.sort()));
}
export async function release(output) {
 const tempRoot=process.env.GITHUB_ACTIONS==='true'?process.env.RUNNER_TEMP:tmpdir();
 const destination=output?join(await realpath(dirname(resolve(output))),basename(output)):null;
 const tail=destination&&tempRoot?relative(await realpath(tempRoot),destination):null;
 if(!tail||tail==='..'||tail.startsWith('../')||isAbsolute(tail))throw Error('Output must be inside the local/runner temporary directory');
 if(run('git',['status','--porcelain']))throw Error('Commit reviewed source before release');
 await mkdir(output,{recursive:true,mode:0o700});
 const provenance={source_head:run('git',['rev-parse','HEAD']),tree:run('git',['rev-parse','HEAD^{tree}']),context_sha256:await context(),platform:'linux/amd64',bases:{node:'node:26.11.1-trixie-slim@sha256:193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0',python:'python:3.14.8-slim-trixie@sha256:f85c5697265c178cc6887276c55fe16cf3d14ca35c3df6a5eab3b360534a55d2'},apt_snapshot:'20261007T000000Z',tools:{syft:run('syft',['version']),trivy:run('trivy',['--version'])},execution:{host_platform:process.platform,host_arch:process.arch,native_amd64:process.platform==='linux'&&process.arch==='x64',run_id:process.env.GITHUB_ACTIONS==='true'?process.env.GITHUB_RUN_ID:null},images:[]};
 const policy=JSON.parse(await readFile(join(root,'scripts/media-release/residual-dispositions.json'),'utf8'));
 provenance.residual_policy_sha256=sha(JSON.stringify(policy));
 const dockerEnv={DOCKER_HOST:run('docker',['context','inspect','--format','{{.Endpoints.docker.Host}}'])};
 for(const kind of ['worker','broker']) {
  const tag='tse-media-'+kind+':release-local';run('docker',['build','--platform','linux/amd64','-f',kind==='worker'?'workers/media/Dockerfile':'services/media-broker/Dockerfile','--build-arg','SOURCE_REVISION='+provenance.source_head,'--build-arg','SOURCE_TREE='+provenance.tree,'--build-arg','SOURCE_CONTEXT_HASH='+provenance.context_sha256,'-t',tag,'.']);
  const image=JSON.parse(run('docker',['image','inspect',tag]))[0];
  if(image.Architecture!=='amd64'||image.Config.Labels?.['org.opencontainers.image.revision']!==provenance.source_head||image.Config.Labels?.['io.thesyncexchange.source-tree']!==provenance.tree||image.Config.Labels?.['io.thesyncexchange.context-sha256']!==provenance.context_sha256)throw Error('Image/source annotation mismatch');
  const imageRead=path=>run('docker',['run','--rm','--network','none','--entrypoint','/usr/local/bin/node',tag,'-e','process.stdout.write(require("fs").readFileSync('+JSON.stringify(path)+'))']);
  const inventory=imageRead('/opt/runtime-packages.txt');const files=imageRead('/opt/runtime-files.json');await writeFile(join(output,kind+'-runtime-files.json'),files);await writeFile(join(output,kind+'-packages.txt'),inventory);
  let kernel=null,resources=null;
  const isolation=['--rm','--platform','linux/amd64','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory','2g','--cpus','2','--pids-limit','64','--tmpfs','/work:rw,size=536870912,uid=1000,gid=1000,mode=0700'];
  if(kind==='worker'){
   kernel=JSON.parse(run('docker',['run',...isolation,'--entrypoint','/usr/bin/python3',tag,'workers/media/runtime-kernel-probe.py']));
   await writeFile(join(output,'worker-kernel.json'),JSON.stringify(kernel,null,2));
   if(provenance.execution.native_amd64&&kernel.landlock_abi>=3&&kernel.seccomp_allow_all_install===0&&kernel.no_new_privs===0&&kernel.uid===1000&&kernel.machine==='x86_64'){
    const resource=execute('docker',['run',...isolation,'--entrypoint','/usr/local/bin/node',tag,'tests/media-worker/resource.mjs']);
    await writeFile(join(output,'worker-resource.txt'),resource.stdout+resource.stderr);
    if(resource.status===0)resources=JSON.parse(resource.stdout);
   }
  }
  const tests=execute('docker',['run','--rm','--platform','linux/amd64','--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--memory',kind==='worker'?'2g':'512m','--cpus',kind==='worker'?'2':'1','--pids-limit','64','--tmpfs','/work:rw,size=536870912,uid=1000,gid=1000,mode=0700','--entrypoint','/usr/local/bin/node',tag,...(kind==='worker'?['workers/media/entrypoint.mjs','--self-test']:['--test','tests/media-broker-security.test.mjs'])]);
  await writeFile(join(output,kind+'-tests.txt'),tests.stdout+tests.stderr);
  const sbom=JSON.parse(run('syft',['docker:'+tag,'-o','cyclonedx-json'],dockerEnv));sbom.components ||= [];
  const versions=JSON.parse(run('docker',['run','--rm','--network','none','--entrypoint','/usr/local/bin/node',tag,'-p','JSON.stringify(process.versions)']));
  requireFixedRuntime(versions);
  const component=(name,version,properties=[])=>sbom.components.push({type:'application',name,version,purl:'pkg:generic/'+name+'@'+version,properties});
  component('node',versions.node,[{name:'bundled-components',value:JSON.stringify(versions)}]);
  for(const name of ['openssl','sqlite','zlib','undici','v8','ares','brotli','nghttp2','nghttp3','ngtcp2','llhttp','uvwasi','uv','simdjson','simdutf','libffi','lief','icu','zstd'])if(versions[name])component('node-bundled-'+name,versions[name],[{name:'origin',value:'bundled in pinned official Node26.11.1 binary; OpenSSL3.5.9 fixes CVE2026-84782; retain independent component advisory coverage'}]);
  let ffmpeg=null;
  if(kind==='worker') {
   component('python',run('docker',['run','--rm','--network','none','--entrypoint','/usr/bin/python3',tag,'-c','import platform;print(platform.python_version())']));
   ffmpeg=run('docker',['run','--rm','--network','none','--entrypoint','/opt/media/bin/ffmpeg',tag,'-version']);
   component('ffmpeg','9.0.2',[{name:'source-archive-sha256',value:'8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e'},{name:'configure',value:ffmpeg}]);
  }
  component('sync-exchange-media-'+kind,provenance.source_head,[{name:'source-tree',value:provenance.tree},{name:'local-image-digest',value:image.Id}]);
  const sbomBytes=JSON.stringify(sbom,null,2);await writeFile(join(output,kind+'-sbom.json'),sbomBytes);
  const scan=JSON.parse(run('trivy',['image','--scanners','vuln','--format','json',tag],dockerEnv));const scanBytes=JSON.stringify(scan,null,2);await writeFile(join(output,kind+'-scan.json'),scanBytes);
  let dispositions=[],disposition_error=null;try{dispositions=residualDispositions(scan,kind,policy);}catch(e){disposition_error=e.message;}
  provenance.images.push({kind,kernel,resources,dispositions,disposition_error,local_image_digest:image.Id,registry_manifest_digest:null,packages_sha256:sha(inventory),runtime_files_sha256:sha(files),bundled_node_versions:versions,ffmpeg,sbom_sha256:sha(sbomBytes),scan_sha256:sha(scanBytes),test_exit:tests.status,test_sha256:sha(tests.stdout+tests.stderr),scan_severities:scanSummary(scan)});
 }
 await writeFile(join(output,'provenance.json'),JSON.stringify(provenance,null,2));
 if(provenance.images.some(i=>i.test_exit!==0||i.disposition_error||['CRITICAL','HIGH','UNKNOWN'].some(s=>i.scan_severities[s]>0)||i.kind==='worker'&&(!provenance.execution.native_amd64||!i.resources)))throw Error('Runtime proof or vulnerability disposition required; no release approved');
 return provenance;
}
if(process.argv[1]===new URL(import.meta.url).pathname)release(process.argv[2]).catch(e=>{process.stderr.write(e.message+'\n');process.exitCode=1;});
