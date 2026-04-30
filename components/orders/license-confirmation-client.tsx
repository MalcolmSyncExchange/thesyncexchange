"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/layout/brand-assets";
import { OrderStatusProgress } from "@/components/orders/order-status-progress";
import { OrderStatusBadge } from "@/components/shared/state-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LICENSE_CONFIRMATION_POLL_INTERVAL_MS,
  LICENSE_CONFIRMATION_POLL_TIMEOUT_MS,
  shouldPollLicenseConfirmation
} from "@/services/orders/confirmation-polling";

type ConfirmationOrder = {
  id: string;
  order_status: "pending" | "paid" | "fulfilled" | "refunded";
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  agreement_url?: string | null;
  agreement_generation_error?: string | null;
  agreement_delivery_blocked?: boolean | null;
  agreement_ready?: boolean | null;
  agreement_number?: string | null;
  schema_degraded?: boolean | null;
  degraded_messages?: string[] | null;
  checkout_created_at?: string | null;
  paid_at?: string | null;
  agreement_generated_at?: string | null;
  fulfilled_at?: string | null;
  refunded_at?: string | null;
  track?: {
    title?: string | null;
  } | null;
  license_type?: {
    name?: string | null;
  } | null;
};

type ConfirmationAgreement = {
  orderId: string;
  trackTitle: string;
  artistName: string;
  licenseName: string;
  agreementUrl: string;
  summary: string[];
};

type LicenseConfirmationClientProps = {
  orderId: string;
  initialOrder: ConfirmationOrder | null;
  initialAgreement: ConfirmationAgreement;
};

export function LicenseConfirmationClient({ orderId, initialOrder, initialAgreement }: LicenseConfirmationClientProps) {
  const [order, setOrder] = useState(initialOrder);
  const [polling, setPolling] = useState(() => shouldPollLicenseConfirmation(initialOrder, 0));
  const [timedOut, setTimedOut] = useState(false);
  const latestOrderRef = useRef(initialOrder);

  useEffect(() => {
    latestOrderRef.current = order;
  }, [order]);

  useEffect(() => {
    if (!shouldPollLicenseConfirmation(latestOrderRef.current, 0)) {
      return;
    }

    let stopped = false;
    const startedAt = Date.now();
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stopPolling = (reason: string) => {
      if (stopped) return;
      stopped = true;
      setPolling(false);
      if (intervalId) {
        clearInterval(intervalId);
      }
      console.info("[license-confirmation] polling stopped", {
        orderId,
        reason,
        status: latestOrderRef.current?.order_status || null,
        hasAgreementUrl: Boolean(latestOrderRef.current?.agreement_url)
      });
    };

    const poll = async () => {
      const elapsedMs = Date.now() - startedAt;
      if (elapsedMs >= LICENSE_CONFIRMATION_POLL_TIMEOUT_MS) {
        setTimedOut(true);
        stopPolling("timeout");
        return;
      }

      try {
        const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
          cache: "no-store",
          headers: {
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { order?: ConfirmationOrder };
        if (!payload.order) {
          return;
        }

        const previousStatus = latestOrderRef.current?.order_status || null;
        const nextStatus = payload.order.order_status || null;
        if (previousStatus !== nextStatus) {
          console.info("[license-confirmation] order status changed", {
            orderId,
            from: previousStatus,
            to: nextStatus
          });
        }

        latestOrderRef.current = payload.order;
        setOrder(payload.order);

        if (!shouldPollLicenseConfirmation(payload.order, Date.now() - startedAt)) {
          stopPolling("order-updated");
        }
      } catch (error) {
        console.info("[license-confirmation] polling request failed", {
          orderId,
          message: error instanceof Error ? error.message : "Unknown polling error."
        });
      }
    };

    console.info("[license-confirmation] polling started", {
      orderId,
      intervalMs: LICENSE_CONFIRMATION_POLL_INTERVAL_MS
    });
    setPolling(true);
    intervalId = setInterval(poll, LICENSE_CONFIRMATION_POLL_INTERVAL_MS);
    void poll();

    return () => stopPolling("component-unmounted");
  }, [orderId]);

  const agreement = useMemo(() => buildAgreement(order, initialAgreement), [order, initialAgreement]);
  const pending = order?.order_status === "pending";
  const complete = Boolean(order?.agreement_ready && order?.agreement_url);

  return (
    <main className="relative mx-auto max-w-3xl overflow-hidden px-4 py-16">
      <div className="mb-6">
        <BrandLogo className="w-[170px] sm:w-[196px]" />
      </div>
      <Image
        src="/brand/the-sync-exchange/watermark/Watermark.png"
        alt=""
        width={2400}
        height={400}
        aria-hidden="true"
        className="pointer-events-none absolute bottom-10 right-0 -z-10 w-[260px] max-w-[45%] opacity-[0.06]"
      />
      <Card>
        <CardHeader>
          <CardTitle>License Confirmation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-muted-foreground">
            This confirmation tracks payment, agreement generation, and private delivery for your purchased sync license.
          </p>
          {pending ? (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-200" role="status" aria-live="polite">
              <div className="flex items-center gap-3">
                <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-700 dark:border-sky-200/30 dark:border-t-sky-100" />
                <span className="font-medium">Finalizing your license… This usually takes a few seconds.</span>
              </div>
              {timedOut ? <p className="mt-2 text-xs">Still finalizing. You can refresh or check your Orders page.</p> : null}
            </div>
          ) : null}
          {complete ? (
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200" role="status" aria-live="polite">
              Your license is finalized. The agreement is ready to download.
            </div>
          ) : null}
          {order?.agreement_generation_error ? (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-700 dark:text-amber-300">
              Payment was recorded, but agreement generation still needs attention: {order.agreement_generation_error}
            </div>
          ) : null}
          {order?.agreement_delivery_blocked ? (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-200">
              The agreement document was generated, but secure delivery is blocked until the Supabase fulfillment metadata migration is applied.
            </div>
          ) : null}
          {order?.schema_degraded ? (
            <div className="rounded-lg border border-sky-500/20 bg-sky-500/10 p-4 text-sm text-sky-900 dark:text-sky-200">
              {(order.degraded_messages || [
                "Extended fulfillment diagnostics are running in compatibility mode until the manual Supabase order hardening SQL is applied."
              ]).map((message: string) => (
                <p key={message} className="mt-1 first:mt-0">
                  {message}
                </p>
              ))}
            </div>
          ) : null}
          <div className="rounded-lg border border-border bg-muted/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{agreement.trackTitle}</p>
                <p className="text-sm text-muted-foreground">{agreement.artistName}</p>
              </div>
              {order ? <OrderStatusBadge status={order.order_status} /> : null}
            </div>
            <div className="mt-4 space-y-2 text-sm">
              {agreement.summary.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            {order ? (
              <div className="mt-5">
                <OrderStatusProgress
                  status={order.order_status}
                  stripe_checkout_session_id={order.stripe_checkout_session_id}
                  stripe_payment_intent_id={order.stripe_payment_intent_id}
                  agreement_url={order.agreement_url}
                  checkout_created_at={order.checkout_created_at}
                  paid_at={order.paid_at}
                  agreement_generated_at={order.agreement_generated_at}
                  fulfilled_at={order.fulfilled_at}
                  refunded_at={order.refunded_at}
                />
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/buyer/orders">View Order History</Link>
            </Button>
            {order?.agreement_ready && order?.agreement_url ? (
              <Button asChild variant="outline">
                <Link href={order.agreement_url}>Download License Agreement</Link>
              </Button>
            ) : null}
          </div>
          {polling ? <p className="text-xs text-muted-foreground">Checking fulfillment status automatically.</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}

function buildAgreement(order: ConfirmationOrder | null, fallback: ConfirmationAgreement): ConfirmationAgreement {
  if (!order) {
    return fallback;
  }

  return {
    orderId: order.id,
    trackTitle: order.track?.title || fallback.trackTitle,
    artistName: fallback.artistName,
    licenseName: order.license_type?.name || fallback.licenseName,
    agreementUrl: order.agreement_url || "",
    summary: [
      `License: ${order.license_type?.name || fallback.licenseName}`,
      `Status: ${order.order_status}`,
      ...(order.agreement_number ? [`Agreement Number: ${order.agreement_number}`] : []),
      `Agreement URL: ${order.agreement_url || "Pending"}`
    ]
  };
}
