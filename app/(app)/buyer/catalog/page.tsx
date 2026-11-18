import surface from "@/components/layout/sync-surface.module.css";
import {BuyerCatalogBrowser} from "@/components/catalog/buyer-catalog-browser";
import {requireSession} from "@/services/auth/session";
import {getBuyerOnboardingState} from "@/services/auth/onboarding";
import {getMarketplacePage,getMarketplaceFacets} from "@/services/buyer/marketplace";
import {env} from "@/lib/env";
import type {MarketplaceParams} from "@/lib/buyer-marketplace";
export default async function BuyerCatalogPage({searchParams}:{searchParams?:Promise<MarketplaceParams>}){const user=await requireSession("buyer"),params=await searchParams||{};const [data,facets,onboarding]=await Promise.all([getMarketplacePage(user.id,params),getMarketplaceFacets(user.id),getBuyerOnboardingState(user)]);return <div className="space-y-6"><header><p className={surface.eyebrow}>Music discovery</p><h1 className={surface.heading}>Find your next sound.</h1><p className={surface.description}>Listen, explore and save music for your next project.</p></header>{env.demoMode?<p role="status">Noncommercial demonstration catalog. No commercial rights or approved prices are represented.</p>:null}<BuyerCatalogBrowser demo={env.demoMode} data={data} facets={facets} params={params} interests={{genres:onboarding.values.genres,moods:onboarding.values.moods}}/></div>;}
