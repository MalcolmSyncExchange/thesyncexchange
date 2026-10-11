import { redirect } from "next/navigation";
import { LicenseReview } from "@/components/checkout/license-review";
import { licenseDetailHref } from "@/lib/licenses/selection";
import { getPaymentDisplayConfiguration } from "@/lib/server-env";
import { createOrderAction } from "@/services/buyer/actions";
import { loadBuyerCheckoutReview } from "@/services/orders/license-offers";

export default async function CheckoutPage(props: {
  params: Promise<{ trackSlug: string }>;
  searchParams?: Promise<{ licenseTypeId?: string | string[]; review?: string; error?: string }>;
}) {
  const { trackSlug } = await props.params;
  const search = await props.searchParams;
  const review = await loadBuyerCheckoutReview(trackSlug, search?.licenseTypeId);
  if (!review) redirect(licenseDetailHref(trackSlug, null, true));
  const payment = getPaymentDisplayConfiguration();
  return <div className="mx-auto max-w-2xl space-y-6">
    <h1 className="text-3xl font-semibold">Review your license</h1>
    <p className="break-words text-lg">{review.trackTitle}</p>
    {payment.paymentMode === "test" ? <p role="status" className="rounded-md border border-border p-3 text-sm font-medium">TEST MODE — NO REAL PAYMENT</p> : null}
    {search?.error ? <p role="alert" className="text-sm">Payment could not be started. Review your selection and try again when checkout is available.</p> : null}
    <LicenseReview key={review.offer.revision} review={review} paymentAvailable={payment.checkoutAvailable}
      testPayment={payment.paymentMode === "test"} changed={search?.review === "changed"} action={createOrderAction} />
  </div>;
}
