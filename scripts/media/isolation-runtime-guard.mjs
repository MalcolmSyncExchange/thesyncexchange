// Names only. Never accept an environment object or read/log its values.
// Exact names, not provider prefixes. Documentation is evidence of meaning,
// not evidence that a name was present in the stopped hosted invocation.
const runtime = [
  '_HANDLER', 'AWS_DEFAULT_REGION', 'AWS_REGION', 'AWS_EXECUTION_ENV',
  'AWS_LAMBDA_FUNCTION_NAME', 'AWS_LAMBDA_FUNCTION_MEMORY_SIZE',
  'AWS_LAMBDA_FUNCTION_VERSION', 'AWS_LAMBDA_INITIALIZATION_TYPE',
  'AWS_LAMBDA_LOG_GROUP_NAME', 'AWS_LAMBDA_LOG_STREAM_NAME',
  'LAMBDA_TASK_ROOT', 'LAMBDA_RUNTIME_DIR',
];
const harmless = ['LANG', 'PATH', 'TZ', 'URL', 'SITE_NAME', 'SITE_ID'];
const sensitive = [
  'NODE_OPTIONS', 'NODE_PATH', 'LD_PRELOAD', 'LD_LIBRARY_PATH', 'PYTHONPATH',
  'GEM_PATH', 'AWS_LAMBDA_RUNTIME_API', 'AWS_LAMBDA_METADATA_API',
  '_X_AMZN_TRACE_ID', 'AWS_XRAY_DAEMON_ADDRESS',
  'OPENAI_BASE_URL', 'ANTHROPIC_BASE_URL', 'GOOGLE_GEMINI_BASE_URL',
  'GOOGLE_VERTEX_BASE_URL', 'OPENROUTER_BASE_URL', 'TYPESAFE_BASE_URL',
  'NETLIFY_AI_GATEWAY_URL',
];
const reviewed = new Map([
  ...runtime.map(name => [name, 'Required runtime metadata']),
  ...harmless.map(name => [name, 'Harmless platform configuration']),
  ...sensitive.map(name => [name, 'Potential credential or sensitive configuration']),
]);
const credentialLike = /KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|PRIVATE|CERT|DATABASE|CONNECTION|SERVICE_ROLE/i;
const invalid = () => ({pass:false, state:'STOP_INVALID_METADATA'});

export function classifyRuntimeNames(names) {
  try {
    if (!Array.isArray(names) || names.length > 256) return invalid();
    const unique = new Set(), classifications = [];
    for (let index = 0; index < names.length; index++) {
      const name = names[index];
      // Refuse malformed names without echoing them. Bound the diagnostic too.
      if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(name) || unique.has(name)) return invalid();
      unique.add(name);
      const category = credentialLike.test(name)
        ? 'Potential credential or sensitive configuration'
        : reviewed.get(name) || 'Unknown';
      classifications.push({name, category, allowed: category === 'Required runtime metadata' || category === 'Harmless platform configuration'});
    }
    classifications.sort((a,b) => a.name.localeCompare(b.name, 'en'));
    const unexpectedCount = classifications.filter(item => !item.allowed).length;
    return {pass:unexpectedCount === 0, state:unexpectedCount ? 'STOP_UNEXPECTED_ENVIRONMENT_KEYS' : 'KEY_NAMES_ALLOWLIST_PASS', unexpectedCount, classifications};
  } catch { return invalid(); }
}

// Media responses expose counts only; the separate diagnostic can return names
// in a protected response. Neither function emits environment names to logs.
export function inspectRuntimeNames(names) {
  const {classifications: _classifications, ...summary} = classifyRuntimeNames(names);
  return summary;
}
