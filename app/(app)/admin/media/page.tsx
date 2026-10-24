import { requireSession } from "@/services/auth/session";
import { UploadWorkbench } from "@/components/artist/uploads/upload-workbench";
export default async function AdminMedia({searchParams}:{searchParams:Promise<{draft?:string}>}){await requireSession('admin');const params=await searchParams;return params.draft?<UploadWorkbench draft={params.draft} admin/>:<p>Select an exact media submission from the track review page.</p>;}
