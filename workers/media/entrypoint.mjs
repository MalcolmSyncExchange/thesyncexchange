import { spawn } from 'node:child_process';
// Deployment deliberately fails closed until a separately reviewed hosted broker
// transport is configured. The source processor consumes only injected trusted jobs.
if(process.argv.length===3&&process.argv[2]==='--self-test') {
  const child=spawn(process.execPath,['--test','tests/media-worker-media.test.mjs','tests/media-worker-remediation.test.mjs'],{stdio:'inherit',env:{PATH:'/usr/bin:/bin',TMPDIR:'/work',MEDIA_TOOL_DIR:'/opt/media/bin',MEDIA_DESCENDANT_TOOL_DIR:'/opt/media-test/bin'}});
  child.on('exit',code=>process.exit(code??1));
} else if(process.argv.length===2&&process.env.MEDIA_REMOTE_ENABLED==='security-staging') {
  const {runtimePreflight}=await import('./runtime-preflight.mjs');
  const {RemoteBroker}=await import('./remote-broker.mjs');
  const {MediaTools}=await import('./process.mjs');
  const {runOne}=await import('./worker.mjs');
  const {PROJECT}=await import('../../services/media-broker/common.mjs');
  const config={...process.env,EXECUTION_NAME:`projects/${PROJECT}/locations/us-east5/jobs/media-worker-staging/executions/${process.env.CLOUD_RUN_EXECUTION}`};
  const controller=new AbortController(),hardStop=setTimeout(()=>controller.abort(),560000);try{process.once('SIGTERM',()=>controller.abort());process.once('SIGINT',()=>controller.abort());await runtimePreflight(config);controller.signal.throwIfAborted();await runOne(new RemoteBroker(config,{signal:controller.signal}),new MediaTools('/opt/media/bin'),config.MEDIA_BUILD_DIGEST,x=>process.stdout.write(JSON.stringify(x)+'\n'),controller.signal);}catch{process.stderr.write('MEDIA_REMOTE_FAILED\n');process.exitCode=1;}finally{clearTimeout(hardStop);}
} else {
  process.stderr.write('MEDIA_BROKER_NOT_CONFIGURED\n');process.exit(78);
}
