import {requireSession} from '@/services/auth/session';
import {CatalogWorkbench} from '@/components/artist/catalog/catalog-workbench';
export default async function AdminCatalogManagement({searchParams}:{searchParams:Promise<{track?:string}>}){await requireSession('admin');return <CatalogWorkbench track={(await searchParams).track} admin/>;}
