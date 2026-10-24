import { UploadWorkbench } from "@/components/artist/uploads/upload-workbench";
import { requireSession } from "@/services/auth/session";
export default async function SubmitMusicPage(){await requireSession('artist');return <UploadWorkbench/>;}
