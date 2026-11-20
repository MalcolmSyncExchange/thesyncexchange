export function SubscriptionStatus() {
  return <section aria-labelledby="subscription-status" className="rounded-xl border border-border bg-card p-6 space-y-3">
    <h2 id="subscription-status" className="text-xl font-semibold">Subscription status</h2>
    <p>Recurring billing is unavailable. A paid subscription has not been verified for this account.</p>
    <dl className="grid gap-4 sm:grid-cols-2"><div><dt>Pro</dt><dd>USD 19.99 / month</dd></div><div><dt>Teams</dt><dd>USD 49.99 / month</dd></div></dl>
    <p className="text-sm text-muted-foreground">Approved plan prices. Recurring billing, plan changes and cancellation are not yet available. Administrative grants are separate from paid subscriptions. No recurring charge can be started here.</p>
  </section>;
}
