import { requireSession } from "@/services/auth/session";
import { UploadWorkbench } from "@/components/artist/uploads/upload-workbench";
export default async function ArtistUploads({searchParams}:{searchParams:Promise<{draft?:string;track?:string}>}){await requireSession('artist');const params=await searchParams;return <UploadWorkbench draft={params.draft} track={params.track}/>;}
