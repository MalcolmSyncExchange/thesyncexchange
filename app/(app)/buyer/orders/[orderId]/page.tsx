import { notFound } from "next/navigation";
import { PurchaseDetail } from "@/components/orders/purchase-workspace";
import { requireSession } from "@/services/auth/session";
import { getBuyerPurchase } from "@/services/buyer/purchases";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { readBuyerAssets, type BuyerAsset } from "@/services/delivery/server";
import { shouldUseDemoData } from "@/lib/env";
export const dynamic = "force-dynamic";
export default async function BuyerPurchasePage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  await requireSession("buyer");
  const purchase = await getBuyerPurchase((await params).orderId);
  if (!purchase) notFound();
  let assets: BuyerAsset[] = [];
  let assetsUnavailable = false;
  if (!shouldUseDemoData()) {
    try { assets = await readBuyerAssets(await createServerSupabaseClient(), purchase.id); }
    catch { assetsUnavailable = true; }
  }
  return <PurchaseDetail purchase={purchase} assets={assets} assetsUnavailable={assetsUnavailable} />;
}
