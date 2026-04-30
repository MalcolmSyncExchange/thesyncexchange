import { NextResponse } from "next/server";

import { demoUsers, licenseTypes, orders, tracks } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { renderLicenseAgreementHtml } from "@/lib/license";
import { formatDateTime } from "@/lib/utils";
import { createAgreementSignedUrl, downloadAgreementArtifact } from "@/services/agreements/server";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { loadGeneratedLicenseByOrderId, markGeneratedLicenseDownloaded } from "@/services/generated-licenses/server";
import { appendOrderActivityLog } from "@/services/orders/activity";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { isMissingColumnError, warnSchemaFallbackOnce } from "@/services/supabase/schema-compat";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { Database } from "@/types/database";

export async function GET(_request: Request, { params }: { params: { orderId: string } }) {
  if (!hasSupabaseEnv || env.demoMode) {
    const order = orders.find((item) => item.id === params.orderId);
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    const track = tracks.find((item) => item.id === order.track_id);
    const license = licenseTypes.find((item) => item.id === order.license_type_id);
    const buyer = demoUsers.find((item) => item.id === order.buyer_user_id);

    const html = renderLicenseAgreementHtml({
      orderId: order.id,
      createdAt: formatDateTime(order.created_at),
      trackTitle: track?.title || "Selected Track",
      artistName: track?.artist_name || "The Sync Exchange Artist",
      licenseName: license?.name || "License",
      amountPaid: order.amount_paid,
      currency: order.currency,
      buyerName: buyer?.full_name || "Buyer",
      buyerEmail: buyer?.email || "buyer@example.com",
      rightsHolders: track?.rights_holders.map((holder) => ({
        name: holder.name,
        roleType: holder.role_type,
        ownershipPercent: holder.ownership_percent
      })) || []
    });

    return new Response(html, {
      headers: agreementHeaders(params.orderId)
    });
  }

  const authSupabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await authSupabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role key is missing." }, { status: 500 });
  }

  const { data: viewerProfile } = (await selectUserProfileCompat(supabase, user.id)) as {
    data: Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "role"> | null;
  };
  const role = String(viewerProfile?.role || user.user_metadata?.role || "");

  const order = await loadAgreementOrderCompat(supabase, params.orderId);
  const generatedLicense = await loadGeneratedLicenseByOrderId(supabase, params.orderId);

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (role !== "admin" && order.buyer_user_id !== user.id) {
    await logAgreementAccessEvent(supabase, {
      orderId: order.id,
      actorId: user.id,
      eventType: "agreement_download_forbidden",
      message: "A non-owner attempted to access a private agreement artifact."
    });
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const effectiveAgreementPath = generatedLicense?.pdf_storage_path || null;
  const effectiveContentType = generatedLicense?.pdf_content_type || "application/pdf";
  const effectiveGeneratedAt = generatedLicense?.generated_at || null;
  const effectiveGenerationError = generatedLicense?.generation_error || order.agreement_generation_error;
  const effectiveAgreementNumber = generatedLicense?.agreement_number || null;

  if (!generatedLicense && (order.agreement_generated_at || order.agreement_path || order.agreement_url)) {
    await logAgreementAccessEvent(supabase, {
      orderId: order.id,
      actorId: user.id,
      eventType: "agreement_download_blocked",
      message: "Agreement delivery was requested while generated_licenses was unavailable for this order.",
      metadata: {
        migration: "0013"
      }
    });
    return NextResponse.json(
      {
        error:
          "The generated license record for this paid order is still missing. Apply migration 0013, rerun agreement generation, and then retry the download."
      },
      { status: 409 }
    );
  }

  if (!order.agreement_url && !effectiveAgreementPath && order.status === "pending") {
    await logAgreementAccessEvent(supabase, {
      orderId: order.id,
      actorId: user.id,
      eventType: "agreement_download_blocked",
      message: "Agreement download was requested before payment completed."
    });
    return NextResponse.json({ error: "Agreement artifact is not ready until payment has completed." }, { status: 409 });
  }

  if (effectiveGenerationError || generatedLicense?.status === "failed") {
    await logAgreementAccessEvent(supabase, {
      orderId: order.id,
      actorId: user.id,
      eventType: "agreement_download_blocked",
      message: `Agreement download was requested while generation errors remained: ${effectiveGenerationError || "Generated license status is failed."}`,
      metadata: {
        agreementNumber: effectiveAgreementNumber
      }
    });
    return NextResponse.json(
      {
        error: `Agreement generation still needs attention: ${effectiveGenerationError || "The generated license record is marked as failed."}`
      },
      { status: 409 }
    );
  }

  try {
    if (!effectiveGeneratedAt) {
      await logAgreementAccessEvent(supabase, {
        orderId: order.id,
        actorId: user.id,
        eventType: "agreement_download_blocked",
        message: "Agreement download was requested before artifact generation completed.",
        metadata: {
          agreementNumber: effectiveAgreementNumber
        }
      });
      return NextResponse.json(
        {
          error: "Agreement artifact is not ready yet. Please try again shortly or contact support if this persists."
        },
        { status: 409 }
      );
    }

    if (!effectiveAgreementPath) {
      await logAgreementAccessEvent(supabase, {
        orderId: order.id,
        actorId: user.id,
        eventType: "agreement_download_blocked",
        message: "Agreement generation completed, but secure delivery metadata is still unavailable.",
        metadata: {
          agreementNumber: effectiveAgreementNumber
        }
      });
      return NextResponse.json(
        {
          error:
            "Agreement delivery is still running in compatibility mode because the structured generated license record or private artifact path is missing. Apply migration 0013 and regenerate the agreement, then retry."
        },
        { status: 409 }
      );
    }

    const agreementPath = effectiveAgreementPath;
    const contentType = effectiveContentType;
    const signedUrl = await createAgreementSignedUrl(agreementPath, 60).catch(() => null);
    if (signedUrl) {
      await markGeneratedLicenseDownloaded(supabase, order.id).catch(() => undefined);
      await logAgreementAccessEvent(supabase, {
        orderId: order.id,
        actorId: user.id,
        eventType: "agreement_download_authorized",
        message: "Agreement delivery succeeded through a short-lived signed URL.",
        metadata: {
          agreementNumber: effectiveAgreementNumber
        }
      });
      const response = NextResponse.redirect(signedUrl);
      response.headers.set("cache-control", "private, no-store, max-age=0");
      return response;
    }

    const file = await downloadAgreementArtifact(agreementPath);
    await markGeneratedLicenseDownloaded(supabase, order.id).catch(() => undefined);
    await logAgreementAccessEvent(supabase, {
      orderId: order.id,
      actorId: user.id,
      eventType: "agreement_download_authorized",
      message: "Agreement artifact was streamed directly after signed URL creation was unavailable.",
      metadata: {
        agreementNumber: effectiveAgreementNumber
      }
    });
    return new Response(file, {
      headers: agreementHeaders(order.id, contentType)
    });
  } catch (error) {
    await logAgreementAccessEvent(supabase, {
      orderId: order.id,
      actorId: user.id,
      eventType: "agreement_download_failed",
      message: error instanceof Error ? error.message : "Unable to load agreement artifact.",
      metadata: {
        agreementNumber: effectiveAgreementNumber
      }
    });

    if (!effectiveAgreementPath) {
      return NextResponse.json(
        {
          error:
            "Agreement metadata is still running in compatibility mode and the private artifact could not be resolved safely. Apply migration 0013 and regenerate the agreement, then retry."
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: effectiveGenerationError || (error instanceof Error ? error.message : "Unable to load agreement artifact.")
      },
      { status: 500 }
    );
  }
}

function agreementHeaders(orderId: string, contentType = "application/pdf") {
  const extension = contentType.includes("pdf") ? "pdf" : "html";

  return {
    "content-type": contentType,
    "content-disposition": `inline; filename=\"sync-exchange-license-${orderId}.${extension}\"`,
    "cache-control": "private, max-age=0, must-revalidate"
  };
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

async function logAgreementAccessEvent(
  supabase: NonNullable<ReturnType<typeof createAdminSupabaseClient>>,
  {
    orderId,
    actorId,
    eventType,
    message,
    metadata
  }: {
    orderId: string;
    actorId?: string | null;
    eventType: string;
    message: string;
    metadata?: Record<string, unknown>;
  }
) {
  await appendOrderActivityLog(supabase, {
    orderId,
    actorId: actorId || null,
    source: "system",
    eventType,
    message,
    metadata
  }).catch(() => undefined);
}
