import { getAnalyticsActor } from "@/services/analytics/actor";
import { deliverEvent } from "@/services/analytics/server";
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  const user = await getAnalyticsActor();
  if (!user || user.role !== "admin") return new Response(null, { status: 403 });
  let delivered = 0;
  try { while (delivered < 10 && await deliverEvent()) delivered++; } catch { /* fixed response only */ }
  return Response.json({ delivered }, { headers: { "Cache-Control": "no-store" } });
}
