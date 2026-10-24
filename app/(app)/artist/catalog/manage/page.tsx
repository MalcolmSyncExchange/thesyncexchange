import {requireSession} from '@/services/auth/session';
import {CatalogWorkbench} from '@/components/artist/catalog/catalog-workbench';
export default async function ArtistCatalogManagement({searchParams}:{searchParams:Promise<{track?:string}>}){await requireSession('artist');return <CatalogWorkbench track={(await searchParams).track}/>;}
