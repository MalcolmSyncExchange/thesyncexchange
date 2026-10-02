"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Menu, X } from "lucide-react";
import { BrandHeaderLogo } from "@/components/layout/brand-assets";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import styles from "./site-header.module.css";

const links = [
  { href: "/discover", label: "Discover" },
  { href: "/for-buyers", label: "For Buyers" },
  { href: "/for-artists", label: "For Artists" },
  { href: "/how-it-works", label: "How It Works" }
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <header className={styles.header}>
    <div className={styles.inner}>
      <Link href="/" className={styles.logo}><BrandHeaderLogo priority /></Link>
      <nav className={styles.desktopNav} aria-label="Primary navigation">
        {links.map(link => <Link className={styles.navLink} key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>)}
      </nav>
      <div className={styles.actions}>
        <ThemeToggle className={styles.themeToggle} />
        <Link href="/login" className={styles.login}>Log in</Link>
        <Button asChild className={styles.signup}><Link href="/signup">Sign up<ArrowRight aria-hidden="true" className={`${styles.signupArrow} h-4 w-4`} /></Link></Button>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className={styles.menuButton} aria-label="Open menu"><Menu aria-hidden="true" /></Dialog.Trigger>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.menu} aria-describedby={undefined}>
          <div className={styles.menuHeading}><Dialog.Title>Explore The Sync Exchange</Dialog.Title><Dialog.Close aria-label="Close menu"><X aria-hidden="true" /></Dialog.Close></div>
          <nav aria-label="Mobile primary navigation">{links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={()=>setOpen(false)}>{link.label}<ArrowRight aria-hidden="true" size={18} /></Link>)}</nav>
          <div className={styles.mobileActions}>
            <ThemeToggle className={styles.themeToggle} />
            <Link className={styles.mobileLogin} href="/login" onClick={()=>setOpen(false)}>Log in</Link>
            <Button asChild className={styles.mobileSignup}><Link href="/signup" onClick={()=>setOpen(false)}>Sign up</Link></Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  </header>;
}
