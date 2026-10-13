// Run only with separate founder deployment authorization. Never publishes before verification.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { main, SITE } from './verify-staging-publication.mjs';
export async function runCheckedPublication({ build, verify, publish }) {
  await build();
  await verify();
  await publish();
}
async function execute() {
  const childEnv={...process.env};
  delete childEnv.SUPABASE_SERVICE_ROLE_KEY;
  const cli=process.env.NETLIFY_CLI_BIN || 'netlify';
  await runCheckedPublication({
    build:()=>execFileSync(cli,['build','--context','production','--site',SITE],{env:childEnv,stdio:'inherit'}),
    verify:main,
    publish:()=>execFileSync(cli,['deploy','--no-build','--prod','--context','production','--site',SITE],{env:childEnv,stdio:'inherit'})
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)execute().catch(()=>{
  console.error('Checked staging publication stopped. Do not retry automatically or publish manually.');
  process.exitCode=1;
});
