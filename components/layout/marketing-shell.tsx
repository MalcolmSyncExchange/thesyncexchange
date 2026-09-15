import type { ReactNode } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import styles from "./sync-surface.module.css";

export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className={`${styles.surface} flex flex-col`}>
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
