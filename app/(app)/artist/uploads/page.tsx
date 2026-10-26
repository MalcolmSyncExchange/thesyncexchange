import { SubmissionWorkspace } from "@/components/artist/uploads/submission-workspace";
import { requireSession } from "@/services/auth/session";
export default async function ArtistSubmission({searchParams}:{searchParams:Promise<{draft?:string;track?:string}>}){
 const user=await requireSession('artist');const params=await searchParams;
 return <SubmissionWorkspace actorId={user.id} draft={params.draft} track={params.track}/>;
}
