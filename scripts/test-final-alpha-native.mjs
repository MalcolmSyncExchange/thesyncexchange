// Disposable local native cluster only; never accepts a hosted DSN.
process.env.TSE_NATIVE_SECURITY_SCOPE='system14';
process.env.TSE_NATIVE_INTEGRATION_SCOPE='phase15a';
await import('./test-notifications-native.mjs');
