'use client';

import { Button, CurrencyInput, FormField, Select } from '@sovereignfs/ui';
import { startTransition, useActionState, useState } from 'react';
import { createCurrency, createIncome } from '../actions';
import type { ActionResult } from '../_lib/action-result';
import type { IncompleteSetupStatus } from '../_lib/setup-status';
import { CategoriesStep } from './CategoriesStep';
import { ReadyStep } from './ReadyStep';
import styles from './SetupWizard.module.css';

export const CURRENCY_OPTIONS: Array<{ code: string; name: string }> = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'LKR', name: 'Sri Lankan Rupee' },
  { code: 'AED', name: 'UAE Dirham' },
];

function Progress({ step }: { step: 1 | 2 | 3 }) {
  return (
    <>
      <div className={styles.progress}>
        {[1, 2, 3].map((n) => (
          <div key={n} className={n <= step ? `${styles.segment} ${styles.segmentFilled}` : styles.segment} />
        ))}
      </div>
      <p className={styles.stepLabel}>Step {step} of 3</p>
    </>
  );
}

function CurrencyStep({ onNext }: { onNext: (code: string) => void }) {
  const [code, setCode] = useState('EUR');
  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createCurrency({ code, isBase: true });
    if (result.ok) onNext(code);
    return result;
  }, null);

  return (
    <>
      <Progress step={1} />
      <h1 className={styles.headline}>What&apos;s your base currency?</h1>
      <p className={styles.subtext}>
        This is the currency your budget and reports will show totals in.
      </p>
      <div className={styles.fields}>
        <FormField label="Base currency">
          {(field) => (
            <Select {...field} value={code} onChange={(e) => setCode(e.target.value)}>
              {CURRENCY_OPTIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </Select>
          )}
        </FormField>
      </div>
      {state && !state.ok && <p className={styles.feedbackError}>{state.error}</p>}
      <div className={styles.actions}>
        <Button onClick={() => startTransition(() => dispatch(undefined))} loading={pending} disabled={pending}>
          Continue
        </Button>
        <p className={styles.subtext}>You can add more currencies anytime from Settings.</p>
      </div>
    </>
  );
}

function IncomeStep({
  currencyCode,
  onBack,
  onNext,
}: {
  currencyCode: string;
  onBack: () => void;
  onNext: (amountMinor: number) => void;
}) {
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const result = await createIncome({
      label: 'Primary income',
      amountMinor: amountCents ?? 0,
      currency: currencyCode,
      kind: 'primary',
    });
    if (result.ok && amountCents !== null) onNext(amountCents);
    return result;
  }, null);

  const canContinue = amountCents !== null && amountCents > 0;

  return (
    <>
      <Progress step={2} />
      <h1 className={styles.headline}>What&apos;s your primary monthly income?</h1>
      <p className={styles.subtext}>
        Your main paycheck or salary, after tax. Add more income sources anytime.
      </p>
      <div className={styles.fields}>
        <FormField label={`Amount (${currencyCode})`}>
          {(field) => (
            <CurrencyInput
              {...field}
              valueCents={amountCents}
              onValueChange={setAmountCents}
              placeholder="0.00"
            />
          )}
        </FormField>
      </div>
      {state && !state.ok && <p className={styles.feedbackError}>{state.error}</p>}
      <div className={styles.actions}>
        <Button onClick={() => startTransition(() => dispatch(undefined))} loading={pending} disabled={pending || !canContinue}>
          Continue
        </Button>
        <Button variant="ghost" className={styles.backLink} onClick={onBack} disabled={pending}>
          ← Back
        </Button>
      </div>
    </>
  );
}

type Step = 1 | 2 | 3 | 4;

export function SetupWizard({ initialStatus }: { initialStatus: IncompleteSetupStatus }) {
  // Snapshot on mount, deliberately ignoring subsequent prop updates — see
  // page.tsx's own doc comment for why this must survive an incidental
  // mid-wizard server refresh.
  const [frozen] = useState(initialStatus);
  const [step, setStep] = useState<Step>(frozen.step);
  const [currencyCode, setCurrencyCode] = useState(frozen.baseCurrencyCode ?? 'EUR');
  const [incomeAmountMinor, setIncomeAmountMinor] = useState<number | null>(null);
  const [createdCategoryNames, setCreatedCategoryNames] = useState<string[]>([]);

  return (
    <div className={styles.page}>
      <div className={styles.wordmark}>Ledger</div>
      <div className={styles.column}>
        {step === 1 && (
          <CurrencyStep
            onNext={(code) => {
              setCurrencyCode(code);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <IncomeStep
            currencyCode={currencyCode}
            onBack={() => setStep(1)}
            onNext={(amountMinor) => {
              setIncomeAmountMinor(amountMinor);
              setStep(3);
            }}
          />
        )}
        {step === 3 && (
          <CategoriesStep
            currencyCode={currencyCode}
            onBack={() => setStep(2)}
            onNext={(names) => {
              setCreatedCategoryNames(names);
              setStep(4);
            }}
          />
        )}
        {step === 4 && (
          <ReadyStep
            currencyCode={currencyCode}
            incomeAmountMinor={incomeAmountMinor}
            categoryNames={createdCategoryNames}
            onGoToLedger={() => {
              // Hard reload rather than router.push/replace to the same
              // pathname: guarantees a genuinely fresh server render of
              // page.tsx's status check (now complete) with zero risk of
              // Next's client router cache serving a stale RSC payload from
              // before the wizard's last write — a one-time transition, not
              // a hot path, so the reload cost is a non-issue.
              window.location.href = '/ledger';
            }}
          />
        )}
      </div>
    </div>
  );
}
