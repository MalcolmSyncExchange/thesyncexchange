import { getAnalyticsActor } from "@/services/analytics/actor";
import { analyticsConfig, captureEvent } from "@/services/analytics/server";
import { browserEventAllowed, filterProperties } from "@/lib/analytics/schema";

export async function POST(request: Request) {
  if (!analyticsConfig()) return new Response(null, { status: 204 });
  if (request.headers.get("origin") !== new URL(request.url).origin || !request.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 403 });
  const user = await getAnalyticsActor();
  if (!user) return new Response(null, { status: 401 });
  // Enforce the byte limit even when Content-Length is missing or false.
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400 });
  let body = ""; let bytes = 0; const decoder = new TextDecoder();
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length;
      if (bytes > 2048) { await reader.cancel(); return new Response(null, { status: 413 }); }
      body += decoder.decode(value, { stream: true }); }
    body += decoder.decode();
    const input = JSON.parse(body);
    if (input.expectedUserId !== user.id) return new Response(null, { status: 409 });
    const role = user.role || "unassigned";
    if (!browserEventAllowed(input.event, role, input.properties)) return new Response(null, { status: 400 });
    const properties = filterProperties(input.event, input.properties);
    if (!properties) return new Response(null, { status: 400 });
    await captureEvent({ id: user.id, role }, input.event, properties,
      input.event === "onboarding_started" ? `onboarding_started:${user.id}` : undefined);
    return new Response(null, { status: 204 });
  } catch { return new Response(null, { status: 400 }); }
}
