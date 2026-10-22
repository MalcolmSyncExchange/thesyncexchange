import { createHash } from 'node:crypto';

export const MAX_ASSET_BYTES = 250_000_000;
export const MAX_INLINE_BYTES = 4_000_000;
export const privateDeliveryHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Netlify-CDN-Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; sandbox",
  'Referrer-Policy': 'no-referrer',
  Vary: 'Cookie, Authorization',
};
export class DeliveryFailure extends Error {
  constructor(code) { super('Secure download could not be prepared.'); this.code = code; }
}
export function verifyArtifact(bytes, expected) {
  if (!Number.isSafeInteger(expected.byteSize) || expected.byteSize < 1 || expected.byteSize > MAX_ASSET_BYTES ||
      bytes.byteLength !== expected.byteSize || !/^[a-f0-9]{64}$/.test(expected.sha256) ||
      createHash('sha256').update(bytes).digest('hex') !== expected.sha256) {
    throw new DeliveryFailure('integrity_failed');
  }
  return bytes;
}

/** The only fetch target is the configured project, never a supplied URL.
 * Read at most the sealed size, reject redirects, and cancel on timeout/abort.
 * Neither provider credentials nor signed URLs enter the response or audit. */
export async function fetchPrivateArtifact({ projectUrl, serviceKey, bucket, path, byteSize, signal, fetcher = fetch }) {
  if (!serviceKey || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > MAX_ASSET_BYTES ||
      !/^[a-z0-9-]{1,63}$/.test(bucket) || !path || path.startsWith('/') || /[%\\?#\u0000-\u001f]/.test(path) ||
      path.split('/').some(s => !s || s === '.' || s === '..')) throw new DeliveryFailure('integrity_failed');
  const base = new URL(projectUrl);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash || base.pathname !== '/') {
    throw new DeliveryFailure('storage_failed');
  }
  const abort = signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
  const url = new URL(`/storage/v1/object/authenticated/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`, base);
  let response;
  try {
    response = await fetcher(url, { redirect: 'error', cache: 'no-store', signal: abort,
      headers: { Authorization: `Bearer ${serviceKey}`, apikey: serviceKey, 'Accept-Encoding': 'identity' } });
  } catch { throw new DeliveryFailure(signal?.aborted ? 'aborted' : 'storage_failed'); }
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new DeliveryFailure('storage_failed'); }
  const length = response.headers.get('content-length');
  if (length !== null && Number(length) !== byteSize) { await response.body.cancel(); throw new DeliveryFailure('integrity_failed'); }
  const reader = response.body.getReader();
  const bytes = new Uint8Array(byteSize);
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (abort.aborted) throw new DeliveryFailure(signal?.aborted ? 'aborted' : 'storage_failed');
      if (size + value.byteLength > byteSize) throw new DeliveryFailure('integrity_failed');
      bytes.set(value, size); size += value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error instanceof DeliveryFailure ? error : new DeliveryFailure(signal?.aborted ? 'aborted' : 'storage_failed');
  } finally { reader.releaseLock(); }
  if (size !== byteSize) throw new DeliveryFailure('integrity_failed');
  return bytes;
}

/** Dependencies implement authentication/RLS before any privileged call. */
export async function deliverAsset(request, orderId, entitlementId, dependencies) {
  const json = (error, status) => Response.json({ error }, { status, headers: privateDeliveryHeaders });
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { ...privateDeliveryHeaders, Allow: 'POST' } });
  if (request.headers.get('origin') !== new URL(request.url).origin ||
      ![null, 'same-origin', 'none'].includes(request.headers.get('sec-fetch-site'))) return json('Forbidden.', 403);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(orderId) || !uuid.test(entitlementId)) return json('Download unavailable.', 404);
  // Whole-file integrity is verified before delivery. Partial requests are not supported.
  if (request.headers.has('range')) return json('Partial downloads are unavailable. Request the complete file.', 416);
  const requestId = request.headers.get('idempotency-key') || dependencies.randomUUID();
  if (!uuid.test(requestId)) return json('Invalid download request.', 400);
  let actor, authorization;
  try {
    actor = await dependencies.authenticate();
    if (!actor) return json('Unauthorized.', 401);
    if (actor.role !== 'buyer' || !await dependencies.ownsOrder(actor.id, orderId)) {
      await dependencies.deny(orderId, entitlementId, requestId);
      return json(actor.role !== 'buyer' ? 'Forbidden.' : 'Download unavailable.', actor.role !== 'buyer' ? 403 : 404);
    }
    authorization = await dependencies.begin(actor.id, orderId, entitlementId, requestId);
    if (!authorization.allowed) return json('Download unavailable. Refresh your purchase or contact support.', authorization.reason === 'rate_limited' ? 429 : 409);
    if (authorization.byteSize > MAX_INLINE_BYTES) {
      if (!dependencies.ticket) throw new DeliveryFailure('storage_failed');
      const ticket = await dependencies.ticket(actor.id, authorization);
      return Response.json(ticket, { headers: privateDeliveryHeaders });
    }
    const bytes = verifyArtifact(await dependencies.read(authorization, request.signal), authorization);
    if (request.signal.aborted) throw new DeliveryFailure('aborted');
    // A refund/hold/rights withdrawal during Storage I/O must win this recheck.
    if (!await dependencies.finish(actor.id, authorization.authorizationId, 'bytes_prepared')) return json('Download authorization expired or access changed. Refresh your purchase.', 409);
    const extension = { 'audio/wav':'wav', 'audio/x-wav':'wav', 'audio/mpeg':'mp3', 'audio/aiff':'aiff', 'audio/flac':'flac', 'application/zip':'zip', 'application/pdf':'pdf' }[authorization.mimeType];
    if (!extension) return json('Download unavailable.', 503);
    return new Response(bytes, { headers: { ...privateDeliveryHeaders, 'Content-Type': authorization.mimeType,
      'Content-Length': String(bytes.byteLength), 'Content-Disposition': `attachment; filename="tse-${authorization.kind}-${authorization.assetVersionId}.${extension}"` } });
  } catch (error) {
    if (actor && authorization?.allowed) {
      try { await dependencies.finish(actor.id, authorization.authorizationId, error instanceof DeliveryFailure ? error.code : 'storage_failed'); } catch { /* No bytes leave without durable evidence. */ }
    }
    return json('Secure download is unavailable. Please try again from your purchase.', 503);
  }
}
