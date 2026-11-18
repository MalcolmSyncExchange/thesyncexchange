import { existsSync, readdirSync, readFileSync, lstatSync, realpathSync, writeFileSync, unlinkSync, chmodSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

export const STATIC_DIRECTORY = '.netlify/static';

// Every compiled/static and public file must arrive at its browser-visible path.
export function verifyStagingAssets(directory) {
  const output = resolve(directory, STATIC_DIRECTORY);
  if (!existsSync(output) || lstatSync(output).isSymbolicLink()) throw Error('Prepared static output missing or linked.');
  let chunks = 0, css = 0, javascript = 0, publicFiles = 0;
  function verify(source, prefix) {
    if (!existsSync(source)) throw Error('Source asset directory missing.');
    function walk(path) {
      for (const entry of readdirSync(path, { withFileTypes: true })) {
        if (entry.name === '.DS_Store') continue;
        const full = join(path, entry.name);
        if (entry.isSymbolicLink()) throw Error('Linked source asset rejected.');
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.isFile()) throw Error('Non-file source asset rejected.');
        const name = relative(source, full), target = join(output, prefix, name);
        if (!existsSync(target) || !realpathSync(target).startsWith(realpathSync(output) + '/') ||
            !readFileSync(full).equals(readFileSync(target))) throw Error('Prepared asset missing or mismatched: ' + join(prefix, name));
        if (prefix) { chunks++; if (name.endsWith('.css')) css++; if (name.endsWith('.js')) javascript++; }
        else publicFiles++;
      }
    }
    walk(source);
  }
  verify(join(directory, '.next/static'), '_next/static');
  verify(join(directory, 'public'), '');
  if (!css || !javascript || !publicFiles) throw Error('Prepared CSS, JavaScript or public assets missing.');
  if (!existsSync(join(directory, '.netlify/netlify.toml'))) throw Error('Adapter routing configuration missing.');
  return { chunks, css, javascript, publicFiles, publishDirectory: STATIC_DIRECTORY };
}

// A separate --no-build process does not inherit the adapter's in-memory config.
// Give it the exact generated config for this synchronous upload, then restore
// the authored configuration byte-for-byte even when upload fails.
export function withPreparedDeployConfig(directory, upload) {
  const target = join(directory, 'netlify.toml');
  if (existsSync(target) && !lstatSync(target).isFile()) throw Error('Linked or non-file root Netlify config rejected.');
  const original = existsSync(target) ? readFileSync(target) : null;
  const mode = existsSync(target) ? lstatSync(target).mode & 0o777 : 0o600;
  const generated = readFileSync(join(directory, '.netlify/netlify.toml'));
  let replaced = false;
  try {
    writeFileSync(target, generated, { flag: original === null ? 'wx' : 'w', mode:0o600 });
    replaced = true;
    chmodSync(target, 0o600);
    return upload();
  } finally {
    if (replaced) {
      if (original === null) unlinkSync(target);
      else { writeFileSync(target, original); chmodSync(target, mode); }
    }
  }
}
