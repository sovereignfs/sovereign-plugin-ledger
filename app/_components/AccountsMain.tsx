import { BalanceChip, Icon, PageHeader } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { AccountsData } from '../_lib/accounts';
import styles from './Accounts.module.css';
import type { SelectedItem, SelectedItemType } from './AccountsView';

function SectionHeader({ label, onAdd }: { label: string; onAdd: () => void }) {
  return (
    <div className={styles.sectionHeader}>
      <p className={styles.sectionLabel}>{label}</p>
      <button type="button" className={styles.sectionAddButton} onClick={onAdd} aria-label={`Add ${label.toLowerCase()}`}>
        <Icon name="plus" size="sm" aria-hidden />
      </button>
    </div>
  );
}

function Row({
  name,
  subtitle,
  value,
  selected,
  onSelect,
}: {
  name: string;
  subtitle?: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={[styles.row, selected ? styles.rowSelected : ''].filter(Boolean).join(' ')}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span className={styles.rowName}>
        {name}
        {subtitle && <span className={styles.rowSubtitle}> • {subtitle}</span>}
      </span>
      <span className={styles.rowValue}>{value}</span>
    </button>
  );
}

/**
 * web-shell.md screen 4 — one unified net-worth list. Each section carries
 * its own "+" affordance rather than one combined "add" menu, since the
 * fields differ meaningfully per entity type (see the five separate create
 * dialogs).
 */
export function AccountsMain({
  data,
  selected,
  onSelect,
  onAddAccount,
  onAddAsset,
  onAddDeposit,
  onAddLoan,
  onAddPerson,
}: {
  data: AccountsData;
  selected: SelectedItem;
  onSelect: (item: SelectedItem) => void;
  onAddAccount: () => void;
  onAddAsset: () => void;
  onAddDeposit: () => void;
  onAddLoan: () => void;
  onAddPerson: () => void;
}) {
  function isSelected(type: SelectedItemType, id: string) {
    return selected?.type === type && selected.id === id;
  }

  return (
    <div className={styles.page}>
      <PageHeader title="Accounts" />
      <div className={styles.netWorth}>
        <span className={styles.statLabel}>Net worth</span>
        <span className={styles.netWorthValue}>
          {formatMoney(data.netWorthMinor, data.baseCurrencyCode)}
        </span>
      </div>

      <div className={styles.section}>
        <SectionHeader label="Banking" onAdd={onAddAccount} />
        {data.banking.length === 0 ? (
          <p className={styles.emptyState}>No bank accounts yet.</p>
        ) : (
          data.banking.map((a) => (
            <Row
              key={a.id}
              name={a.name}
              subtitle={a.institution ?? undefined}
              value={formatMoney(a.balanceMinor, a.currency)}
              selected={isSelected('account', a.id)}
              onSelect={() => onSelect({ type: 'account', id: a.id })}
            />
          ))
        )}
      </div>

      <div className={styles.section}>
        <SectionHeader label="Credit cards" onAdd={onAddAccount} />
        {data.creditCards.length === 0 ? (
          <p className={styles.emptyState}>No credit cards yet.</p>
        ) : (
          data.creditCards.map((a) => (
            <Row
              key={a.id}
              name={a.name}
              subtitle={a.institution ?? undefined}
              value={
                a.creditLimitMinor
                  ? `${formatMoney(a.balanceMinor, a.currency)} / ${formatMoney(a.creditLimitMinor, a.currency)}`
                  : formatMoney(a.balanceMinor, a.currency)
              }
              selected={isSelected('account', a.id)}
              onSelect={() => onSelect({ type: 'account', id: a.id })}
            />
          ))
        )}
      </div>

      <div className={styles.section}>
        <SectionHeader label="Assets" onAdd={onAddAsset} />
        {data.assets.length === 0 ? (
          <p className={styles.emptyState}>No assets yet.</p>
        ) : (
          data.assets.map((a) => (
            <Row
              key={a.id}
              name={a.name}
              value={formatMoney(a.valueMinor, a.currency)}
              selected={isSelected('asset', a.id)}
              onSelect={() => onSelect({ type: 'asset', id: a.id })}
            />
          ))
        )}
      </div>

      <div className={styles.section}>
        <SectionHeader label="Deposits" onAdd={onAddDeposit} />
        {data.deposits.length === 0 ? (
          <p className={styles.emptyState}>No deposits yet.</p>
        ) : (
          data.deposits.map((d) => (
            <Row
              key={d.id}
              name={d.name}
              value={formatMoney(d.amountMinor, d.currency)}
              selected={isSelected('deposit', d.id)}
              onSelect={() => onSelect({ type: 'deposit', id: d.id })}
            />
          ))
        )}
      </div>

      <div className={styles.section}>
        <SectionHeader label="Loans" onAdd={onAddLoan} />
        {data.loans.length === 0 ? (
          <p className={styles.emptyState}>No loans yet.</p>
        ) : (
          data.loans.map((l) => (
            <Row
              key={l.id}
              name={l.name}
              value={`${formatMoney(l.remainingBalanceMinor, l.currency)} remaining`}
              selected={isSelected('loan', l.id)}
              onSelect={() => onSelect({ type: 'loan', id: l.id })}
            />
          ))
        )}
      </div>

      <div className={styles.section}>
        <SectionHeader label="People" onAdd={onAddPerson} />
        {data.people.length === 0 ? (
          <p className={styles.emptyState}>No outstanding balances yet.</p>
        ) : (
          data.people.map((p) => (
            <button
              key={p.id}
              type="button"
              className={[styles.row, isSelected('person', p.id) ? styles.rowSelected : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSelect({ type: 'person', id: p.id })}
              aria-pressed={isSelected('person', p.id)}
            >
              <span className={styles.rowName}>{p.name}</span>
              <BalanceChip amountCents={p.balanceMinor} currency={p.currency} />
            </button>
          ))
        )}
      </div>
    </div>
  );
}
