import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:https';
import path from 'node:path';
import { artist, create, ids, metadata, readyPackage, revision } from './music-uploads-fixture.mjs';

const rpcNames = new Set([
  'media_upload_find', 'media_upload_read', 'media_upload_admin_read', 'media_admin_review_state',
  'media_workspace_documents', 'media_submission_status',
  'media_master_can_play', 'media_master_playback_authorized', 'media_upload_can_play', 'media_upload_playback_authorized'
]);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const duration = 30;
const sampleRate = 44100;
const amplitude = point => 300 + Math.round(16000 * Math.abs(Math.sin(point / 89) * Math.sin(point / 37)));

function sampleMedia() {
  const frames = duration * sampleRate;
  const wav = Buffer.alloc(44 + frames * 2);
  wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) {
    const point = Math.floor(i / (sampleRate / 100));
    wav.writeInt16LE(Math.round(amplitude(point) * Math.sin(i * 2 * Math.PI * 220 / sampleRate)), 44 + i * 2);
  }

  const points = duration * 100;
  const wavHash = sha256(wav);
  const envelope = Buffer.alloc(512 + points * 4);
  const header = JSON.stringify({ encoding: 'waveform_minmax_i16_v1', profile: 'waveform-minmax-v1',
    points_per_second: 100, duration_us: duration * 1e6, points, source_sha256: wavHash });
  envelope.writeUInt32LE(Buffer.byteLength(header), 0);
  envelope.write(header, 4);
  for (let i = 0; i < points; i++) {
    envelope.writeInt16LE(-amplitude(i), 512 + i * 4);
    envelope.writeInt16LE(amplitude(i), 514 + i * 4);
  }
  return { wav, wavHash, envelope };
}

function serveWav(req, res, contents, headers) {
  const range = req.headers.range;
  const type = { ...headers, 'content-type': 'audio/wav', 'accept-ranges': 'bytes' };
  if (!range) {
    res.writeHead(200, { ...type, 'content-length': contents.length });
    res.end(contents);
    return;
  }
  const bounds = /^bytes=(\d+)-(\d*)$/.exec(range);
  const start = Number(bounds?.[1]);
  const end = bounds?.[2] ? Math.min(Number(bounds[2]), contents.length - 1) : contents.length - 1;
  if (!bounds || start > end) {
    res.writeHead(416, { ...type, 'content-range': `bytes */${contents.length}` });
    res.end();
    return;
  }
  res.writeHead(206, { ...type, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${contents.length}` });
  res.end(contents.subarray(start, end + 1));
}

// The production capability validates an HTTPS Storage origin. Keep the test
// provider on loopback and trust only this run's certificate in the app process.
export async function startLocalMediaTls(providerUrl, output) {
  const cert = path.join(output, 'fixture-certificate.pem');
  const key = path.join(output, 'fixture-private-key.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert], { stdio: 'ignore' });
  const target = new URL(providerUrl);
  const certificate = { cert: readFileSync(cert), key: readFileSync(key) };
  unlinkSync(key);
  const server = createServer(certificate, (req, res) => {
    const upstream = request({ hostname: target.hostname, port: target.port, method: req.method, path: req.url,
      headers: { ...req.headers, host: target.host } }, response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    res.on('close', () => upstream.destroy());
    req.pipe(upstream);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { url: `https://127.0.0.1:${server.address().port}`, cert,
    close: () => new Promise(resolve => server.close(resolve)) };
}

export function adminTrackMediaFixture() {
  const objects = new Map();
  const capabilities = new Map();
  let changeRead, expiresOnDelivery = false;

  return {
    async seed(fixture, { submitted = true } = {}) {
      const { wav, wavHash, envelope } = sampleMedia();
      return fixture.withDatabase(async db => {
        await db.exec('update submission_media.capabilities set reservations_enabled=true, worker_enabled=true, activation_enabled=true, foundation_reads_enabled=true');
        await db.exec("insert into storage.buckets(id,name,public) values('submission-source','submission-source',false),('submission-derived','submission-derived',false),('submission-artwork','submission-artwork',false) on conflict do nothing");
        if (submitted) {
          // The shared queue fixture starts pending. Use the normal draft-to-review transition.
          await db.query("update tracks set status='draft' where id=$1", [ids.draft]);
        }
        const submission = await create(db, submitted ? ids.draft : null);
        const { master } = await readyPackage(db, submission, {
          sourceMedia: { bytes: wav.length, sha256: wavHash },
          waveformMedia: { bytes: envelope.length, sha256: sha256(envelope) }
        });
        await artist(db, 'media_upload_save_metadata', [submission, metadata, await revision(db, submission), randomUUID()]);
        if (submitted) await artist(db, 'media_upload_submit', [submission, await revision(db, submission), randomUUID()]);
        const { rows: assets } = await db.query(`select id, kind, bucket, object_path from submission_media.assets
          where id=$1 or (source_asset_id=$1 and kind='waveform')`, [master]);
        const waveform = assets.find(a => a.kind === 'waveform');
        const source = assets.find(a => a.id === master);
        objects.set(`${waveform.bucket}/${waveform.object_path}`, envelope);
        objects.set(`${source.bucket}/${source.object_path}`, wav);
        return { submission, master, waveform: waveform.id, objectPath: source.object_path, wavHash };
      });
    },
    simulateAdminRead(change) { changeRead = change; },
    expireNextOriginal() { expiresOnDelivery = true; },
    async rpc(name, args, db) {
      if (name === 'consume_rate_limit') {
        const result = await db.query('select to_jsonb(r) value from public.consume_rate_limit($1,$2,$3) r',
          [args.p_namespace, args.p_operation, args.p_subject]);
        return { value: result.rows.map(row => row.value) };
      }
      if (!rpcNames.has(name)) return null;
      const { rows: [definition] } = await db.query("select proargnames from pg_proc where proname=$1 and pronamespace='public'::regnamespace", [name]);
      const params = (definition.proargnames ?? []).map(key => args[key] ?? null);
      const { rows: [{ value }] } = await db.query(`select public.${name}(${params.map((_, i) => '$' + (i + 1)).join(',')}) value`, params);
      return { value: name === 'media_upload_admin_read' && changeRead ? changeRead(value) : value };
    },
    async storage(req, res, ctx) {
      const signedPath = '/storage/v1/object/sign/';
      const derivedPath = '/storage/v1/object/authenticated/';
      const pathname = ctx.url.pathname;
      if (req.method === 'GET' && pathname.startsWith(derivedPath + 'submission-derived/')) {
        const contents = ctx.service && objects.get(decodeURIComponent(pathname.slice(derivedPath.length)));
        res.writeHead(contents ? 200 : 403, { 'content-type': 'application/octet-stream' });
        res.end(contents || undefined);
      } else if (pathname.startsWith(signedPath + 'submission-source/')) {
        const object = decodeURIComponent(pathname.slice(signedPath.length));
        const contents = objects.get(object);
        if (req.method === 'POST' && ctx.service && contents) {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          if (JSON.parse(Buffer.concat(chunks).toString()).expiresIn !== 60) throw Error('Unexpected fixture signing TTL');
          const token = randomUUID();
          capabilities.set(token, { object, expires: Date.now() + (expiresOnDelivery ? -1 : 60_000) });
          expiresOnDelivery = false;
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ signedURL: `${pathname.replace('/storage/v1', '')}?token=${token}` }));
        } else {
          const token = capabilities.get(ctx.url.searchParams.get('token'));
          const headers = { 'access-control-allow-origin': '*', 'cache-control': 'private, no-store' };
          if (req.method !== 'GET' || !contents || token?.object !== object || token.expires <= Date.now()) {
            res.writeHead(403, headers); res.end();
          } else {
            serveWav(req, res, contents, headers);
          }
        }
      } else return false;
      return true;
    }
  };
}
