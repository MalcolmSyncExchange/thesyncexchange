"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowRight, AudioLines, BookOpenCheck, ClipboardList, FileText, Flag, LayoutDashboard, LogOut, Menu, ShieldCheck, Users, X } from "lucide-react";

import { BrandLogo } from "@/components/layout/brand-assets";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { logoutAction } from "@/services/auth/actions";
import type { SessionUser } from "@/types/models";
import styles from "./admin-shell.module.css";

type Destination = { label: string; href?: string; icon: typeof LayoutDashboard };
const groups: Array<{ label: string; destinations: Destination[] }> = [
  {
    label: "Operate",
    destinations: [
      { label: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
      { label: "Financial Dashboard", href: "/admin/accounting", icon: FileText },
      { label: "Action Center", href: "/admin/action-center", icon: Activity },
      { label: "Review Queue", href: "/admin/review-queue", icon: ClipboardList },
      { label: "Catalog & Tracks", href: "/admin/tracks", icon: AudioLines },
      { label: "Organizations", href: "/admin/command/organizations", icon: ShieldCheck }
    ]
  },
  {
    label: "People + commerce",
    destinations: [
      { label: "Support & disputes", href: "/admin/command/support", icon: Users },
      { label: "Subscriptions", href: "/admin/command/subscriptions", icon: Users },
      { label: "Settings", href: "/admin/command/settings", icon: ShieldCheck },
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Admin Access", href: "/admin/command/permissions", icon: ShieldCheck },
      { label: "Orders & Licenses", href: "/admin/orders", icon: BookOpenCheck },
      { label: "License oversight", href: "/admin/licenses", icon: BookOpenCheck },
      { label: "Refunds", href: "/admin/payments", icon: ArrowRight },
      { label: "Deals & Requests", href: "/admin/command/deals", icon: FileText },
      { label: "Conversations", href: "/admin/command/deals", icon: FileText },
      { label: "Integrity", href: "/admin/command/integrity", icon: Flag },
      { label: "Suspensions", href: "/admin/command/users", icon: ShieldCheck },
      { label: "Financial Overrides", href: "/admin/accounting", icon: FileText }
    ]
  },
  {
    label: "Assurance",
    destinations: [
      { label: "Media Operations", href: "/admin/media", icon: AudioLines },
      { label: "Compliance", href: "/admin/compliance", icon: ShieldCheck },
      { label: "Email operations", href: "/admin/notifications", icon: FileText },
      { label: "SEC Intelligence", href: "/admin/analytics", icon: FileText },
      { label: "Audit Log", href: "/admin/command/audit", icon: ClipboardList },
      { label: "System Health", href: "/admin/command/incidents", icon: Activity }
    ]
  }
];

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ user, children, capabilities=[],founder=false,financialAccess=false }: { user: SessionUser; children: ReactNode; capabilities?:string[];founder?:boolean;financialAccess?:boolean }) {
  const allowed=(href?:string)=>href==="/admin/accounting"?financialAccess:href==="/admin/dashboard"||capabilities.includes("full_admin")||(href?.startsWith("/admin/command/")&&(href.endsWith("/permissions")?founder:capabilities.includes(href.split("/").at(-1)||"")));
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const rail = useRef<HTMLElement>(null);

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => closeButton.current?.focus());
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
      if (event.key !== "Tab" || !rail.current) return;
      const focusables = Array.from(rail.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled])'));
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    }
    function handleResize() {
      if (window.innerWidth > 820) setMenuOpen(false);
    }
    window.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
    };
  }, [menuOpen]);

  return (
    <div className={styles.shell}>
      <a className={styles.skip} href="#admin-main">Skip to Admin content</a>
      {menuOpen ? <button className={styles.backdrop} type="button" aria-label="Close Admin navigation" onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }} /> : null}
      <aside
        ref={rail}
        id="admin-navigation"
        className={`${styles.rail} ${menuOpen ? styles.open : ""}`}
        aria-label="Admin navigation"
        role={menuOpen ? "dialog" : undefined}
        aria-modal={menuOpen ? "true" : undefined}
        aria-hidden={menuOpen ? undefined : false}
      >
        <div className={styles.railBrand}>
          <div className={styles.railBrandTop}>
            <Link href="/" aria-label="The Sync Exchange home" onClick={() => setMenuOpen(false)}>
              <Image src="/brand/the-sync-exchange/logos/website-header-horizontal-dark-transparent.png" alt="The Sync Exchange" width={1200} height={400} priority className={styles.logo} />
            </Link>
            <button ref={closeButton} className={styles.close} type="button" aria-label="Close Admin navigation" onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }}><X size={20} /></button>
          </div>
          <p>Admin operations</p>
        </div>
        <nav aria-label="Admin destinations" className={styles.nav}>
          {groups.map((group) => (
            <div className={styles.navGroup} key={group.label}>
              <h2>{group.label}</h2>
              {group.destinations.filter(d=>allowed(d.href)).map(({ label, href, icon: Icon }) => href ? (
                <Link key={label} href={href} onClick={() => setMenuOpen(false)} aria-current={isCurrent(pathname, href) ? "page" : undefined} className={`${styles.navLink} ${isCurrent(pathname, href) ? styles.selected : ""}`}>
                  <Icon size={17} aria-hidden="true" /><span>{label}</span>
                </Link>
              ) : (
                <span key={label} className={styles.planned} aria-label={`${label}, planned`}>
                  <Icon size={17} aria-hidden="true" /><span>{label}</span><small>Planned</small>
                </span>
              ))}
            </div>
          ))}
        </nav>
        <div className={styles.railFooter}><span className={styles.railDot} /> Admin workspace · audited operations</div>
      </aside>
      <div className={styles.workspace}>
        <header className={styles.topbar}>
          <div className={styles.topLeft}>
            <button ref={menuButton} className={styles.menuButton} type="button" aria-label="Open Admin navigation" aria-controls="admin-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={20} /></button>
            <Link className={styles.mobileBrand} href="/" aria-label="The Sync Exchange home"><BrandLogo className="!w-[124px]" /></Link>
            <span className={styles.context}>The Sync Exchange <span aria-hidden="true">/</span> Admin operations</span>
          </div>
          <div className={styles.topActions}>
            <span className={styles.identity} title={user.fullName}>{user.fullName}<small>Admin</small></span>
            <Link href="/account/security" className={styles.logout}>Account security</Link>
            <ThemeToggle className={styles.themeButton} />
            <form action={logoutAction}><button className={styles.logout} type="submit" aria-label="Log out"><LogOut size={16} aria-hidden="true" /><span>Log out</span></button></form>
          </div>
        </header>
        <main id="admin-main" className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
