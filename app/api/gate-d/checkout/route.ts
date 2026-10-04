import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import {
  bindGateDCheckout,
  createGateDStripeCheckout,
  GATE_D_CSRF_COOKIE,
  GATE_D_QA_BUYER_ID,
  prepareGateDCheckout,
  recordGateDCheckoutFailure,
  recoverBoundGateDCheckout,
  reserveGateDAcceptance,
  safeEqual
} from "@/services/gate-d/server";
import { createServerSupabaseClient } from "@/services/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

export async function GET() {
  const auth = await exactQaBuyer();
  if (!auth) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });
  const nonce = randomBytes(32).toString("base64url");
  const response = NextResponse.json({ csrfToken: nonce }, { headers: NO_STORE });
  setCsrfCookie(response,nonce);
  return response;
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "Unsupported request." }, { status: 415, headers: NO_STORE });
  }
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return NextResponse.json({ error: "Unsupported request." }, { status: 413, headers: NO_STORE });
  }
  const expectedOrigin = new URL(env.appUrl).origin;
  if (request.headers.get("origin") !== expectedOrigin || request.headers.get("sec-fetch-site") !== "same-origin") {
    return NextResponse.json({ error: "Request origin denied." }, { status: 403, headers: NO_STORE });
  }

  let parsed: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > 4096) {
      return NextResponse.json({ error: "Unsupported request." }, { status: 413, headers: NO_STORE });
    }
    parsed = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }
  const body = parsed as { orderId?: unknown; csrfToken?: unknown };
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  const submittedNonce = typeof body.csrfToken === "string" ? body.csrfToken : "";
  const cookieStore = await cookies();
  const cookieNonce = cookieStore.get(GATE_D_CSRF_COOKIE)?.value || "";
  if (!UUID.test(orderId) || !submittedNonce || !cookieNonce || !safeEqual(submittedNonce,cookieNonce)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE });
  }

  const auth = await exactQaBuyer();
  if (!auth) return NextResponse.json({ error: "Not found." }, { status: 404, headers: NO_STORE });

  let reservation;
  try {
    reservation = await reserveGateDAcceptance(auth.client,orderId);
  } catch {
    return rotatedResponse({ error: "Acceptance checkout is unavailable." },503);
  }
  if (!reservation.grant_id || !reservation.attempt_id || reservation.result_code === "unavailable") {
    return rotatedResponse({ error: "Acceptance checkout is unavailable." },404);
  }

  if (reservation.result_code === "checkout_bound") {
    try {
      const recovered = await recoverBoundGateDCheckout(reservation);
      return rotatedResponse({ url: recovered.url,orderId,sessionId: recovered.id },200);
    } catch {
      return rotatedResponse({ error: "Acceptance checkout recovery requires review." },503);
    }
  }
  if (["checkout_creation_in_progress","acceptance_in_progress"].includes(reservation.result_code)) {
    return rotatedResponse({ error: "Acceptance checkout is already processing." },409);
  }

  let prepared;
  try {
    prepared = await prepareGateDCheckout(reservation);
  } catch {
    return rotatedResponse({ error: "Acceptance checkout preparation failed." },503);
  }

  let session;
  try {
    session = await createGateDStripeCheckout(prepared);
  } catch {
    await recordGateDCheckoutFailure(prepared,"provider_timeout",false).catch(() => undefined);
    return rotatedResponse({ error: "Acceptance checkout provider request is awaiting safe retry." },503);
  }

  try {
    await bindGateDCheckout(prepared,session);
  } catch {
    await recordGateDCheckoutFailure(prepared,"database_binding_failed",false).catch(() => undefined);
    return rotatedResponse({ error: "Acceptance checkout binding is awaiting safe retry." },503);
  }

  return rotatedResponse({ url: session.url,orderId,sessionId: session.id },200);
}

async function exactQaBuyer() {
  const client = await createServerSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || user?.id !== GATE_D_QA_BUYER_ID) return null;
  const profile = await client.from("user_profiles").select("role").eq("id",user.id).maybeSingle();
  if (profile.error || profile.data?.role !== "buyer") return null;
  return { client,user };
}

function rotatedResponse(body: Record<string, unknown>,status: number) {
  const nonce = randomBytes(32).toString("base64url");
  const response = NextResponse.json({ ...body,csrfToken: nonce }, { status,headers: NO_STORE });
  setCsrfCookie(response,nonce);
  return response;
}

function setCsrfCookie(response: NextResponse,nonce: string) {
  response.cookies.set(GATE_D_CSRF_COOKIE,nonce,{
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60
  });
}
