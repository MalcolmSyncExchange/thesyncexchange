import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import styles from "./first-use-state.module.css";

type FirstUseStateProps = {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  steps?: readonly { title: string; description: string }[];
  compact?: boolean;
};

/** An editorial first-use panel. All content comes from the caller's existing authorized state. */
export function FirstUseState({ icon: Icon, eyebrow, title, description, action, secondaryAction, steps, compact = false }: FirstUseStateProps) {
  return (
    <section className={`${styles.panel} ${!steps?.length ? styles.single : ""} ${compact ? styles.compact : ""}`} aria-label={eyebrow}>
      <div className={styles.intro}>
        <span className={styles.mark}><Icon aria-hidden="true" /></span>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h2>{title}</h2>
        <p className={styles.description}>{description}</p>
        {action || secondaryAction ? <div className={styles.actions}>{action}{secondaryAction}</div> : null}
      </div>
      {steps?.length ? <div className={styles.steps}>
        <p className={styles.stepsLabel}>What happens next</p>
        <ol>{steps.map((step, index) => <li key={step.title}>
          <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
          <div><h3>{step.title}</h3><p>{step.description}</p></div>
        </li>)}</ol>
      </div> : null}
    </section>
  );
}
