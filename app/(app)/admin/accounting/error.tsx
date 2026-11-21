"use client";
import Link from "next/link";
import styles from "@/components/finance/command-center/dashboard.module.css";
export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <section role="alert" className={styles.error}>
      <h2>Financial reporting is unavailable</h2>
      <p>
        We could not verify reporting access or load complete financial records.
        No balances or empty history have been inferred. Retry, or check your
        account security and reporting availability.
      </p>
      <button className={styles.primaryButton} onClick={reset}>
        Try again
      </button>
      <Link href="/account/security">Account security</Link>
    </section>
  );
}
