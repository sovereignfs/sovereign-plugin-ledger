'use client';

import type { ReactNode } from 'react';
import { BalanceChip, Icon } from '@sovereignfs/ui';
import { formatMoney } from '../_lib/format';
import type { AccountsData } from '../_lib/accounts';
import { AccountsDetail } from './AccountsDetail';
import type { SelectedItem, SelectedItemType } from './AccountsView';
import { MobileSettingsLink } from './MobileSettingsLink';
import styles from './Mobile.module.css';

function Row({
  name,
  subtitle,
  value,
  onSelect,
}: {
  name: string;
  subtitle?: string;
  value: string;
  onSelect: () => void;
}) {
  return (
    <button type="button" className={styles.row} onClick={onSelect}>
      <span className={styles.rowText}>
        <span className={styles.rowTitle}>{name}</span>
        {subtitle && <span className={styles.rowSubtitle}>{subtitle}</span>}
      </span>
      <span className={styles.rowValue}>
        {value}
        <Icon name="chevron-right" size="sm" aria-hidden />
      </span>
    </button>
  );
}

function Section({
  label,
  onAdd,
  children,
}: {
  label: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section>
      <div className={styles.sectionHeader}>
        <p className={styles.sectionTitle}>{label}</p>
        <button
          type="button"
          className={styles.sectionAddButton}
          onClick={onAdd}
          aria-label={`Add ${label.toLowerCase()}`}
        >
          <Icon name="plus" size="sm" aria-hidden />
        </button>
      </div>
      {children}
    </section>
  );
}

/**
 * mobile-fork.md screen 4-5 — same unified net-worth list + drill-down
 * shape as `MobileBudgetScreen`. The detail screen reuses `AccountsDetail`
 * verbatim (it's already a plain content block, no desktop-only width
 * assumption), behind the same hand-rolled `‹ Accounts` back header.
 */
export function MobileAccountsScreen({
  data,
  selected,
  onSelect,
  onBack,
  onAddAccount,
  onAddAsset,
  onAddDeposit,
  onAddLoan,
  onAddPerson,
}: {
  data: AccountsData;
  selected: SelectedItem;
  onSelect: (item: SelectedItem) => void;
  onBack: () => void;
  onAddAccount: () => void;
  onAddAsset: () => void;
  onAddDeposit: () => void;
  onAddLoan: () => void;
  onAddPerson: () => void;
}) {
  if (selected) {
    return (
      <div className={styles.screen}>
        <div className={styles.backHeader}>
          <button type="button" className={styles.backButton} onClick={onBack}>
            <Icon name="chevron-left" size="sm" aria-hidden />
            Accounts
          </button>
        </div>
        <AccountsDetail
          key={`${selected.type}:${selected.id}`}
          data={data}
          selected={selected}
          onDeselect={onBack}
        />
      </div>
    );
  }

  function select(type: SelectedItemType, id: string) {
    onSelect({ type, id });
  }

  return (
    <div className={styles.screen}>
      <div className={styles.titleRow}>
        <div>
          <h1 className={styles.title}>Accounts</h1>
          <p className={styles.subtitle}>{formatMoney(data.netWorthMinor, data.baseCurrencyCode)} net worth</p>
        </div>
        <MobileSettingsLink />
      </div>

      <Section label="Banking" onAdd={onAddAccount}>
        {data.banking.length === 0 ? (
          <p className={styles.emptyState}>No bank accounts yet.</p>
        ) : (
          data.banking.map((a) => (
            <Row
              key={a.id}
              name={a.name}
              subtitle={a.institution ?? undefined}
              value={formatMoney(a.balanceMinor, a.currency)}
              onSelect={() => select('account', a.id)}
            />
          ))
        )}
      </Section>

      <Section label="Credit cards" onAdd={onAddAccount}>
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
              onSelect={() => select('account', a.id)}
            />
          ))
        )}
      </Section>

      <Section label="Assets" onAdd={onAddAsset}>
        {data.assets.length === 0 ? (
          <p className={styles.emptyState}>No assets yet.</p>
        ) : (
          data.assets.map((a) => (
            <Row
              key={a.id}
              name={a.name}
              value={formatMoney(a.valueMinor, a.currency)}
              onSelect={() => select('asset', a.id)}
            />
          ))
        )}
      </Section>

      <Section label="Deposits" onAdd={onAddDeposit}>
        {data.deposits.length === 0 ? (
          <p className={styles.emptyState}>No deposits yet.</p>
        ) : (
          data.deposits.map((d) => (
            <Row
              key={d.id}
              name={d.name}
              value={formatMoney(d.amountMinor, d.currency)}
              onSelect={() => select('deposit', d.id)}
            />
          ))
        )}
      </Section>

      <Section label="Loans" onAdd={onAddLoan}>
        {data.loans.length === 0 ? (
          <p className={styles.emptyState}>No loans yet.</p>
        ) : (
          data.loans.map((l) => (
            <Row
              key={l.id}
              name={l.name}
              value={`${formatMoney(l.remainingBalanceMinor, l.currency)} remaining`}
              onSelect={() => select('loan', l.id)}
            />
          ))
        )}
      </Section>

      <section>
        <div className={styles.sectionHeader}>
          <p className={styles.sectionTitle}>People</p>
          <button
            type="button"
            className={styles.sectionAddButton}
            onClick={onAddPerson}
            aria-label="Add person"
          >
            <Icon name="plus" size="sm" aria-hidden />
          </button>
        </div>
        {data.people.length === 0 ? (
          <p className={styles.emptyState}>No outstanding balances yet.</p>
        ) : (
          data.people.map((p) => (
            <button
              key={p.id}
              type="button"
              className={styles.row}
              onClick={() => select('person', p.id)}
            >
              <span className={styles.rowTitle}>{p.name}</span>
              <span className={styles.rowValue}>
                <BalanceChip amountCents={p.balanceMinor} currency={p.currency} />
                <Icon name="chevron-right" size="sm" aria-hidden />
              </span>
            </button>
          ))
        )}
      </section>
    </div>
  );
}
