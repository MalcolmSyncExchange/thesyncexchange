import Link from "next/link";
import { ArrowRight, Check, Database, ExternalLink, ShieldAlert } from "lucide-react";

import type { AdminOperationsSnapshot } from "@/lib/admin-v2/operations";
import { ActionFeed } from "./action-feed";
import styles from "./operations.module.css";

const metricSources = [
  { key: "pendingTracks", label: "Awaiting review", source: "tracks", href: "/admin/review-queue" },
  { key: "openFlags", label: "Open flags", source: "admin_flags", href: "/admin/compliance" },
  { key: "orderExceptions", label: "Agreement exceptions", source: "orders", href: "/admin/orders" },
  { key: "tracks", label: "Total tracks", source: "tracks", href: "/admin/tracks" },
  { key: "orders", label: "Orders", source: "orders", href: "/admin/orders" },
  { key: "users", label: "Accounts", source: "user_profiles", href: "/admin/users" }
] as const;

export function AdminOverview({ snapshot }: { snapshot: AdminOperationsSnapshot }) {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div><p className={styles.kicker}>Admin overview</p><h1>What needs my attention?</h1><p>Start with work that needs a closer look. Marketplace counts follow below.</p></div>
        <Link className={styles.primaryLink} href="/admin/action-center">Open Action Center <ArrowRight size={17} aria-hidden="true" /></Link>
      </header>

      {snapshot.hasAnyUnavailableSource ? <SourceNotice snapshot={snapshot} /> : null}

      <section className={styles.attentionPanel} aria-labelledby="attention-heading">
        <div className={styles.panelHeading}><div><p className={styles.kicker}>Current work</p><h2 id="attention-heading">Needs attention</h2></div><span className={styles.sourceLine}>Checked {formatUtc(snapshot.checkedAt)}</span></div>
        {snapshot.items.length ? <ActionFeed items={snapshot.items.slice(0, 5)} /> : snapshot.attentionIsClear ? <ClearState /> : <UnavailableState />}
        {snapshot.items.length ? <div className={styles.panelFooter}><Link href="/admin/action-center">See all available signals <ArrowRight size={15} aria-hidden="true" /></Link></div> : null}
      </section>

      <section className={styles.section} aria-labelledby="posture-heading">
        <div className={styles.sectionHeader}><div><p className={styles.kicker}>Marketplace posture</p><h2 id="posture-heading">What the records show</h2></div><span className={styles.sourceLine}>Counts from current database records</span></div>
        <div className={styles.metricGrid}>
          {metricSources.map(({ key, label, source, href }) => <Metric key={key} label={label} value={snapshot.counts[key]} source={source} checkedAt={snapshot.checkedAt} href={href} />)}
        </div>
      </section>

      <div className={styles.lowerGrid}>
        <section className={styles.card} aria-labelledby="where-next-heading">
          <div className={styles.cardHead}><h2 id="where-next-heading">Where to go next</h2><p>Existing Admin routes remain available for inspection.</p></div>
          <div className={styles.routeGrid}>
            <Link href="/admin/review-queue">Review Queue <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link href="/admin/tracks">Catalog & Tracks <ArrowRight size={16} aria-hidden="true" /></Link>
            <Link href="/admin/orders">Orders & Licenses <ArrowRight size={16} aria-hidden="true" /></Link>
          </div>
        </section>
        <section className={styles.card} aria-labelledby="future-heading">
          <div className={styles.cardHead}><h2 id="future-heading">Not yet connected</h2><p>These signals need an approved source before they can be shown as counts.</p></div>
          <ul className={styles.unavailableList}><li>Media failures <strong>Unavailable · backend required</strong></li><li>Deals <strong>Unavailable · backend required</strong></li><li>Payout liabilities <strong>Unavailable · ledger required</strong></li></ul>
        </section>
      </div>
    </div>
  );
}

export function AdminActionCenter({ snapshot }: { snapshot: AdminOperationsSnapshot }) {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}><div><p className={styles.kicker}>Admin operations</p><h1>Action Center</h1><p>Read-only signals from submitted tracks, open track flags, and paid orders with a missing agreement.</p></div><Link className={styles.secondaryLink} href="/admin/dashboard">Back to Overview</Link></header>
      {snapshot.hasAnyUnavailableSource ? <SourceNotice snapshot={snapshot} /> : null}
      <section className={styles.attentionPanel} aria-labelledby="action-list-heading">
        <div className={styles.panelHeading}><div><p className={styles.kicker}>Current source records</p><h2 id="action-list-heading">Items to inspect</h2><p>Priority reflects recorded flag severity or the type of exception; it is not an allegation.</p></div><span className={styles.sourceLine}>Checked {formatUtc(snapshot.checkedAt)}</span></div>
        {snapshot.items.length ? <ActionFeed items={snapshot.items} filterable /> : snapshot.attentionIsClear ? <ClearState /> : <UnavailableState />}
        {snapshot.items.length ? <p className={styles.footnote}>Showing up to 8 oldest records per source. Open the source route for the complete queue. Assignment, deadlines, and resolution history require a future authorized read model.</p> : null}
      </section>
      <section className={styles.card} aria-label="Source availability"><div className={styles.cardHead}><h2>Source availability</h2><p>A failed source is unavailable, never counted as zero.</p></div><div className={styles.sourceGrid}>
        <SourceState label="Submitted tracks" ready={snapshot.pendingTracks !== null} href="/admin/review-queue" />
        <SourceState label="Open track flags" ready={snapshot.openFlags !== null} href="/admin/compliance" />
        <SourceState label="Agreement exceptions" ready={snapshot.orderExceptions !== null} href="/admin/orders" />
      </div></section>
    </div>
  );
}

function Metric({ label, value, source, checkedAt, href }: { label: string; value: number | null; source: string; checkedAt: string; href: string }) {
  return <Link className={styles.metric} href={href} aria-label={`${label}: ${value === null ? "unavailable" : value}. Open ${source} records`}><span>{label}<ExternalLink size={14} aria-hidden="true" /></span><strong>{value === null ? "—" : value.toLocaleString("en-US")}</strong><small>{value === null ? "Unavailable · retry later" : `Source: ${source} · ${formatUtc(checkedAt)}`}</small></Link>;
}

function SourceState({ label, ready, href }: { label: string; ready: boolean; href: string }) {
  return <div className={styles.sourceState}><Database size={17} aria-hidden="true" /><span>{label}</span><strong>{ready ? "Available" : "Unavailable"}</strong><Link href={href}>Open source<span className="sr-only"> for {label}</span></Link></div>;
}

function ClearState() {
  return <div className={styles.clearState} role="status"><span className={styles.clearIcon}><Check size={25} aria-hidden="true" /></span><h3>Nothing needs review right now.</h3><p>New submissions, open track flags, and current agreement exceptions will appear here. The marketplace records remain available below.</p><Link href="/admin/review-queue">Open Review Queue <ArrowRight size={16} aria-hidden="true" /></Link></div>;
}

function UnavailableState() {
  return <div className={styles.unavailableState} role="alert"><ShieldAlert size={24} aria-hidden="true" /><div><h3>Attention status is unavailable.</h3><p>One or more source reads failed. No zero or all-clear state is inferred. Retry this page or inspect the source routes.</p></div><a href="">Retry</a></div>;
}

function SourceNotice({ snapshot }: { snapshot: AdminOperationsSnapshot }) {
  return <div className={styles.notice} role="alert"><ShieldAlert size={18} aria-hidden="true" /><span>Some operational sources could not be read. Available records are shown, but this is not a complete all-clear view.</span><a href="">Retry page</a></div>;
}

function formatUtc(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "time unavailable" : `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
