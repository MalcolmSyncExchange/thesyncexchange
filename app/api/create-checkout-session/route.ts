import { NextResponse } from "next/server";
import { getDeploymentTarget } from "@/lib/env";
// Retire the unowned fixed-price test charge. All purchases use the accepted,
// buyer-scoped and idempotent checkout route, including synthetic tests.
export async function POST() {
  if (getDeploymentTarget() === "production") return NextResponse.json({ error: "This test-only checkout route is unavailable in production." }, { status: 404 });
  return NextResponse.json({ error: "Use the transaction-specific buyer checkout." }, { status: 410, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
