import { spawn } from 'node:child_process';
// Deployment deliberately fails closed until a separately reviewed hosted broker
// transport is configured. The source processor consumes only injected trusted jobs.
if(process.argv.length===3&&process.argv[2]==='--self-test') {
  const child=spawn(process.execPath,['--test','tests/media-worker-media.test.mjs'],{stdio:'inherit',env:{PATH:'/usr/bin:/bin',TMPDIR:'/work',MEDIA_TOOL_DIR:'/opt/media/bin'}});
  child.on('exit',code=>process.exit(code??1));
} else {
  process.stderr.write('MEDIA_BROKER_NOT_CONFIGURED\n');process.exit(78);
}
