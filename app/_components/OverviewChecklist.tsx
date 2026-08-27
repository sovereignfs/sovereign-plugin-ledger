import { Icon } from '@sovereignfs/ui';
import type { OverviewChecklistItem } from '../_lib/overview';
import styles from './Overview.module.css';

/**
 * web-shell.md screen 2 — replaces the dashboard until the user has logged
 * at least one expense (OverviewView.tsx's own doc comment explains why
 * that's the signal this task uses). "+ Add expense" living in the sidebar,
 * not this card, is what stays live from the very first screen.
 */
export function OverviewChecklist({ items }: { items: OverviewChecklistItem[] }) {
  return (
    <div className={styles.checklistPage}>
      <h1 className={styles.checklistHeadline}>Let&apos;s get your budget going</h1>
      <p className={styles.checklistSubtext}>
        You&apos;re already set up with a base currency and a first income — everything else here
        can be added anytime.
      </p>

      <div className={styles.checklistCard}>
        {items.map((item) => (
          <div key={item.key} className={styles.checklistRow}>
            <span
              className={item.done ? styles.checklistDot : styles.checklistDotPending}
              aria-hidden
            >
              {item.done && <Icon name="check" size="xs" aria-hidden />}
            </span>
            <span className={styles.checklistLabel}>{item.label}</span>
            {item.detail && <span className={styles.checklistDetail}>{item.detail}</span>}
            {item.comingSoon && <span className={styles.checklistSoon}>Coming soon</span>}
          </div>
        ))}
      </div>

      <p className={styles.checklistFooter}>
        Start tracking expenses right now with the button above — finishing this list just gives
        you a fuller picture.
      </p>
    </div>
  );
}
