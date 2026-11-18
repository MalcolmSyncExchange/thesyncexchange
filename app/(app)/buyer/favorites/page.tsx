import {env} from "@/lib/env";
import surface from "@/components/layout/sync-surface.module.css";
import {BuyerCatalogBrowser} from "@/components/catalog/buyer-catalog-browser";
import {requireSession} from "@/services/auth/session";
import {getMarketplacePage,getMarketplaceFacets} from "@/services/buyer/marketplace";
import type {MarketplaceParams} from "@/lib/buyer-marketplace";
export default async function FavoritesPage({searchParams}:{searchParams?:Promise<MarketplaceParams>}){const user=await requireSession("buyer"),params={...await searchParams,savedOnly:"true"};const [data,facets]=await Promise.all([getMarketplacePage(user.id,params),getMarketplaceFacets(user.id)]);return <div className="space-y-6"><header><p className={surface.eyebrow}>Your shortlist</p><h1 className={surface.heading}>Keep the good ones close.</h1><p className={surface.description}>Saved music that is currently eligible. Unavailable tracks stay saved privately and return only when cleared again.</p></header><BuyerCatalogBrowser demo={env.demoMode} data={data} facets={facets} params={params} basePath="/buyer/favorites"/></div>;}
