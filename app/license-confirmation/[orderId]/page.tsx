import { notFound } from "next/navigation";

import { LicenseConfirmationClient } from "@/components/orders/license-confirmation-client";
import { generateAgreementPlaceholder } from "@/lib/license";
import { env } from "@/lib/env";
import { hasStripeSecretEnv } from "@/lib/server-env";
import { getOrderById } from "@/services/buyer/queries";
import { syncOrderFromStripeSessionId } from "@/services/stripe/server";

export const dynamic = "force-dynamic";

export default async function LicenseConfirmationPage({
  params,
  searchParams
}: {
  params: { orderId: string };
  searchParams?: { trackId?: string; licenseTypeId?: string; session_id?: string };
}) {
  let order = await getOrderById(params.orderId);

  if (
    order &&
    order.order_status === "pending" &&
    searchParams?.session_id &&
    hasStripeSecretEnv &&
    !env.demoMode
  ) {
    try {
      await syncOrderFromStripeSessionId(order.id, searchParams.session_id);
      order = await getOrderById(params.orderId);
    } catch {
      // If webhook or artifact generation lags, keep the current order snapshot and show the pending notice below.
    }
  }

  const agreement =
    order
      ? {
          orderId: order.id,
          trackTitle: order.track?.title || "Selected Track",
          artistName: "The Sync Exchange Artist",
          licenseName: order.license_type?.name || "License",
          agreementUrl: order.agreement_url || "",
          summary: [
            `License: ${order.license_type?.name || "Pending selection"}`,
            `Status: ${order.order_status}`,
            ...(order.agreement_number ? [`Agreement Number: ${order.agreement_number}`] : []),
            `Agreement URL: ${order.agreement_url || "Pending"}`
          ]
        }
      : searchParams?.trackId && searchParams?.licenseTypeId
        ? generateAgreementPlaceholder(params.orderId, searchParams.trackId, searchParams.licenseTypeId)
        : null;

  if (!agreement) {
    notFound();
  }

  return <LicenseConfirmationClient orderId={params.orderId} initialOrder={order} initialAgreement={agreement} />;
}
