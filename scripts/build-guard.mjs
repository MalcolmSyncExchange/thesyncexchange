import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

function isNextProcess(command) {
  if (/^next-(?:server|build)(?:\s|\(|$)/.test(command)) return true;
  if (/^next(?:\.js)?\s+(?:dev|build|start)(?:\s|$)/.test(command)) return true;
  const node = command.match(/^(?:\S*\/)?node(?:\.exe)?\s+(.+)$/);
  return Boolean(node && !node[1].startsWith('-') && /^(?:.*\/)?next(?:\.js)?\s+(?:dev|build|start)(?:\s|$)/.test(node[1]));
}

// A port belongs to a process, not a checkout. Inspect every Next server/dev
// process so unrelated projects and non-default ports are handled correctly.
export function checkoutNextProcesses(checkout, run = execFileSync) {
  const root = realpathSync(checkout);
  const rows = run('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', timeout: 5000 });
  const matches = [];
  for (const line of rows.split('\n')) {
    const row = line.trim().match(/^(\d+)\s+(.+)$/);
    if (!row || !isNextProcess(row[2])) continue;
    const pid = Number(row[1]);
    if (pid === process.pid) continue;
    let cwd;
    try {
      const details = run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { encoding: 'utf8', timeout: 5000 });
      cwd = details.split('\n').find(value => value.startsWith('n'))?.slice(1);
      if (!cwd) throw Error('Next process cwd unavailable.');
      if (realpathSync(cwd) === root) matches.push(pid);
    } catch (error) {
      // Processes may exit between ps and lsof. Tool absence is not evidence
      // that the checkout is idle; refuse rather than run an unsafe build.
      if (error.code === 'ENOENT') throw error;
      try { process.kill(pid, 0); } catch (probe) { if (probe.code === 'ESRCH') continue; throw error; }
      throw error;
    }
  }
  return matches;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const pids = checkoutNextProcesses(process.cwd());
    if (pids.length) {
      console.error(`Stop this checkout's Next process(es) before building: ${pids.join(', ')}.`);
      console.error('Build and dev must not write the same .next directory concurrently.');
      process.exitCode = 1;
    }
  } catch {
    console.error('Unable to verify this checkout is idle; ps and lsof are required for a safe build.');
    process.exitCode = 1;
  }
}
