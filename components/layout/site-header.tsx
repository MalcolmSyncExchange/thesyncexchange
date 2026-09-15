"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, Menu, X } from "lucide-react";
import { BrandLogo } from "@/components/layout/brand-assets";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import styles from "./site-header.module.css";

const links = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
  { href: "/for-artists", label: "For artists" },
  { href: "/for-buyers", label: "For buyers" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" }
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <header className={styles.header}>
    <div className={styles.inner}>
      <Link href="/" className={styles.logo}><BrandLogo priority /></Link>
      <nav className={styles.desktopNav} aria-label="Primary navigation">
        {links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined}>{link.label}</Link>)}
      </nav>
      <div className={styles.actions}>
        <ThemeToggle />
        <Link href="/login" className={styles.login}>Log in</Link>
        <Button asChild className="min-h-11"><Link href="/signup">Get started<ArrowRight aria-hidden="true" className="h-4 w-4" /></Link></Button>
      </div>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger className={styles.menuButton} aria-label="Open menu"><Menu aria-hidden="true" /></Dialog.Trigger>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content className={styles.menu} aria-describedby={undefined}>
          <div className={styles.menuHeading}><Dialog.Title>Explore The Sync Exchange</Dialog.Title><Dialog.Close aria-label="Close menu"><X aria-hidden="true" /></Dialog.Close></div>
          <nav aria-label="Mobile primary navigation">{links.map(link => <Link key={link.href} href={link.href} aria-current={pathname === link.href ? "page" : undefined} onClick={()=>setOpen(false)}>{link.label}<ArrowRight aria-hidden="true" size={18} /></Link>)}</nav>
          <div className={styles.mobileActions}>
            <ThemeToggle />
            <Link href="/login" onClick={()=>setOpen(false)}>Log in</Link>
            <Button asChild className="min-h-11"><Link href="/signup" onClick={()=>setOpen(false)}>Get started</Link></Button>
          </div>
        </Dialog.Content>
      </Dialog.Root>
    </div>
  </header>;
}
