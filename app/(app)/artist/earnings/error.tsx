"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import styles from "@/components/finance/artist-finances.module.css";

export default function EarningsError({ reset }: { reset: () => void }) {
  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div><h1>Finances</h1><p>Track your licensing earnings and download statements.</p></div>
      </header>
      <section className={styles.loadError} aria-labelledby="earnings-unavailable">
        <span className={styles.iconTile}><AlertCircle aria-hidden="true" /></span>
        <h2 id="earnings-unavailable">Financial activity is temporarily unavailable</h2>
        <p>Try again to reload your account’s earnings and activity.</p>
        <button className={styles.outlineButton} type="button" onClick={reset}>
          <RefreshCw aria-hidden="true" /> Try again
        </button>
      </section>
    </div>
  );
}
