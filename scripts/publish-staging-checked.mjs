// Execute publication only with separate founder authorization.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { main, SITE, verifySelectedSite } from './verify-staging-publication.mjs';
import { STATIC_DIRECTORY, verifyStagingAssets, withPreparedDeployConfig } from './verify-staging-assets.mjs';
export const BUILD_ARGS=['build','--context','production'];
export const DEPLOY_ARGS=['deploy','--no-build','--prod','--site',SITE,'--dir',STATIC_DIRECTORY];
export function validateCliCombination(args) {
  if(args[0]==='deploy' && args.includes('--no-build') && args.includes('--context'))throw Error('Netlify CLI 27.12.0 rejects --context with --no-build.');
  if(args[0]==='build' && args.includes('--site'))throw Error('Build site selection must use the verified local link.');
}
export function validateCliArguments(args,help) {
  validateCliCombination(args);
  const supported=new Set([...help.matchAll(/^\s+(?:-\w,\s+)?(--[\w-]+)/gm)].map(m=>m[1]));
  for(const arg of args.filter(a=>a.startsWith('--')))if(!supported.has(arg))throw Error('Unsupported CLI option: '+arg);
}
export function verifyLocalSiteLink(directory,override) {
  if(override&&override!==SITE)throw Error('Conflicting NETLIFY_SITE_ID override.');
  const path=directory+'/.netlify/state.json';
  if(existsSync(path)){if(JSON.parse(readFileSync(path,'utf8')).siteId!==SITE)throw Error('Wrong project-local Netlify site link.');}
  else {mkdirSync(directory+'/.netlify',{recursive:true});writeFileSync(path,JSON.stringify({siteId:SITE})+'\n',{mode:0o600,flag:'wx'});}
  return SITE;
}
export function artifactFingerprint(directory) {
  const hash=createHash('sha256');let files=0;const root=realpathSync(directory);
  function walk(path,relative,ancestors=new Set()) {
    const resolved=realpathSync(path);
    if(ancestors.has(resolved))throw Error('Cyclic publication artifact link.');
    const next=new Set(ancestors);next.add(resolved);
    for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
      const full=path+'/'+entry.name,name=relative+'/'+entry.name;
      const linked=lstatSync(full).isSymbolicLink();
      if(linked){const target=realpathSync(full);if(!target.startsWith(root+'/'))throw Error('External publication artifact link.');hash.update(name+'->'+target.slice(root.length));}
      const kind=linked?statSync(full):entry;
      if(kind.isDirectory())walk(full,name,next);
      else if(kind.isFile()){hash.update(name);hash.update('\0');hash.update(readFileSync(full));files++;}
    }
  }
  for(const output of ['.next','.netlify']){if(!existsSync(directory+'/'+output))throw Error('Verified build artifact missing.');walk(directory+'/'+output,output);}
  return {sha256:hash.digest('hex'),files};
}
export async function runCheckedPublication({prepare=()=>{},build,verify,publish,fingerprint}) {
  await prepare();await build();
  const built=fingerprint ? fingerprint() : null;
  await verify();
  if(fingerprint && JSON.stringify(fingerprint())!==JSON.stringify(built))throw Error('Verified build artifact changed; upload blocked.');
  await publish();
}

async function execute() {
  const approved=process.argv[2],dry=process.argv.includes('--dry-run');
  if(!/^[a-f0-9]{40}$/.test(approved||'')||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==approved||execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Approved source or clean worktree mismatch.');
  const directory=process.cwd();const childEnv={...process.env};delete childEnv.SUPABASE_SERVICE_ROLE_KEY;delete childEnv.NETLIFY_SITE_ID;
  const cli=process.env.NETLIFY_CLI_BIN||'netlify';
  await runCheckedPublication({
    prepare:async()=>{
      for(const args of [BUILD_ARGS,DEPLOY_ARGS])validateCliArguments(args,execFileSync(cli,[args[0],'--help'],{env:childEnv,encoding:'utf8'}));
      verifyLocalSiteLink(directory,process.env.NETLIFY_SITE_ID);
      if(!dry)await verifySelectedSite();
    },
    build:()=>{verifyLocalSiteLink(directory,process.env.NETLIFY_SITE_ID);if(dry){console.log(JSON.stringify({dryRun:true,site:SITE,build:BUILD_ARGS,deploy:DEPLOY_ARGS,upload:false}));return;}execFileSync(cli,BUILD_ARGS,{env:childEnv,stdio:'inherit'});console.log(JSON.stringify(verifyStagingAssets(directory)));},
    fingerprint:dry?undefined:()=>artifactFingerprint(directory),
    verify:()=>{if(!dry)return main();console.log('Offline command/site-link validation passed; provider, artifact and credential gates remain mandatory for real publication.');},
    publish:()=>{verifyLocalSiteLink(directory,process.env.NETLIFY_SITE_ID);if(!dry){verifyStagingAssets(directory);withPreparedDeployConfig(directory,()=>execFileSync(cli,DEPLOY_ARGS,{env:childEnv,stdio:'inherit'}));}}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)execute().catch(()=>{console.error('Checked staging publication stopped. Do not retry automatically or publish manually.');process.exitCode=1;});
