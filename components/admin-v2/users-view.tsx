import Link from "next/link";
import { ArrowLeft, ArrowRight, Search, UserRound, Users } from "lucide-react";

import { accountEvidence, type AdminUserDirectory, type AdminUserRole } from "@/lib/admin-v2/users";
import type { AdminUserDetail } from "@/services/admin/users";
import styles from "./users-view.module.css";

const roleLabel: Record<AdminUserRole, string> = { artist: "Artist", buyer: "Buyer", admin: "Admin" };

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Date unavailable" : new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function directoryHref(directory: AdminUserDirectory, page: number) {
  const params = new URLSearchParams();
  if (directory.query) params.set("q", directory.query);
  if (directory.role !== "all") params.set("role", directory.role);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return `/admin/users${query ? `?${query}` : ""}`;
}

export function AdminUsersDirectory({ directory }: { directory: AdminUserDirectory }) {
  const first = (directory.page - 1) * directory.pageSize + 1;
  const last = Math.min(directory.page * directory.pageSize, directory.total);
  return <div className={styles.page}>
    <header className={styles.header}><p className={styles.kicker}>People</p><h1>Users</h1><p>Find a person, confirm their role, and open the records needed to help them.</p></header>
    <section className={styles.panel} aria-labelledby="users-heading">
      <div className={styles.panelHead}><div><h2 id="users-heading">People</h2><p>Canonical roles · {directory.total.toLocaleString("en-US")} {directory.total === 1 ? "account" : "accounts"}</p></div><span className={styles.source}>Source: account profiles</span></div>
      <form className={styles.filters} action="/admin/users" method="get" role="search">
        <label htmlFor="admin-user-search">Search name or email</label>
        <div className={styles.filterRow}>
          <div className={styles.searchWrap}><Search size={17} aria-hidden="true" /><input id="admin-user-search" name="q" type="search" maxLength={80} defaultValue={directory.query} placeholder="Name or email" /></div>
          <label className={styles.roleFilter} htmlFor="admin-user-role">Role <select id="admin-user-role" name="role" defaultValue={directory.role}><option value="all">All roles</option><option value="artist">Artists</option><option value="buyer">Buyers</option><option value="admin">Admins</option></select></label>
          <button className={styles.filterButton} type="submit">Apply filters</button>
        </div>
      </form>
      {directory.items.length ? <>
        <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Person</th><th scope="col">Role</th><th scope="col">Account record</th><th scope="col">Joined</th><th scope="col"><span className="sr-only">Open user</span></th></tr></thead><tbody>
          {directory.items.map((user) => <tr key={user.id}><td data-label="Person"><strong>{user.name}</strong><small>{user.email}</small></td><td data-label="Role"><span className={styles.roleBadge}>{user.role ? roleLabel[user.role] : "Role not set"}</span></td><td data-label="Account record">{accountEvidence()}</td><td data-label="Joined">{dateLabel(user.createdAt)}</td><td data-label="Action"><Link href={`/admin/users/${user.id}`} aria-label={`Inspect ${user.name}`} className={styles.inspect}>Inspect <ArrowRight size={16} aria-hidden="true" /></Link></td></tr>)}
        </tbody></table></div>
      </> : <div className={styles.empty} role="status"><Users size={25} aria-hidden="true" /><h3>{directory.total > 0 ? "No users on this page" : directory.query || directory.role !== "all" ? "No matching people" : "No user profiles yet"}</h3><p>{directory.total > 0 ? "Go back to the first page to continue browsing." : directory.query || directory.role !== "all" ? "Try another name, email, or role." : "People will appear here when an account profile exists."}</p>{directory.total > 0 || directory.query || directory.role !== "all" ? <Link href="/admin/users">{directory.total > 0 ? "First page" : "Clear filters"}</Link> : null}</div>}
      {directory.total > directory.pageSize ? <nav className={styles.pagination} aria-label="Users pages"><span>{directory.items.length ? `Showing ${first}–${last} of ${directory.total}` : `No records on page ${directory.page} · ${directory.total} total`}</span><div>{directory.page > 1 ? <Link href={directoryHref(directory, directory.page - 1)}>Previous</Link> : null}{last < directory.total ? <Link href={directoryHref(directory, directory.page + 1)}>Next <ArrowRight size={15} aria-hidden="true" /></Link> : null}</div></nav> : null}
    </section>
    <p className={styles.note}>Account restriction and subscription status need approved sources. A profile record does not prove that sign-in is active.</p>
  </div>;
}

export function AdminUserDetailView({ detail }: { detail: AdminUserDetail }) {
  const { user } = detail;
  const kind = user.role ? roleLabel[user.role] : "Role not set";
  return <div className={styles.page}>
    <Link className={styles.back} href="/admin/users"><ArrowLeft size={17} aria-hidden="true" /> Back to Users</Link>
    <header className={styles.header}><p className={styles.kicker}>People / User detail</p><h1>{user.name}</h1><p>{kind} account · read-only support view</p></header>
    {detail.profileSource === "unavailable" || detail.recordsSource !== "available" ? <div className={styles.warning} role="alert"><strong>Some records are unavailable.</strong> Available account information is shown below. Missing reads are not treated as zero. <a href="">Retry page</a></div> : null}
    <div className={styles.detailGrid}>
      <section className={styles.panel} aria-labelledby="account-heading"><div className={styles.panelHead}><div><h2 id="account-heading">Account</h2><p>Identity and role from the canonical profile</p></div><UserRound size={20} aria-hidden="true" /></div><dl className={styles.facts}>
        <div><dt>Name</dt><dd>{user.name}</dd></div><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Canonical role</dt><dd><span className={styles.roleBadge}>{kind}</span></dd></div><div><dt>Joined</dt><dd>{dateLabel(user.createdAt)}</dd></div><div><dt>Profile record</dt><dd>{accountEvidence()}</dd></div><div><dt>Sign-in / restriction status</dt><dd>Unavailable · Auth standing not connected</dd></div>
        {detail.profileSource === "unavailable" ? <div><dt>{kind} profile</dt><dd>Unavailable · retry</dd></div> : detail.profile ? <div><dt>{detail.profile.label}</dt><dd>{detail.profile.value || "Not provided"}</dd></div> : user.role === "artist" || user.role === "buyer" ? <div><dt>{kind} profile</dt><dd>Not provided</dd></div> : null}
      </dl></section>
      <section className={styles.panel} aria-labelledby="connected-heading"><div className={styles.panelHead}><div><h2 id="connected-heading">Connected work</h2><p>Source-backed records only</p></div></div><div className={styles.summaryRows}>
        {user.role === "artist" ? <><div><span>Owned tracks</span><strong>{detail.recordCount === null ? "Unavailable" : detail.recordCount}</strong></div><div><span>Review state</span><strong>See individual tracks</strong></div></> : user.role === "buyer" ? <><div><span>Orders</span><strong>{detail.recordCount === null ? "Unavailable" : detail.recordCount}</strong></div><div><span>Payment and documents</span><strong>See each order separately</strong></div></> : <div><span>Marketplace records</span><strong>No role-specific records in this view</strong></div>}
        <div><span>Subscription / entitlement</span><strong>Unavailable · backend required</strong></div><div><span>Support actions</span><strong>Read-only · future authority required</strong></div>
      </div></section>
    </div>
    {user.role === "artist" ? <section className={styles.panel} aria-labelledby="artist-records"><div className={styles.panelHead}><div><h2 id="artist-records">Recent tracks</h2><p>Latest six · track review and ownership remain separate</p></div><Link href="/admin/tracks">All tracks <ArrowRight size={15} aria-hidden="true" /></Link></div>{detail.recordsSource === "unavailable" ? <UnavailableRecords /> : detail.tracks.length ? <ul className={styles.recordList}>{detail.tracks.map((track) => <li key={track.id}><div><strong>{track.title}</strong><span>{track.status.replaceAll("_", " ")} · {dateLabel(track.createdAt)}</span></div><Link href={`/admin/tracks/${track.id}`}>Inspect track <ArrowRight size={15} aria-hidden="true" /></Link></li>)}</ul> : <EmptyRecords kind="tracks" />}</section> : null}
    {user.role === "buyer" ? <section className={styles.panel} aria-labelledby="buyer-records"><div className={styles.panelHead}><div><h2 id="buyer-records">Recent purchases</h2><p>Latest six · payment, license, agreement, receipt and files remain independent</p></div><Link href="/admin/orders">All orders <ArrowRight size={15} aria-hidden="true" /></Link></div>{detail.recordsSource === "unavailable" ? <UnavailableRecords /> : detail.orders.length ? <ul className={styles.orderList}>{detail.orders.map((order) => <li key={order.id}><div className={styles.orderTop}><div><strong>{order.title}</strong><span>{order.licenseName} · Order {order.id}</span><span>{dateLabel(order.createdAt)} · {new Intl.NumberFormat("en-US", { style: "currency", currency: /^[A-Z]{3}$/.test(order.currency) ? order.currency : "USD" }).format(order.amountCents / 100)}</span></div><Link href={`/admin/orders#order-${order.id}`}>Inspect order <ArrowRight size={15} aria-hidden="true" /></Link></div><dl className={styles.orderStates}><div><dt>Payment</dt><dd>{order.payment}</dd></div><div><dt>License</dt><dd>{order.license}</dd></div><div><dt>Agreement</dt><dd>{order.agreement}</dd></div><div><dt>Receipt</dt><dd>{order.receipt}</dd></div><div><dt>Files</dt><dd>{order.files}</dd></div></dl></li>)}</ul> : <EmptyRecords kind="purchases" />}</section> : null}
    <section className={styles.panel} aria-labelledby="future-heading"><div className={styles.panelHead}><div><h2 id="future-heading">Additional support context</h2><p>Unavailable until approved sources and permissions exist</p></div></div><div className={styles.summaryRows}><div><span>Unified activity and support notes</span><strong>Planned · no unified audit source</strong></div><div><span>Restriction, View As, and plan overrides</span><strong>Not available in this read-only slice</strong></div></div></section>
  </div>;
}

function EmptyRecords({ kind }: { kind: string }) { return <div className={styles.empty} role="status"><h3>No {kind} on file</h3><p>This account has no {kind} in the current source.</p></div>; }
function UnavailableRecords() { return <div className={styles.empty} role="alert"><h3>Records unavailable</h3><p>Retry the page. No empty state is inferred.</p></div>; }
export function AdminUserNotFound() { return <div className={styles.page}><Link className={styles.back} href="/admin/users"><ArrowLeft size={17} aria-hidden="true" /> Back to Users</Link><div className={styles.empty} role="status"><h1>User unavailable</h1><p>No accessible profile matches that link.</p></div></div>; }
