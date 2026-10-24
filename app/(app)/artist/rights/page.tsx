import { requireSession } from "@/services/auth/session";
import { RightsWorkbench } from "@/components/artist/rights/rights-workbench";
export default async function ArtistRights({searchParams}:{searchParams:Promise<{track?:string}>}){await requireSession('artist');return <RightsWorkbench track={(await searchParams).track}/>;}
