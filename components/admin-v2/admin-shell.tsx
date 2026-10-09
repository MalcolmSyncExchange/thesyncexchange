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
      { label: "Action Center", href: "/admin/action-center", icon: Activity },
      { label: "Review Queue", href: "/admin/review-queue", icon: ClipboardList },
      { label: "Catalog & Tracks", href: "/admin/tracks", icon: AudioLines },
      { label: "Trusted Artists", icon: ShieldCheck }
    ]
  },
  {
    label: "People + commerce",
    destinations: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Admin Access", icon: ShieldCheck },
      { label: "Orders & Licenses", href: "/admin/orders", icon: BookOpenCheck },
      { label: "Refunds", icon: ArrowRight },
      { label: "Deals & Requests", icon: FileText },
      { label: "Conversations", icon: FileText },
      { label: "Integrity", icon: Flag },
      { label: "Suspensions", icon: ShieldCheck },
      { label: "Financial Overrides", icon: FileText }
    ]
  },
  {
    label: "Assurance",
    destinations: [
      { label: "Media Operations", icon: AudioLines },
      { label: "Compliance", href: "/admin/compliance", icon: ShieldCheck },
      { label: "Reports", href: "/admin/analytics", icon: FileText },
      { label: "Audit Log", icon: ClipboardList },
      { label: "System Health", icon: Activity }
    ]
  }
];

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({ user, children }: { user: SessionUser; children: ReactNode }) {
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
              {group.destinations.map(({ label, href, icon: Icon }) => href ? (
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
        <div className={styles.railFooter}><span className={styles.railDot} /> Admin workspace · read-only overview</div>
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
            <ThemeToggle className={styles.themeButton} />
            <form action={logoutAction}><button className={styles.logout} type="submit" aria-label="Log out"><LogOut size={16} aria-hidden="true" /><span>Log out</span></button></form>
          </div>
        </header>
        <main id="admin-main" className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
