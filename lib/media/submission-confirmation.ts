import type {UploadState} from './upload-contract';
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function confirmationPath(submission:string){if(!uuid(submission))throw Error('Invalid submission');return '/artist/submit/confirmation?submission='+submission;}
export function submissionReceipt(state:UploadState){if(!uuid(state.submission_id)||!uuid(state.track_id)||!uuid(state.review?.id)||!['pending','approved','rejected'].includes(state.review!.state))return null;
 const date=state.review?.submitted_at;return {submission:state.submission_id,track:state.track_id,title:state.metadata?.title||'Your track',status:state.review!.state,submittedAt:date&&Number.isFinite(Date.parse(date))?date:null,trackHref:'/artist/catalog/manage?track='+state.track_id};}
