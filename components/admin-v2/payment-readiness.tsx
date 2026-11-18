import { CAPABILITY_LABELS, READINESS_MESSAGES, type PaymentReadiness } from "@/lib/admin-v2/payment-readiness";
import styles from "./operations.module.css";

const labels = { ready: "Ready", blocked: "Blocked", unknown: "Unknown", available: "Available", unavailable: "Unavailable", enabled: "Enabled", disabled: "Disabled", partial: "Partial", test: "Test", live: "Live" } as const;

export function PaymentReadinessPanel({ readiness }: { readiness: PaymentReadiness }) {
  const { paymentConfiguration, paymentProvider, purchaseCapabilities, checkoutReadiness } = readiness;
  return (
    <section className={styles.card} aria-labelledby="payment-readiness-heading">
      <div className={styles.cardHead}>
        <h2 id="payment-readiness-heading">Payment Readiness</h2>
        <p>Current configuration and capability evidence. Read-only; no payment or provider checks are initiated.</p>
      </div>
      <dl className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">Checkout readiness</dt><dd role="status" aria-label="Checkout readiness" className="font-semibold">{labels[checkoutReadiness.status]}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Payment mode</dt><dd>{labels[paymentConfiguration.mode]}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Configuration</dt><dd role="status" aria-label="Payment configuration">{labels[paymentConfiguration.status]}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Provider</dt><dd>{labels[paymentProvider.status]}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Purchase capabilities</dt><dd>{purchaseCapabilities.enabledCount === null ? "Unknown · 6 capabilities not verified" : `${purchaseCapabilities.enabledCount} of 6 enabled · ${labels[purchaseCapabilities.status]}`}</dd></div>
      </dl>
      {paymentConfiguration.status === "blocked" ? <p role="alert" className="mt-4 text-sm">Checkout is blocked by deployment configuration. Admin operations remain available.</p> : null}
      <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
        {checkoutReadiness.reasons.map(reason => <li key={reason}>{READINESS_MESSAGES[reason]}</li>)}
      </ul>
      {purchaseCapabilities.flags ? <details className="mt-4 text-sm">
        <summary className="cursor-pointer">Purchase capability details</summary>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {Object.entries(CAPABILITY_LABELS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{purchaseCapabilities.flags?.[key as keyof typeof CAPABILITY_LABELS] ? "Enabled" : "Disabled"}</dd></div>)}
        </dl>
      </details> : null}
      <p className="mt-4 text-xs text-muted-foreground">Capability switches govern the purchase foundation; disabled switches alone do not disable legacy checkout. Provider, per-order eligibility and end-to-end fulfillment remain separately verified.</p>
    </section>
  );
}
