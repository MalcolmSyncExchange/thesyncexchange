import { requireSession } from "@/services/auth/session";
import { RightsWorkbench } from "@/components/artist/rights/rights-workbench";
export default async function AdminRights({searchParams}:{searchParams:Promise<{track?:string}>}){await requireSession('admin');return <RightsWorkbench track={(await searchParams).track} admin/>;}
