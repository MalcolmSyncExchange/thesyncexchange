// LOCAL PREPARATION ONLY. No media, credentials, filesystem or network access.
// Independent Netlify team protection must be verified before any invocation.
import {classifyRuntimeNames} from './isolation-runtime-guard.mjs';
let attempted = false;
export default async function diagnostic(request, context) {
  const headers = {'cache-control':'private, no-store', 'x-content-type-options':'nosniff'};
  if (context?.site?.id !== 'c91c881b-15ec-4342-82c1-381bc3cec86a' || context?.deploy?.published !== false || context?.deploy?.context !== 'deploy-preview') return new Response(null, {status:404, headers});
  if (request.method !== 'POST') return new Response(null, {status:405, headers});
  if (attempted) return new Response(null, {status:409, headers});
  attempted = true;
  try {
    const inventory = classifyRuntimeNames(Object.keys(process.env));
    return Response.json({state:'STOP_DIAGNOSTIC_ONLY', qualified:false, inventory}, {status:409, headers});
  } catch {
    return Response.json({state:'STOP_INVALID_METADATA', qualified:false}, {status:409, headers});
  }
}
export const config = {path:'/_qualification/environment-names', method:'POST'};
