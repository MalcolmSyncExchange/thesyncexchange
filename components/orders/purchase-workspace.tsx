import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  FileAudio,
  ReceiptText,
  Search,
} from "lucide-react";
import { AgreementDownloadForm } from "@/components/orders/agreement-download-form";
import { DomainStatus, StatusRow } from "@/components/ui/domain-status";
import { Button } from "@/components/ui/button";
import { FirstUseState } from "@/components/ui/first-use-state";
import {
  REFUND_BANNER,
  type Purchase,
  type PurchasePage,
} from "@/lib/purchases/contract";
import styles from "./purchase-workspace.module.css";

const date = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(value))
    : "Date unavailable";
const money = (p: Purchase) =>
  p.amountMinor === null || !p.currency
    ? "Amount unavailable"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: p.currency,
      }).format(p.amountMinor / 100) + ` ${p.currency}`;
function Artwork({ purchase }: { purchase: Purchase }) {
  // Only the server-resolved public artwork URL may reach this component.
  return purchase.artworkUrl ? (
    <Image
      src={purchase.artworkUrl}
      alt=""
      width={96}
      height={96}
      unoptimized
      className={styles.artwork}
    />
  ) : (
    <span aria-hidden="true" className={styles.artwork}>
      <FileAudio />
    </span>
  );
}
function TestNotice({ purchase }: { purchase: Purchase }) {
  return purchase.paymentMode === "test" ? (
    <p className={styles.test}>TEST transaction · No commercial rights</p>
  ) : purchase.paymentMode === "unknown" ? (
    <p className={styles.muted}>
      Payment classification unavailable. No commercial-use rights are inferred.
    </p>
  ) : null;
}
function PurchaseIdentity({ purchase: p }: { purchase: Purchase }) {
  return (
    <div className={styles.identity}>
      <Artwork purchase={p} />
      <div>
        <Link href={`/buyer/orders/${encodeURIComponent(p.id)}`}>
          {p.title}
        </Link>
        <p>{p.artist || "Artist identity unavailable"}</p>
        <p className={styles.reference}>Order {p.id}</p>
        <TestNotice purchase={p} />
      </div>
    </div>
  );
}
function Summary({ purchase: p }: { purchase: Purchase }) {
  return <DomainStatus tone={p.summary.tone}>{p.summary.label}</DomainStatus>;
}
function Fields({
  purchase: p,
  compact = false,
}: {
  purchase: Purchase;
  compact?: boolean;
}) {
  return (
    <dl className={styles.cardFacts}>
      <div>
        <dt>License</dt>
        <dd>{p.licenseName}</dd>
      </div>
      <div>
        <dt>{p.dateLabel}</dt>
        <dd>{date(p.date)}</dd>
      </div>
      <div>
        <dt>Amount</dt>
        <dd>{money(p)}</dd>
      </div>
      {!compact && (
        <>
          <div>
            <dt>Payment</dt>
            <dd>{p.payment.label}</dd>
          </div>
          <div>
            <dt>Agreement</dt>
            <dd>{p.agreement.label}</dd>
          </div>
          <div>
            <dt>Receipt</dt>
            <dd>{p.receipt.label}</dd>
          </div>
          <div>
            <dt>Included files</dt>
            <dd>{p.files.label}</dd>
          </div>
        </>
      )}
    </dl>
  );
}
export function PurchaseLibrary({ data }: { data: PurchasePage }) {
  const filtered = Boolean(data.query || data.filter !== "all");
  const firstUse = !data.items.length && !filtered && !data.nextCursor;
  const next = new URLSearchParams({
    cursor: data.nextCursor || "",
    query: data.query,
    filter: data.filter,
    size: String(data.pageSize),
  });
  return (
    <div className={styles.workspace} data-purchase-workspace>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Buyer library</p>
          <h1>My Purchases</h1>
          <p>{firstUse ? "Your purchase records will appear here when you have them." : "See what you licensed, what you paid, and which records and included files are ready."}</p>
        </div>
        {!firstUse ? <Link className={styles.primary} href="/buyer/catalog">
          <Search aria-hidden="true" /> Find music
        </Link> : null}
      </header>
      {!firstUse ? <form className={styles.toolbar} action="/buyer/orders">
        <label>
          Search by exact order reference
          <input
            name="query"
            defaultValue={data.query}
            placeholder="Order UUID"
            maxLength={100}
          />
        </label>
        <label>
          Payment filter
          <select name="filter" defaultValue={data.filter}>
            <option value="all">All purchases</option>
            <option value="pending">Pending payment</option>
            <option value="paid">Paid</option>
            <option value="refunded">Refunded</option>
          </select>
        </label>
        <button type="submit">Apply</button>
        {filtered && <Link href="/buyer/orders">Clear filters</Link>}
      </form> : null}
      {!firstUse ? <p className={styles.muted}>
        Track and artist search is not yet available. Payment filters do not
        describe receipt or file readiness.
      </p> : null}
      {!data.items.length ? (
        <PurchaseEmpty filtered={filtered} />
      ) : (
        <>
          <div className={styles.desktop}>
            <table aria-label="My purchases">
              <thead>
                <tr>
                  {[
                    "Purchase",
                    "License",
                    "Amount / payment",
                    "Receipt",
                    "Included files",
                    "Status",
                  ].map((x) => (
                    <th key={x} scope="col">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <PurchaseIdentity purchase={p} />
                    </td>
                    <td>
                      {p.licenseName}
                      <small>
                        {p.dateLabel} {date(p.date)}
                      </small>
                      <small>Agreement: {p.agreement.label}</small>
                    </td>
                    <td>
                      {money(p)}
                      <small>Payment: {p.payment.label}</small>
                    </td>
                    <td>{p.receipt.label}</td>
                    <td>{p.files.label}</td>
                    <td>
                      <Summary purchase={p} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={styles.mobile}>
            {data.items.map((p) => (
              <article className={styles.purchaseCard} key={p.id}>
                <PurchaseIdentity purchase={p} />
                <Fields purchase={p} />
                <Summary purchase={p} />
                <Link
                  className={styles.open}
                  href={`/buyer/orders/${encodeURIComponent(p.id)}`}
                  aria-label={`View purchase ${p.title}, order ${p.id}`}
                >
                  View purchase <ChevronRight aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
      {!firstUse ? <nav aria-label="Purchase pages" className={styles.pagination}>
        {data.nextCursor && (
          <Link href={`/buyer/orders?${next}`}>
            Next purchases <ChevronRight aria-hidden="true" />
          </Link>
        )}
        {filtered || data.nextCursor ? (
          <Link href="/buyer/orders">First page</Link>
        ) : null}
      </nav> : null}
    </div>
  );
}
export function PurchaseEmpty({ filtered = false }: { filtered?: boolean }) {
  return filtered ? (
    <section className={styles.empty}>
      <h2>No purchases match this view</h2>
      <p>Check the order reference or clear your payment filter.</p>
      <Link href="/buyer/orders">Clear filters</Link>
    </section>
  ) : (
    <FirstUseState
      icon={ReceiptText}
      eyebrow="Buyer library · 0 purchases"
      title="Your purchases will live here."
      description="After a completed purchase, return here for its order details and any available agreement. Receipt and included-file availability are shown separately when supported."
      action={<Link className={styles.primary} href="/buyer/catalog"><Search aria-hidden="true" />Discover music</Link>}
      compact
    />
  );
}
export function PurchaseDetail({ purchase: p }: { purchase: Purchase }) {
  const refunded = p.payment.code === "refunded";
  return (
    <div className={styles.workspace} data-purchase-workspace>
      <Link className={styles.back} href="/buyer/orders">
        <ArrowLeft aria-hidden="true" /> Back to purchases
      </Link>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Order {p.id}</p>
          <h1>Purchase details</h1>
          <p>
            {p.dateLabel} {date(p.date)} · {money(p)}
          </p>
        </div>
        <Summary purchase={p} />
      </header>
      {refunded && (
        <div className={styles.banner} role="status">
          <strong>This purchase was refunded.</strong>
          <p>
            {p.agreement.canDownload
              ? REFUND_BANNER
              : "Refund status alone does not determine whether the license remains valid for continued use. The issued agreement is currently unavailable. Contact support if you need confirmation of your rights."}
          </p>
        </div>
      )}
      {p.agreement.code === "pending" && (
        <div className={styles.info} role="status" aria-live="polite">
          <strong>Payment recorded. Agreement not yet available.</strong>
          <p>
            Receipt and included-file delivery remain unavailable. Refresh to
            check the agreement.
          </p>
        </div>
      )}
      <div className={styles.layout}>
        <div className={styles.main}>
          <section className={styles.section}>
            <div className={styles.hero}>
              <Artwork purchase={p} />
              <div>
                <p className={styles.eyebrow}>What you bought</p>
                <h2>{p.title}</h2>
                <p>{p.artist || "Artist identity unavailable"}</p>
                <TestNotice purchase={p} />
              </div>
            </div>
            <Fields purchase={p} compact />
            {p.identitySource === "current_catalog" && (
              <p className={styles.muted}>
                Track and license labels use current catalog metadata.
                Purchase-time terms are shown only when a validated record
                exists.
              </p>
            )}
          </section>
          <section className={styles.section}>
            <p className={styles.eyebrow}>Your license</p>
            <h2>{p.licenseName}</h2>
            <StatusRow
              label="License record"
              value={p.license.label}
              detail={p.license.detail}
              tone={p.license.tone}
            />
            {p.terms ? (
              <dl className={styles.terms}>
                <div>
                  <dt>Use</dt>
                  <dd>{p.terms.use.join(" · ") || "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Term</dt>
                  <dd>{p.terms.term || "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Territory</dt>
                  <dd>{p.terms.territory || "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Version</dt>
                  <dd>{p.terms.version || "Not recorded"}</dd>
                </div>
              </dl>
            ) : (
              <p className={styles.muted}>
                Purchase-time license terms are unavailable. Current catalog
                terms are not substituted.
              </p>
            )}
            <StatusRow
              label="Agreement"
              value={p.agreement.label}
              detail={p.agreement.detail}
              tone={p.agreement.tone}
            />
            {p.agreement.number && (
              <p className={styles.reference}>Agreement {p.agreement.number}</p>
            )}
            <div className={styles.actions}>
              <Button
                variant="outline"
                disabled
                aria-describedby="agreement-view-reason"
              >
                View Agreement
              </Button>
              {p.agreement.canDownload ? (
                <AgreementDownloadForm orderId={p.id} className={styles.action}>
                  <Download aria-hidden="true" />
                  Download Agreement
                </AgreementDownloadForm>
              ) : (
                <Button
                  variant="outline"
                  disabled
                  aria-describedby="agreement-download-reason"
                >
                  Download Agreement
                </Button>
              )}
            </div>
            <p id="agreement-view-reason" className={styles.muted}>
              Separate agreement viewing is not yet available. Use secure
              download when ready.
            </p>
            {!p.agreement.canDownload && (
              <p id="agreement-download-reason" className={styles.muted}>
                {p.agreement.detail}
              </p>
            )}
            <p className={styles.note}>
              This screen is a summary. The generated purchase-time agreement is
              the authoritative issued record. Historical access does not
              establish current commercial-use rights.
            </p>
          </section>
          <section className={styles.section}>
            <p className={styles.eyebrow}>Payment record</p>
            <h2>Receipt</h2>
            <StatusRow
              label="Purchase receipt"
              value={p.receipt.label}
            />
            <Button
              variant="outline"
              disabled
              aria-describedby="receipt-reason"
            >
              Download Receipt
            </Button>
            <p id="receipt-reason" className={styles.muted}>
              {p.receipt.detail}
            </p>
          </section>
          <section className={styles.section}>
            <p className={styles.eyebrow}>Included delivery</p>
            <h2>Included files</h2>
            <p id="files-delivery-reason">
              {p.files.detail} Inclusion of optional versions is not recorded.
            </p>
            {[
              "Full Master",
              "Instrumental",
              "Clean",
              "Acapella",
              "Stems",
              "Alternate versions",
            ].map((name) => (
              <div className={styles.file} key={name}>
                <FileAudio aria-hidden="true" />
                <div>
                  <strong>{name}</strong>
                </div>
                <Button
                  variant="outline"
                  disabled
                  aria-describedby="files-delivery-reason"
                >
                  Unavailable
                </Button>
              </div>
            ))}
          </section>
          <section className={styles.section}>
            <p className={styles.eyebrow}>Order activity</p>
            <h2>Status history</h2>
            <ol className={styles.timeline}>
              {p.activity.map((event, i) => (
                <li key={i}>
                  <strong>{event.label}</strong>
                  <time dateTime={event.at}>{date(event.at)} UTC</time>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className={styles.aside}>
          <section className={styles.section}>
            <p className={styles.eyebrow}>Order summary</p>
            <h2>{money(p)}</h2>
            <dl className={styles.stacked}>
              <div>
                <dt>Order</dt>
                <dd>{p.id}</dd>
              </div>
              <>
                <div>
                  <dt>Payment</dt>
                  <dd>{p.payment.label}</dd>
                </div>
                <div>
                  <dt>Agreement</dt>
                  <dd>{p.agreement.label}</dd>
                </div>
                <div>
                  <dt>Receipt</dt>
                  <dd>{p.receipt.label}</dd>
                </div>
                <div>
                  <dt>Included files</dt>
                  <dd>{p.files.label}</dd>
                </div>
              </>
            </dl>
            <p className={styles.muted}>{p.payment.detail}</p>
            <StatusRow
              label="Security review"
              value={p.hold.label}
              detail={p.hold.detail}
            />
          </section>
          <section className={styles.section}>
            <h2>Need help with this order?</h2>
            <p>
              Include order <span className={styles.reference}>{p.id}</span>{" "}
              when contacting buyer support.
            </p>
            <Link className={styles.action} href="/contact">
              Contact support
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
export function PurchaseSkeleton() {
  return (
    <div
      className={styles.workspace}
      role="status"
      aria-label="Loading purchases"
    >
      <span className="sr-only">Loading purchase records</span>
      <div className={styles.skeleton} />
      <div className={styles.skeleton} />
      <div className={styles.skeleton} />
    </div>
  );
}
