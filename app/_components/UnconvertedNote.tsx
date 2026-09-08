import styles from './UnconvertedNote.module.css';

/**
 * "These amounts aren't in the total" — rendered wherever a base-currency
 * total had to leave something out because no exchange rate exists yet
 * (`ConvertedSum.unconvertedCurrencies`). A total that silently shrank
 * reads as a wrong number; one that says why reads as a pending one.
 * Renders nothing when there's nothing to say.
 */
export function UnconvertedNote({
  currencies,
  className,
}: {
  currencies: string[];
  className?: string;
}) {
  if (currencies.length === 0) return null;
  const list = currencies.join(', ');
  return (
    <p className={[styles.note, className].filter(Boolean).join(' ')} role="status">
      Amounts in {list} aren&apos;t included yet — no exchange rate is available for{' '}
      {currencies.length === 1 ? 'it' : 'them'}. Rates refresh daily.
    </p>
  );
}
