import { getAnalyticsActor } from "@/services/analytics/actor";
import { analyticsConfig, deliverEvent } from "@/services/analytics/server";
import { runAnalyticsDeliveryBatch } from "@/services/analytics/worker";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function admin() { return (await getAnalyticsActor())?.role === "admin"; }
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  if (!await admin()) return new Response(null, { status: 403 });
  const config = analyticsConfig();
  const db = createAdminSupabaseClient();
  if (!config || !db) return new Response(null, { status: 503 });
  try {
    const [health, attention] = await Promise.all([
      db.rpc("get_analytics_delivery_health", { p_environment: config.environment }),
      db.from("analytics_outbox").select("id,event,delivery_status,attempt_count,delivery_cycle,failure_category,last_attempt_at,next_retry_at")
        .eq("environment", config.environment).in("delivery_status", ["held", "exhausted"])
        .order("occurred_at", { ascending: true }).limit(50)
    ]);
    if (health.error || attention.error) return new Response(null, { status: 503 });
    return Response.json({ health: health.data, attention: attention.data }, { headers: noStore });
  } catch { return new Response(null, { status: 503 }); }
}

export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
  if (!await admin()) return new Response(null, { status: 403 });
  const config = analyticsConfig();
  const db = createAdminSupabaseClient();
  if (!config || !db) return new Response(null, { status: 503 });
  let input: unknown;
  try { input = await request.json(); } catch { return new Response(null, { status: 400 }); }
  if (!input || typeof input !== "object") return new Response(null, { status: 400 });
  const { action, id } = input as { action?: unknown; id?: unknown };
  if (action === "run_due" && id === undefined) {
    try { return Response.json(await runAnalyticsDeliveryBatch(), { headers: noStore }); }
    catch { return new Response(null, { status: 503 }); }
  }
  if (typeof id !== "string" || !uuid.test(id)) return new Response(null, { status: 400 });
  if (action !== "hold" && action !== "release" && action !== "retry") return new Response(null, { status: 400 });
  if (action === "retry") {
    try { return Response.json({ accepted: await deliverEvent(id) }, { headers: noStore }); }
    catch { return new Response(null, { status: 503 }); }
  }
  try {
    const { data, error } = await db.rpc(action === "hold" ? "hold_analytics_event" : "release_analytics_event",
      { p_environment: config.environment, p_id: id });
    if (error) return new Response(null, { status: 503 });
    return Response.json({ changed: data }, { headers: noStore });
  } catch { return new Response(null, { status: 503 }); }
}
