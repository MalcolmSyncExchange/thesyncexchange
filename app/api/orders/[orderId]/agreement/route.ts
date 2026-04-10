import { NextResponse } from "next/server";

import { demoUsers, licenseTypes, orders, tracks } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { renderLicenseAgreementHtml } from "@/lib/license";
import { formatDateTime } from "@/lib/utils";
import { createAgreementSignedUrl, downloadAgreementArtifact, generateAgreementArtifactForOrder } from "@/services/agreements/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
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

  const { data: viewerProfile } = (await supabase.from("user_profiles").select("role").eq("id", user.id).maybeSingle()) as {
    data: Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "role"> | null;
  };
  const role = String(viewerProfile?.role || user.user_metadata?.role || "");

  const { data: order } = (await supabase
    .from("orders")
    .select("id, buyer_user_id, status, agreement_url, agreement_generated_at")
    .eq("id", params.orderId)
    .maybeSingle()) as {
    data: Pick<
      Database["public"]["Tables"]["orders"]["Row"],
      "id" | "buyer_user_id" | "status" | "agreement_url" | "agreement_generated_at"
    > | null;
  };

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (role !== "admin" && order.buyer_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!order.agreement_url && order.status === "pending") {
    return NextResponse.json({ error: "Agreement artifact is not ready until payment has completed." }, { status: 409 });
  }

  try {
    if (!order.agreement_url || !order.agreement_generated_at) {
      await generateAgreementArtifactForOrder(order.id);
    }

    const signedUrl = await createAgreementSignedUrl(order.id).catch(() => null);
    if (signedUrl) {
      return NextResponse.redirect(signedUrl);
    }

    const file = await downloadAgreementArtifact(order.id);
    return new Response(file, {
      headers: agreementHeaders(order.id)
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load agreement artifact."
      },
      { status: 500 }
    );
  }
}

function agreementHeaders(orderId: string) {
  return {
    "content-type": "text/html; charset=utf-8",
    "content-disposition": `inline; filename=\"sync-exchange-license-${orderId}.html\"`,
    "cache-control": "private, max-age=0, must-revalidate"
  };
}
