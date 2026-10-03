import { NextResponse } from "next/server";

import { demoUsers, licenseTypes, orders, tracks } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { renderLicenseAgreementHtml } from "@/lib/license";
import { formatDateTime } from "@/lib/utils";
import { createAgreementSignedUrl, downloadAgreementArtifact } from "@/services/agreements/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { loadGeneratedLicenseByOrderId } from "@/services/generated-licenses/server";
import { appendOrderActivityLog } from "@/services/orders/activity";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { Database } from "@/types/database";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "Netlify-CDN-Cache-Control": "no-store" };
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: privateHeaders });

/** GET/HEAD inspect only. Delivery and its authorization audit require a deliberate POST. */
export async function handleAgreementAccess(request: Request, orderId: string, download = false) {
  if (download) {
    // Cookie authentication alone is insufficient for a mutating download authorization.
    const origin = request.headers.get("origin");
    const site = request.headers.get("sec-fetch-site");
    if (request.method !== "POST" || origin !== new URL(request.url).origin ||
        (site && site !== "same-origin" && site !== "none")) {
      return json({ error: "Forbidden." }, 403);
    }
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId) && !env.demoMode) {
    return json({ error: "Order not found." }, 404);
  }

  if (!hasSupabaseEnv || env.demoMode) {
    const order = orders.find((item) => item.id === orderId);
    if (!order) return json({ error: "Order not found." }, 404);
    if (!download) return json({ orderId, ready: true, downloadUrl: `/api/orders/${orderId}/agreement/download`, method: "POST" });
    const track = tracks.find((item) => item.id === order.track_id);
    const license = licenseTypes.find((item) => item.id === order.license_type_id);
    const buyer = demoUsers.find((item) => item.id === order.buyer_user_id);
    return new Response(renderLicenseAgreementHtml({
      orderId: order.id, createdAt: formatDateTime(order.created_at), trackTitle: track?.title || "Selected Track",
      artistName: track?.artist_name || "The Sync Exchange Artist", licenseName: license?.name || "License",
      amountPaid: order.amount_paid, currency: order.currency, buyerName: buyer?.full_name || "Buyer",
      buyerEmail: buyer?.email || "buyer@example.com",
      rightsHolders: track?.rights_holders.map((holder) => ({ name: holder.name, roleType: holder.role_type, ownershipPercent: holder.ownership_percent })) || []
    }), { headers: deliveryHeaders(orderId, "text/html; charset=utf-8") });
  }

  const authSupabase = await createServerSupabaseClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user?.id) return json({ error: "Unauthorized." }, 401);
  const { data: profile, error: roleError } = await selectUserProfileCompat(authSupabase, user.id);
  const role = profile?.role;
  if (roleError || (role !== "buyer" && role !== "admin")) return json({ error: "Forbidden." }, 403);
  const scope = await authSupabase.from("orders").select("id, buyer_user_id").eq("id", orderId).maybeSingle();
  if (scope.error || !scope.data || (role !== "admin" && scope.data.buyer_user_id !== user.id)) {
    return json({ error: "Forbidden." }, 403);
  }
  // The privileged client is acquired only after canonical role and RLS ownership checks.
  const supabase = createAdminSupabaseClient();
  if (!supabase) return json({ error: "Secure delivery is unavailable." }, 503);
  const order = await loadAgreementOrderCompat(supabase, orderId);
  if (!order || (role !== "admin" && order.buyer_user_id !== user.id)) return json({ error: "Forbidden." }, 403);
  const license = await loadGeneratedLicenseByOrderId(supabase, orderId);
  if (!license || license.status !== "generated" || !license.generated_at || !license.pdf_storage_path ||
      license.generation_error || order.agreement_generation_error || !["paid", "fulfilled", "refunded"].includes(order.status)) {
    return json({ error: "Agreement artifact is not ready. Please check your order or contact support." }, 409);
  }
  if (!download) {
    return json({ orderId, ready: true, agreementNumber: license.agreement_number,
      downloadUrl: `/api/orders/${orderId}/agreement/download`, method: "POST" });
  }

  try {
    const signedUrl = await createAgreementSignedUrl(license.pdf_storage_path, 60).catch(() => null);
    const file = signedUrl ? null : await downloadAgreementArtifact(license.pdf_storage_path);
    // One event per successful explicit authorization. A fresh explicit POST is a new authorization,
    // not proof that the client received the bytes. Never update generated_licenses access timestamps.
    await appendOrderActivityLog(supabase, {
      orderId, actorId: user.id, requirePersistence: true, source: role === "admin" ? "admin" : "buyer",
      eventType: "agreement_download_authorized",
      message: "Explicit agreement download authorized. Client transfer completion is not observed.",
      metadata: { agreementNumber: license.agreement_number, method: "POST", transferCompletionObserved: false }
    });
    if (signedUrl) {
      return new Response(null, { status: 303, headers: { ...privateHeaders, Location: signedUrl } });
    }
    return new Response(file, { headers: deliveryHeaders(orderId, license.pdf_content_type || "application/pdf") });
  } catch {
    return json({ error: "Secure agreement delivery is unavailable. Please try again." }, 503);
  }
}

function deliveryHeaders(orderId: string, contentType: string) {
  return { ...privateHeaders, "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="sync-exchange-license-${orderId}.${contentType.includes("pdf") ? "pdf" : "html"}"` };
}

async function loadAgreementOrderCompat(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  orderId: string
) {
  const primary = await supabase
    .from("orders")
    .select("id, buyer_user_id, status, agreement_url, agreement_path, agreement_content_type, agreement_generated_at, agreement_generation_error")
    .eq("id", orderId)
    .maybeSingle();

  if (!primary.error) {
    return primary.data as Pick<
      Database["public"]["Tables"]["orders"]["Row"],
      "id" | "buyer_user_id" | "status" | "agreement_url" | "agreement_path" | "agreement_content_type" | "agreement_generated_at" | "agreement_generation_error"
    > | null;
  }

  if (!isMissingColumnError(primary.error, ["agreement_path", "agreement_generation_error"])) {
    throw new Error(primary.error.message);
  }

  warnSchemaFallbackOnce(
    "agreement-download-read",
    "Agreement fulfillment metadata columns are not available yet; agreement downloads are using the legacy order shape until migration 0010 is applied.",
    primary.error
  );

  const fallback = await supabase
    .from("orders")
    .select("id, buyer_user_id, status, agreement_url, agreement_generated_at")
    .eq("id", orderId)
    .maybeSingle();

  if (fallback.error) {
    throw new Error(fallback.error.message);
  }

  return fallback.data
    ? ({
        ...fallback.data,
        agreement_path: null,
        agreement_content_type: "application/pdf",
        agreement_generation_error: null
      } as Pick<
        Database["public"]["Tables"]["orders"]["Row"],
        "id" | "buyer_user_id" | "status" | "agreement_url" | "agreement_path" | "agreement_content_type" | "agreement_generated_at" | "agreement_generation_error"
      >)
    : null;
}
