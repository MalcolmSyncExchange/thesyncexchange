import styles from "@/components/finance/command-center/dashboard.module.css";
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Loading financial command center"
      aria-busy="true"
    >
      <div className={styles.loadingTitle} />
      <div className={styles.loadingGrid}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className={styles.skeleton} />
        ))}
      </div>
      <p className="mt-5 text-sm text-muted-foreground">
        Loading private financial records…
      </p>
    </div>
  );
}
