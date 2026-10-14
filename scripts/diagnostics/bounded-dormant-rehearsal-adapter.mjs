import { runBoundedAuthReadinessDiagnostics } from './bounded-auth-readiness-harness.mjs';

// Rehearsal-only adapter: the harness owns the response through JSON validation
// and only then aborts/cleans up. No clones, post-cleanup parsing or status rewrites.
// No credentials, hosted entrypoint, grant arming or event execution.
export function runDormantReadinessRehearsal(options){
 return runBoundedAuthReadinessDiagnostics({...options,readinessExpectation:'dormant'});
}
