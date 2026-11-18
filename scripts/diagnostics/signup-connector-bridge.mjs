import { STAGING_PROJECT, POSTHOG_PROJECT } from './artist-signup-observers.mjs';

function firstText(result) {
  if (result?.isError) throw Error('Observer unavailable');
  const text = result?.content?.find(c => c.type === 'text')?.text;
  if (typeof text !== 'string') throw Error('Observer unavailable');
  return text;
}
function supabaseRows(result) {
  const outer = JSON.parse(firstText(result));
  if (typeof outer.result !== 'string') throw Error('Observer unavailable');
  const match = outer.result.match(/<untrusted-data-([a-f0-9-]+)>\s*([\s\S]*?)\s*<\/untrusted-data-\1>/);
  const rows = match && JSON.parse(match[2]);
  if (!Array.isArray(rows)) throw Error('Observer unavailable');
  return rows;
}
function posthogRows(result) {
  const lines = firstText(result).split('\n');
  const header = lines.findIndex(line => line === 'uuid|records|scoped_records');
  if (header < 0) throw Error('Observer unavailable');
  return lines.slice(header + 1).filter(line => line.trim()).map(line => {
    const fields = line.split('|');
    if (fields.length !== 3) throw Error('Observer unavailable');
    return { uuid: fields[0], records: fields[1], scoped_records: fields[2] };
  });
}

/** Bind existing authenticated read tools; no key loader, capture, mutation, or login. */
export function createReadOnlyConnectorTransports({ supabaseGetProject, supabaseExecuteSql, posthogExec, browserSession }) {
  const posthog = command => posthogExec({ command, context: 'Read-only staging signup observer; no capture or mutation.', llm_model: 'gpt-6' });
  return Object.freeze({
    async supabaseIdentity() {
      const data = JSON.parse(firstText(await supabaseGetProject({ id: STAGING_PROJECT })));
      return { id: data.id };
    },
    async posthogIdentity() {
      const text = firstText(await posthog('call project-get {}'));
      const match = text.match(/^id:\s*(\d+)\s*$/m);
      if (!match) throw Error('Observer unavailable');
      return { id: Number(match[1]) };
    },
    async supabaseQuery({ projectId, query, signal }) {
      if (signal?.aborted || projectId !== STAGING_PROJECT || !query.startsWith('SELECT') || query.includes(';')) throw Error('Observer unavailable');
      const rows = supabaseRows(await supabaseExecuteSql({ project_id: STAGING_PROJECT, query }));
      return { projectId: STAGING_PROJECT, rows };
    },
    async posthogQuery({ projectId, query, signal }) {
      if (signal?.aborted || projectId !== POSTHOG_PROJECT || !query.startsWith('SELECT') || query.includes(';')) throw Error('Observer unavailable');
      const rows = posthogRows(await posthog('call execute-sql ' + JSON.stringify({ query, context: 'One-run record inspection and duplicate detection, not a governed business metric.' })));
      return { projectId: POSTHOG_PROJECT, rows };
    },
    browserSession
  });
}
