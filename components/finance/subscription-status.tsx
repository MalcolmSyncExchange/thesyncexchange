import { CreditCard } from "lucide-react";
import styles from "./artist-finances.module.css";

export function SubscriptionStatus() {
  return (
    <section className={styles.accountCard} aria-labelledby="subscription-status">
      <div className={styles.iconTile}><CreditCard aria-hidden="true" /></div>
      <div>
        <h2 id="subscription-status">Subscription</h2>
        <p>Recurring billing is unavailable. A paid subscription has not been verified for this account.</p>
        <details className={styles.planDetails}>
          <summary>View plan prices</summary>
          <dl>
            <div><dt>Pro</dt><dd>USD 19.99 / month</dd></div>
            <div><dt>Teams</dt><dd>USD 49.99 / month</dd></div>
          </dl>
          <p>Administrative access grants are separate from paid plans.</p>
        </details>
      </div>
    </section>
  );
}
