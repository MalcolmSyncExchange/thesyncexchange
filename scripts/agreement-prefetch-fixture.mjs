// Local-only, in-memory browser reproduction. No Supabase/Stripe credentials are used.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import http from 'node:http';
import { agreementHarness } from '../tests/helpers/agreement-access-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'agreement-browser-'));
const port = Number(process.env.AGREEMENT_FIXTURE_PORT || 4321);
const apiPort = port + 1;
const origin = `http://127.0.0.1:${port}`;
const legacyPath = path.join(folder, 'legacy.ts');
fs.writeFileSync(legacyPath, execFileSync('git', ['show', '76e6abe3bc2f72365559a647049cd1fad676470b:app/api/orders/[orderId]/agreement/route.ts'], { cwd: root }));
const options = { origin, signedUrl: origin + '/file' };
const legacy = agreementHarness({ ...options, source: legacyPath });
const fixed = agreementHarness(options);
const requests = [];
const evidence = () => ({ requests, legacy: legacy.state, fixed: fixed.state });
const server = http.createServer(async (req, res) => {
  if (req.url === '/evidence') {
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(evidence())); return;
  }
  if (req.url.startsWith('/file')) {
    res.setHeader('content-type', 'text/html'); res.end('<h1>Synthetic agreement — no commercial rights</h1>'); return;
  }
  const headers = Object.fromEntries(['next-router-prefetch', 'purpose', 'sec-purpose', 'rsc', 'next-url', 'user-agent', 'origin', 'sec-fetch-site'].filter(k => req.headers[k]).map(k => [k, req.headers[k]]));
  const mode = req.url.startsWith('/legacy/') ? 'legacy' : 'fixed';
  const response = await (mode === 'legacy' ? legacy : fixed).request(req.method, headers);
  requests.push({ at: new Date().toISOString(), mode, method: req.method, path: req.url, headers, status: response.status });
  fs.writeFileSync(path.join(folder, 'evidence.json'), JSON.stringify(evidence(), null, 2));
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
});
for (const page of ['legacy', 'fixed']) fs.mkdirSync(path.join(folder, 'app', page), { recursive: true });
fs.symlinkSync(path.join(root, 'node_modules'), path.join(folder, 'node_modules'), 'dir');
fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({ private: true, dependencies: { next: '16.3.5', react: '19.3.0', 'react-dom': '19.3.0' } }));
fs.writeFileSync(path.join(folder, 'next.config.mjs'), `export default {async rewrites(){return ${JSON.stringify(['legacy/api/:path*', 'api/:path*', 'evidence', 'file'].map(p => ({ source: '/' + p, destination: `http://127.0.0.1:${apiPort}/${p}` })))};}};`);
fs.writeFileSync(path.join(folder, 'app/layout.jsx'), 'export default function Layout({children}) {return <html><body>{children}</body></html>;}');
const route = '/api/orders/11111111-1111-4111-8111-111111111111/agreement';
fs.writeFileSync(path.join(folder, 'app/legacy/page.jsx'), `import Link from 'next/link'; export default function Page(){return <main><h1>Legacy agreement fixture</h1><Link href=${JSON.stringify('/legacy' + route)}>Legacy download link</Link></main>;}`);
const component = path.join(root, 'components/orders/agreement-download-form');
fs.writeFileSync(path.join(folder, 'app/fixed/page.jsx'), `import Link from 'next/link';import {AgreementDownloadForm} from ${JSON.stringify(component)};export default function Page(){return <main><h1>Fixed agreement fixture</h1><Link href=${JSON.stringify(route)}>Read metadata (prefetch test)</Link><AgreementDownloadForm orderId="11111111-1111-4111-8111-111111111111">Download test agreement</AgreementDownloadForm></main>;}`);
const next = path.join(root, 'node_modules/next/dist/bin/next');
execFileSync(process.execPath, [next, 'build', '--webpack'], { cwd: folder, stdio: 'inherit' });
server.listen(apiPort, '127.0.0.1');
const app = spawn(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', String(port)], { cwd: folder, stdio: 'inherit' });
console.log(JSON.stringify({ legacy: origin + '/legacy', fixed: origin + '/fixed', evidence: path.join(folder, 'evidence.json') }));
const stop = () => { app.kill('SIGTERM'); server.close(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);
