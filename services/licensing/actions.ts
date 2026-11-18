"use server";
import { redirect, unstable_rethrow } from "next/navigation";
import { loadBuyerCheckoutReview } from "@/services/orders/license-offers";
import { checkoutReviewHref } from "@/lib/licenses/selection";
import { requireSession } from "@/services/auth/session";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { consumeRateLimit, getRateLimitMessage } from "@/services/security/rate-limit";
import { licensingRpc, type PurchaseQuote } from "./purchases";

export async function continueLicenseReviewAction(form: FormData) {
  const slug = String(form.get("trackSlug") || "");
  const review = await loadBuyerCheckoutReview(slug, form.get("licenseTypeId"));
  if (!review || review.trackId !== form.get("trackId") || form.get("reviewConfirmed") !== "on" || form.get("reviewRevision") !== review.offer.revision) {
    redirect(checkoutReviewHref(slug, String(form.get("licenseTypeId") || ""), true));
  }
  redirect(`${checkoutReviewHref(slug, review.offer.licenseTypeId)}&details=1&revision=${review.offer.revision}`);
}

export async function preparePurchaseQuoteAction(form: FormData) {
  const user = await requireSession("buyer");
  const trackId = String(form.get("trackId") || "");
  const slug = encodeURIComponent(String(form.get("trackSlug") || ""));
  try {
    const admission = await consumeRateLimit("checkout", user.id);
    if (admission.status !== "allowed") throw new Error(getRateLimitMessage(admission));
    const review = await loadBuyerCheckoutReview(String(form.get("trackSlug") || ""), form.get("licenseTypeId"));
    if (!review || review.trackId !== trackId || form.get("reviewRevision") !== review.offer.revision) {
      redirect(checkoutReviewHref(String(form.get("trackSlug") || ""), String(form.get("licenseTypeId") || ""), true));
    }
    const client = await createServerSupabaseClient();
    const field = (name: string) => String(form.get(name) || "").trim();
    const q = await licensingRpc<PurchaseQuote>(client, "prepare_purchase_quote", {
      p_track: trackId, p_license: field("licenseTypeId"),
      p_buyer: { legalName: field("legalName"), entityType: field("entityType"), jurisdiction: field("jurisdiction"), address: field("address"), registrationNumber: field("registrationNumber"), representative: field("representative"), capacity: field("capacity") },
      p_usage: { project: field("project"), use: field("use"), territory: field("territory"), startsAt: field("startsAt"), endsAt: field("endsAt") }
    });
    redirect(`/buyer/checkout/${slug}?quote=${encodeURIComponent(q.id)}`);
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/buyer/checkout/${slug}?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to prepare transaction review.")}`);
  }
}
