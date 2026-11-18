// Local disposable provider-authority fixture only; no hosted target or credentials.
process.env.TSE_NATIVE_SECURITY_SCOPE='system14';
await import('./test-notifications-native.mjs');
