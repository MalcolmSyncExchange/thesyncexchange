import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/layout/brand-assets";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import surface from "@/components/layout/sync-surface.module.css";
import styles from "@/components/forms/auth-form.module.css";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className={surface.surface}>
    <header className={styles.siteHeader}><Link href="/" aria-label="The Sync Exchange home"><BrandLogo priority /></Link><div><Link href="/">Back to site</Link><ThemeToggle /></div></header>
    <main className={styles.main}>{children}</main>
    <footer className={styles.footer}><Link href="/terms">Terms of use</Link><Link href="/privacy">Privacy policy</Link><Link href="/contact">Need help?</Link></footer>
  </div>;
}
