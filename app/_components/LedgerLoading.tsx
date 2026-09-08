import { PageContainer, Spinner } from '@sovereignfs/ui';
import styles from '../ledger.module.css';

/**
 * The per-route `loading.tsx` body — every Ledger route blocks on its own
 * database payload before rendering, so a section switch otherwise showed
 * nothing at all until the server answered (SPEC.md's Data fetching
 * contract calls for a `loading.tsx` per route segment).
 */
export function LedgerLoading({ label }: { label: string }) {
  return (
    <PageContainer maxWidth="md">
      <div className={styles.centered}>
        <Spinner label={label} />
      </div>
    </PageContainer>
  );
}
