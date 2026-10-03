import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

export const orderId = '11111111-1111-4111-8111-111111111111';
export function agreementHarness(options = {}) {
  const state = { audits: [], licenseWrites: 0, privilegedClients: 0, signedUrls: 0, storageReads: 0 };
  const buyer = options.user === undefined ? { id: 'owner' } : options.user;
  const order = { id: orderId, buyer_user_id: 'owner', status: options.status || 'fulfilled', agreement_url: '/agreement', agreement_generated_at: '2026-01-01', agreement_generation_error: null };
  const license = { status: 'generated', generated_at: '2026-01-01', pdf_storage_path: 'private/fixture.pdf', agreement_number: 'TEST-AGREEMENT', pdf_content_type: 'application/pdf', ...options.license };
  const client = { auth: { getUser: async () => ({ data: { user: buyer } }) }, from() {
    const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: options.missingOrder ? null : order, error: null }) };
    return q;
  } };
  const modules = {
    'next/server': { NextResponse: { json: (body, init) => Response.json(body, init), redirect: url => new Response(null, {status:307,headers:{Location:url}}) } },
    '@/lib/demo-data': { orders: [], tracks: [], demoUsers: [], licenseTypes: [] },
    '@/lib/env': { env: { demoMode: false }, hasSupabaseEnv: true },
    '@/lib/license': {}, '@/lib/utils': {},
    '@/services/agreements/server': {
      createAgreementSignedUrl: async () => { state.signedUrls++; if (options.signingFails) throw new Error('private diagnostic'); return options.signedUrl || 'https://storage.example/fixture.pdf'; },
      downloadAgreementArtifact: async () => { state.storageReads++; if (options.storageFails) throw new Error('private diagnostic'); return new Blob(['fixture agreement']); }
    },
    '@/services/auth/user-profiles': { selectUserProfileCompat: async () => ({ data: { role: options.role || 'buyer' }, error: options.roleError ? {} : null }) },
    '@/services/generated-licenses/server': { loadGeneratedLicenseByOrderId: async () => options.missingLicense ? null : license, markGeneratedLicenseDownloaded: async () => { state.licenseWrites++; } },
    '@/services/orders/activity': { appendOrderActivityLog: async (_db, event) => { if(options.auditFails) throw new Error('audit unavailable'); state.audits.push(event); } },
    '@/services/supabase/admin': { createAdminSupabaseClient: () => { state.privilegedClients++; return client; } },
    '@/services/supabase/schema-compat': { isMissingColumnError: () => false, warnSchemaFallbackOnce() {} },
    '@/services/supabase/server': { createServerSupabaseClient: async () => client }
  };
  const file = options.source || new URL('../../services/agreements/access.ts', import.meta.url);
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022} }).outputText;
  const loaded = {exports:{}};
  vm.runInNewContext(source, {module:loaded,exports:loaded.exports,Request,Response,URL,Blob,require(name){if(!(name in modules))throw new Error('Unexpected import '+name);return modules[name];}});
  const request = async (method = 'GET', headers = {}) => {
    const req = new Request(`${options.origin || 'https://app.example'}/api/orders/${orderId}/agreement${method === 'POST' ? '/download' : ''}`, {method,headers});
    return loaded.exports.handleAgreementAccess
      ? loaded.exports.handleAgreementAccess(req, orderId, method === 'POST')
      : loaded.exports.GET(req, {params:Promise.resolve({orderId})});
  };
  return {state,request};
}
