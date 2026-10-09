"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { CreditCard, Heart, ReceiptText, Search, Settings, Home, LogOut, Menu, Music2, Upload, UserRound, Users, X } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-assets";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { logoutAction } from "@/services/auth/actions";
import type { SessionUser } from "@/types/models";
import styles from "./artist-workspace-shell.module.css";

const artistNavigation = [
  { href: "/artist/dashboard", label: "Overview", icon: Home },
  { href: "/artist/catalog", label: "My catalog", icon: Music2 },
  { href: "/artist/submit", label: "Submit music", icon: Upload },
  { href: "/artist/rights-holders", label: "Rights holders", icon: Users },
  { href: "/artist/payout-settings", label: "Payout settings", icon: CreditCard }
];

const buyerNavigation = [
  { href: "/buyer/dashboard", label: "Overview", icon: Home },
  { href: "/buyer/catalog", label: "Discover music", icon: Search },
  { href: "/buyer/favorites", label: "Saved tracks", icon: Heart },
  { href: "/buyer/orders", label: "My Purchases", icon: ReceiptText },
  { href: "/buyer/settings", label: "Account settings", icon: Settings }
];
type WorkspaceKind = "artist" | "buyer";

function Navigation({ pathname, onNavigate, kind }: { pathname: string; onNavigate: () => void; kind: WorkspaceKind }) {
    const navigation = kind === "artist" ? artistNavigation : buyerNavigation;
    return <nav aria-label={`${kind === "artist" ? "Artist" : "Buyer"} workspace`} className={styles.navigation}>
      {navigation.map(({ href, label, icon: Icon }) => <Link
        key={href}
        href={href}
        aria-current={pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined}
        onClick={onNavigate}
      ><Icon aria-hidden="true" size={23} strokeWidth={1.7} /><span>{label}</span></Link>)}
    </nav>;
  }

function AccountLinks({ pathname, onNavigate, kind }: { pathname: string; onNavigate: () => void; kind: WorkspaceKind }) {
    return <div className={styles.accountLinks}>
      {kind === "artist" ? <Link href="/artist/profile" onClick={onNavigate} aria-current={pathname === "/artist/profile" ? "page" : undefined}><UserRound aria-hidden="true" size={20} />Profile</Link> : null}
      <form action={logoutAction}><button type="submit"><LogOut aria-hidden="true" size={20} />Log out</button></form>
    </div>;
  }

function WorkspaceShell({ user, children, kind }: { user: SessionUser; children: ReactNode; kind: WorkspaceKind }) {
  const label = kind === "artist" ? "Artist workspace" : "Buyer workspace";
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const initials = user.fullName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("");
  const closeMenu = () => setMenuOpen(false);
  return <div className={styles.shell}>
    <a href={`#${kind}-main`} className={styles.skipLink}>Skip to content</a>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.logo}><BrandLogo priority /></Link>
      <Navigation pathname={pathname} onNavigate={closeMenu} kind={kind} />
      <AccountLinks pathname={pathname} onNavigate={closeMenu} kind={kind} />
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}>
        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Trigger className={styles.menuButton} aria-label={`Open ${kind} navigation`}><Menu aria-hidden="true" /></Dialog.Trigger>
          <Dialog.Overlay className={styles.overlay} />
          <Dialog.Content className={styles.mobileMenu} aria-describedby={undefined}>
            <div className={styles.mobileMenuHeading}><Dialog.Title>{label}</Dialog.Title><Dialog.Close className={styles.iconButton} aria-label={`Close ${kind} navigation`}><X aria-hidden="true" /></Dialog.Close></div>
            <Navigation pathname={pathname} onNavigate={closeMenu} kind={kind} />
            <AccountLinks pathname={pathname} onNavigate={closeMenu} kind={kind} />
          </Dialog.Content>
        </Dialog.Root>
        <Link href="/" className={styles.mobileBrand} aria-label="The Sync Exchange home"><BrandLogo priority alt="" /></Link>
        <span className={styles.workspaceLabel}>{label}</span>
        <ThemeToggle className={styles.themeToggle} />
        <DropdownMenu.Root>
          <DropdownMenu.Trigger className={styles.identity} aria-label={`Open account menu for ${user.fullName}`}>
            <span className={styles.avatar} aria-hidden="true">{initials}</span>
            <span className={styles.name}>{user.fullName}</span>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={10} collisionPadding={12} className={styles.accountMenu}>
              <DropdownMenu.Label className={styles.accountMenuLabel}>{label}</DropdownMenu.Label>
              <DropdownMenu.Item asChild><Link href={`/${kind}/dashboard`}>Dashboard</Link></DropdownMenu.Item>
              <DropdownMenu.Item asChild><Link href={kind === "artist" ? "/artist/profile" : "/buyer/settings#account-profile"}>Profile</Link></DropdownMenu.Item>
              <DropdownMenu.Item asChild><Link href={kind === "artist" ? "/artist/payout-settings" : "/buyer/settings"}>{kind === "artist" ? "Payout settings" : "Settings"}</Link></DropdownMenu.Item>
              <DropdownMenu.Item asChild><Link href={kind === "artist" ? "/artist/catalog" : "/buyer/orders"}>{kind === "artist" ? "Catalog" : "My Purchases"}</Link></DropdownMenu.Item>
              {kind === "buyer" ? <DropdownMenu.Item asChild><Link href="/buyer/settings#account-notifications">Notification preferences</Link></DropdownMenu.Item> : null}
              <DropdownMenu.Item asChild><Link href="/contact">Help</Link></DropdownMenu.Item>
              <DropdownMenu.Separator className={styles.accountMenuSeparator} />
              <form action={logoutAction}>
                <DropdownMenu.Item asChild onSelect={event => event.preventDefault()}>
                  <button type="submit"><LogOut aria-hidden="true" size={18} />Log out</button>
                </DropdownMenu.Item>
              </form>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>
      <main id={`${kind}-main`} tabIndex={-1} className={styles.main}>{children}</main>
    </div>
  </div>;
}

export function ArtistWorkspaceShell(props: { user: SessionUser; children: ReactNode }) {
  return <WorkspaceShell {...props} kind="artist" />;
}

export function BuyerWorkspaceShell(props: { user: SessionUser; children: ReactNode }) {
  return <WorkspaceShell {...props} kind="buyer" />;
}
