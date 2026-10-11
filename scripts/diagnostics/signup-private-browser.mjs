import { APPROVED_ORIGIN } from './artist-signup-browser-driver.mjs';
import { STAGING_PROJECT } from './artist-signup-observers.mjs';

/** Isolated browser and GET-only session proof. No persistent profile or traces. */
export function createPrivateSignupBrowser({ anonKey, dependencies } = {}) {
  let context;
  const authOrigin = `https://${STAGING_PROJECT}.supabase.co`;
  async function load() {
    return dependencies ?? {
      chromium: (await import('@playwright/test')).chromium,
      createServerClient: (await import('@supabase/ssr')).createServerClient,
      fetch: globalThis.fetch
    };
  }
  return Object.freeze({
    async pageFactory({ timeoutMs, signal }) {
      if (signal?.aborted || context || process.env.DEBUG || process.env.PWDEBUG) throw Error('Private browser unavailable');
      const deps = await load();
      const browser = await deps.chromium.launch({ headless: true, timeout: timeoutMs,
        env: Object.fromEntries(['PATH', 'HOME', 'TMPDIR'].filter(k => process.env[k]).map(k => [k, process.env[k]])) });
      try {
        if (signal?.aborted) throw Error('Private browser unavailable');
        context = await browser.newContext({ serviceWorkers: 'block' });
        const page = await context.newPage();
        return { page, close: async () => { context = null; await browser.close(); } };
      } catch { context = null; await browser.close(); throw Error('Private browser unavailable'); }
    },
    async browserSession({ timeoutMs = 5000, signal } = {}) {
      const unavailable = { authenticated: false };
      if (!context || !anonKey || signal?.aborted) return unavailable;
      try {
        const deps = await load();
        const cookiePrefix = `sb-${STAGING_PROJECT}-auth-token`;
        const client = deps.createServerClient(authOrigin, anonKey, {
          cookies: {
            getAll: async () => (await context.cookies(APPROVED_ORIGIN))
              .filter(c => c.name === cookiePrefix || c.name.startsWith(cookiePrefix + '.'))
              .map(c => ({ name: c.name, value: c.value })),
            setAll: () => { throw Error('Session mutation prohibited'); }
          },
          global: {
            fetch: async (input, init = {}) => {
              const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
              const method = init.method ?? (typeof input === 'object' ? input.method : undefined) ?? 'GET';
              if (url.origin !== authOrigin || url.pathname !== '/auth/v1/user' || url.search || method !== 'GET') {
                throw Error('Session mutation prohibited');
              }
              return deps.fetch(input, { ...init, method: 'GET', redirect: 'error', signal: signal ?? AbortSignal.timeout(timeoutMs) });
            }
          }
        });
        // getSession/cookie payloads are insufficient; only the Auth server verifies identity.
        const { data, error } = await client.auth.getUser();
        if (error || !data?.user?.id) return unavailable;
        return { authenticated: true, validatedBy: 'server_get_user', origin: APPROVED_ORIGIN,
          projectId: STAGING_PROJECT, userId: data.user.id };
      } catch { return unavailable; }
    }
  });
}
