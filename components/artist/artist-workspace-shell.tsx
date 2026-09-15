"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { CreditCard, Home, LogOut, Menu, Music2, Upload, UserRound, Users, X } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-assets";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { logoutAction } from "@/services/auth/actions";
import type { SessionUser } from "@/types/models";
import styles from "./artist-workspace-shell.module.css";

const navigation = [
  { href: "/artist/dashboard", label: "Overview", icon: Home },
  { href: "/artist/catalog", label: "My catalog", icon: Music2 },
  { href: "/artist/submit", label: "Submit music", icon: Upload },
  { href: "/artist/rights-holders", label: "Rights holders", icon: Users },
  { href: "/artist/payout-settings", label: "Payout settings", icon: CreditCard }
];

function Navigation({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
    return <nav aria-label="Artist workspace" className={styles.navigation}>
      {navigation.map(({ href, label, icon: Icon }) => <Link
        key={href}
        href={href}
        aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
        onClick={onNavigate}
      ><Icon aria-hidden="true" size={23} strokeWidth={1.7} /><span>{label}</span></Link>)}
    </nav>;
  }

function AccountLinks({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
    return <div className={styles.accountLinks}>
      <Link href="/artist/profile" onClick={onNavigate} aria-current={pathname === "/artist/profile" ? "page" : undefined}><UserRound aria-hidden="true" size={20} />Profile</Link>
      <form action={logoutAction}><button type="submit"><LogOut aria-hidden="true" size={20} />Log out</button></form>
    </div>;
  }

export function ArtistWorkspaceShell({ user, children }: { user: SessionUser; children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("");
  const closeMenu = () => setMenuOpen(false);
  return <div className={styles.shell}>
    <a href="#artist-main" className={styles.skipLink}>Skip to content</a>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.logo}><BrandLogo priority /></Link>
      <Navigation pathname={pathname} onNavigate={closeMenu} />
      <AccountLinks pathname={pathname} onNavigate={closeMenu} />
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger className={styles.menuButton} aria-label="Open artist navigation"><Menu aria-hidden="true" /></Dialog.Trigger>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.mobileMenu} aria-describedby={undefined}>
            <div className={styles.mobileMenuHeading}><Dialog.Title>Artist workspace</Dialog.Title><Dialog.Close className={styles.iconButton} aria-label="Close artist navigation"><X aria-hidden="true" /></Dialog.Close></div>
            <Navigation pathname={pathname} onNavigate={closeMenu} />
            <AccountLinks pathname={pathname} onNavigate={closeMenu} />
          </Dialog.Content>
        </Dialog.Root>
        <span className={styles.workspaceLabel}>Artist workspace</span>
        <ThemeToggle className={styles.themeToggle} />
        <Link href="/artist/profile" className={styles.identity} aria-label={`View profile for ${user.fullName}`}>
          <span className={styles.avatar} aria-hidden="true">{initials}</span>
          <span className={styles.name}>{user.fullName}</span>
        </Link>
      </header>
      <main id="artist-main" tabIndex={-1} className={styles.main}>{children}</main>
    </div>
  </div>;
}
