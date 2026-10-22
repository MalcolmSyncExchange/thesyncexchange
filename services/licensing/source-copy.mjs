import {verifyArtifact} from '../delivery/transfer.mjs';
// Called explicitly in a reviewed server/worker runtime. No destination supplied
// by the caller; no overwrite or deletion even after uncertain upload responses.
export async function copyApprovedMaster(assetId,reference,dependencies) {
 if(typeof reference!=='string'||reference.length<5||reference.length>500)throw Error('Source review reference required.');
 const c=await dependencies.prepare(assetId);
 if(c.assetVersionId!==assetId || c.destination?.bucket!=='purchase-assets' || c.destination.path!==`${assetId}/master` || !['submission-source','track-audio'].includes(c.source?.bucket))throw Error('Invalid approved source copy.');
 const bytes=verifyArtifact(await dependencies.read({...c.source,byteSize:c.byteSize}),c);
 try {await dependencies.upload(c.destination,bytes,c.mimeType);}catch {/* A lost response may have stored the exact object. Read it before retrying. */}
 verifyArtifact(await dependencies.read({...c.destination,byteSize:c.byteSize}),c);
 if(!await dependencies.seal(assetId,c.sha256,c.byteSize,c.mimeType,reference))throw Error('Approved source copy was not sealed.');
 return {assetVersionId:assetId,sha256:c.sha256,byteSize:c.byteSize};
}
