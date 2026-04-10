import { NextResponse } from "next/server";

import { demoUsers, licenseTypes, orders, tracks } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { renderLicenseAgreementHtml } from "@/lib/license";
import { formatDateTime } from "@/lib/utils";
import { downloadAgreementArtifact, generateAgreementArtifactForOrder } from "@/services/agreements/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";

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

  const role = String(user.user_metadata?.role || "");
  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase service role key is missing." }, { status: 500 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id, buyer_user_id, order_status, agreement_url")
    .eq("id", params.orderId)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "Order not found." }, { status: 404 });
  }

  if (role !== "admin" && order.buyer_user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (!order.agreement_url && order.order_status === "pending") {
    return NextResponse.json({ error: "Agreement artifact is not ready until payment has completed." }, { status: 409 });
  }

  try {
    if (!order.agreement_url || order.order_status === "paid") {
      await generateAgreementArtifactForOrder(order.id);
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
