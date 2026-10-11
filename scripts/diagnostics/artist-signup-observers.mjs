// Read-only, project-pinned observers. Transports return rows, never log inputs.
import { APPROVED_ORIGIN } from './artist-signup-browser-driver.mjs';
export const STAGING_PROJECT = 'oppijylbkcbiqfuvckgj';
export const POSTHOG_PROJECT = 657650;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const literal = value => `'${String(value).replaceAll("'", "''")}'`;
const count = value => {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) throw Error('Invalid observation');
  const n = Number(value);
  if (value === null || value === undefined || !Number.isSafeInteger(n) || n < 0) throw Error('Invalid observation');
  return n;
};
const bool = value => {
  if (typeof value !== 'boolean') throw Error('Invalid observation');
  return value;
};

export async function boundedRead(operation, timeoutMs = 5000, signal) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || signal?.aborted) throw Error('Observation unavailable');
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Observation unavailable')), timeoutMs); })
    ]);
  } finally { clearTimeout(timer); }
}

/**
 * Connector bridge contract:
 * supabaseIdentity() => { id }; posthogIdentity() => { id };
 * supabaseQuery({ projectId, query, signal }) => { projectId, rows };
 * posthogQuery({ projectId, query, signal }) => { projectId, rows }.
 * Each bridge must use ONLY read tools and discard raw errors. No API keys needed.
 */
export function createTrustedSignupObservers({ email, startedAt, transports, timeoutMs = 5000 }) {
  if (typeof email !== 'string' || !email.includes('@') || email.length > 254 || !Number.isFinite(Date.parse(startedAt))) {
    throw Error('Invalid observer configuration');
  }
  const start = new Date(startedAt).toISOString();
  let baselineVerified = false;
  let privateUserId = null;
  let privateEventId = null;

  async function db(query, context = {}) {
    return boundedRead(async () => {
      if ((await transports.supabaseIdentity())?.id !== STAGING_PROJECT) throw Error('Wrong observer project');
      const result = await transports.supabaseQuery({ projectId: STAGING_PROJECT, query, signal: context.signal });
      if (result?.projectId !== STAGING_PROJECT || !Array.isArray(result.rows)) throw Error('Invalid observation');
      return result.rows;
    }, context.timeoutMs ?? timeoutMs, context.signal);
  }
  async function ph(query, context = {}) {
    return boundedRead(async () => {
      if ((await transports.posthogIdentity())?.id !== POSTHOG_PROJECT) throw Error('Wrong observer project');
      const result = await transports.posthogQuery({ projectId: POSTHOG_PROJECT, query, signal: context.signal });
      if (result?.projectId !== POSTHOG_PROJECT || !Array.isArray(result.rows)) throw Error('Invalid observation');
      return result.rows;
    }, context.timeoutMs ?? timeoutMs, context.signal);
  }
  async function baseline() {
    baselineVerified = false;
    try {
      const [row] = await db(`SELECT
        (SELECT count(*) FROM auth.users WHERE lower(email)=lower(${literal(email)})) AS matching_auth,
        (SELECT count(*) FROM auth.identities WHERE lower(email)=lower(${literal(email)})) AS matching_identities,
        (SELECT count(*) FROM public.user_profiles WHERE lower(email)=lower(${literal(email)})) AS matching_profiles,
        (SELECT count(*) FROM auth.users) AS auth_total,
        (SELECT count(*) FROM public.user_profiles) AS profile_total,
        (SELECT count(*) FROM public.analytics_outbox) AS outbox_total,
        (SELECT count(*) FROM public.analytics_outbox WHERE event='signup_completed') AS signup_total`);
      const result = Object.fromEntries(['matching_auth', 'matching_identities', 'matching_profiles', 'auth_total', 'profile_total', 'outbox_total', 'signup_total'].map(k => [k, count(row?.[k])]));
      baselineVerified = result.matching_auth === 0 && result.matching_identities === 0 && result.matching_profiles === 0;
      return { status: 'observed', unusedIdentity: baselineVerified, counts: result };
    } catch { return { status: 'unavailable', unusedIdentity: false, counts: null }; }
  }
  async function observe(context = {}) {
    privateUserId = null;
    privateEventId = null;
    if (!baselineVerified) return { status: 'unavailable' };
    let partial = {};
    try {
      const users = await db(`SELECT id::text AS user_id, email_confirmed_at IS NOT NULL AS confirmed,
        (SELECT count(*) FROM auth.identities i WHERE i.user_id=u.id) AS identities,
        (SELECT count(*) FROM auth.sessions s WHERE s.user_id=u.id AND (s.not_after IS NULL OR s.not_after>now())) AS sessions
        FROM auth.users u WHERE lower(email)=lower(${literal(email)}) AND created_at>=${literal(start)}::timestamptz`, context);
      if (users.length === 0) return { status: 'absent', authCount: 0 };
      if (users.length !== 1) return { status: 'observed', authCount: users.length, duplicates: true };
      const u = users[0];
      if (!UUID.test(u.user_id)) throw Error('Invalid observation');
      privateUserId = u.user_id;
      partial = { authCount: 1, identities: count(u.identities), confirmed: bool(u.confirmed), serverSessionCount: count(u.sessions) };
      const profiles = await db(`SELECT role::text AS canonical_role FROM public.user_profiles WHERE id=${literal(privateUserId)}::uuid`, context);
      const events = await db(`SELECT id::text AS event_id, delivered_at IS NOT NULL AS delivered,
        dedupe_key=${literal('signup:' + privateUserId)} AS dedupe_valid,
        actor_role='artist' AS artist, environment='preview' AS preview, is_test
        FROM public.analytics_outbox WHERE actor_id=${literal(privateUserId)}::uuid AND event='signup_completed'`, context);
      if (events.length === 1) {
        if (!UUID.test(events[0].event_id)) throw Error('Invalid observation');
        privateEventId = events[0].event_id;
      }
      const event = events.length === 1 ? events[0] : null;
      return {
        status: 'observed', authCount: 1, identities: count(u.identities), confirmed: bool(u.confirmed),
        serverSessionCount: count(u.sessions), profileCount: profiles.length,
        artistRole: profiles.length === 1 && profiles[0].canonical_role === 'artist',
        outboxCount: events.length, outboxDelivered: event ? bool(event.delivered) : false,
        eventScopeValid: event ? bool(event.dedupe_valid) && bool(event.artist) && bool(event.preview) && bool(event.is_test) : false,
        duplicates: profiles.length > 1 || events.length > 1
      };
    } catch { privateUserId = null; privateEventId = null; return { status: 'unavailable', ...partial }; }
  }
  async function delivery(context = {}) {
    if (!privateUserId || !privateEventId) return { status: 'unavailable' };
    try {
      const end = new Date(context.endedAt ?? Date.now()).toISOString();
      if (end < start) throw Error('Invalid observation window');
      const rows = await ph(`SELECT uuid, count() AS records,
        countIf(properties.environment='preview' AND properties.is_test=true AND properties.role='artist') AS scoped_records
        FROM events WHERE event='signup_completed' AND distinct_id=${literal(privateUserId)}
        AND timestamp>=${literal(start)} AND timestamp<=${literal(end)} GROUP BY uuid LIMIT 100`, context);
      let records = 0, matched = 0, scopeValid = true;
      for (const r of rows) {
        if (!UUID.test(r.uuid)) throw Error('Invalid observation');
        const n = count(r.records), scoped = count(r.scoped_records);
        if (scoped > n) throw Error('Invalid observation');
        records += n;
        if (r.uuid === privateEventId) matched += n;
        if (scoped !== n) scopeValid = false;
      }
      // A full page cannot establish an exact total without pagination.
      if (rows.length >= 100) throw Error('Incomplete observation');
      return { status: records === 0 ? 'absent' : 'observed', records, matched, scopeValid, duplicates: records > 1 };
    } catch { return { status: 'unavailable' }; }
  }
  async function profileProbe(context) {
    const r = await observe(context);
    return { persisted: r.status === 'observed' && r.profileCount === 1, canonicalRole: r.artistRole ? 'artist' : null };
  }
  async function sessionProbe(context) {
    try {
      const r = await observe(context);
      if (r.status !== 'observed' || r.serverSessionCount < 1 || typeof transports.browserSession !== 'function') return { authenticated: false };
      const evidence = await boundedRead(() => transports.browserSession(context), context?.timeoutMs ?? timeoutMs, context?.signal);
      return { authenticated: evidence?.authenticated === true && evidence?.validatedBy === 'server_get_user' &&
        evidence?.origin === APPROVED_ORIGIN && evidence?.projectId === STAGING_PROJECT && evidence?.userId === privateUserId };
    } catch { return { authenticated: false }; }
  }
  return Object.freeze({ baseline, observe, delivery, profileProbe, sessionProbe });
}
