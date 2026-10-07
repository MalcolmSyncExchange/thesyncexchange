import { PurchaseLibrary } from "@/components/orders/purchase-workspace";
import { requireSession } from "@/services/auth/session";
import { getBuyerPurchasePage } from "@/services/buyer/purchases";
export const dynamic = "force-dynamic";
export default async function BuyerOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{
    cursor?: string;
    query?: string;
    filter?: string;
    size?: string;
  }>;
}) {
  await requireSession("buyer");
  return (
    <PurchaseLibrary data={await getBuyerPurchasePage(await searchParams)} />
  );
}
