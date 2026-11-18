import { handleAssetDownload } from "@/services/delivery/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ orderId: string; entitlementId: string }> }) {
  const { orderId, entitlementId } = await context.params;
  return handleAssetDownload(request, orderId, entitlementId);
}
// Explicit handlers keep prefetch/HEAD outside auth, Storage and audit I/O.
export const GET = () => new Response(null, { status: 405, headers: { Allow: "POST", "Cache-Control": "private, no-store" } });
export const HEAD = GET;
