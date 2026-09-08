'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import {
  Button,
  CurrencyInput,
  DatePicker,
  Dialog,
  Drawer,
  EmptyState,
  FormField,
  Input,
  Select,
  Spinner,
  Toggle,
  useIsMobile,
} from '@sovereignfs/ui';
import { createJarTransaction, createTransaction, getExpenseFormOptions } from '../actions';
import type { ExpenseFormCategoryOption, ExpenseFormJarOption } from '../actions';
import { fail, type ActionResult } from '../_lib/action-result';
import { utcNoonOf } from '../_lib/period';
import styles from './AddExpenseDialog.module.css';

/**
 * web-shell.md screen 6 (`Dialog size="md"`) and mobile-fork.md screen 8
 * (`Drawer`, `snapHeight="content"`) — one component, one form, forking
 * only the surrounding overlay via `useIsMobile()`. Rendered from both
 * `LedgerSidebar` (desktop) and `AddExpenseFab` (mobile) so "+ Add expense"
 * works from any page under the shell, which is also why its category/kind
 * options are fetched lazily here via `getExpenseFormOptions` rather than
 * preloaded by a specific page.
 *
 * No `useCommitOnEnterOrBlur` on amount/note: this dialog has its own
 * always-visible "Add expense" submit button, the documented exception in
 * CLAUDE.md's quick-entry-input rule.
 *
 * No currency picker: a transaction's currency is always its
 * subcategory's own (`createTransaction` derives it server-side), so the
 * selected subcategory's currency is shown read-only in the amount label.
 *
 * The chosen day is sent as UTC noon of that calendar day (`utcNoonOf`),
 * never local midnight — local midnight on the 1st is still the previous
 * month in UTC for anyone east of Greenwich, which put expenses in the
 * wrong month's budget and report (see `period.ts`).
 *
 * **"Fund from a saving jar" (L.12)** — toggling it on swaps
 * Category+Subcategory for a single "Saving jar" `Select`; submitting then
 * calls `createJarTransaction` (a signed withdrawal) instead of
 * `createTransaction` — never both (SPEC.md's Data model correction #3).
 */
export function AddExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const [categories, setCategories] = useState<ExpenseFormCategoryOption[] | null>(null);
  const [jars, setJars] = useState<ExpenseFormJarOption[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [kindId, setKindId] = useState('');
  const [fundFromJar, setFundFromJar] = useState(false);
  const [jarId, setJarId] = useState('');
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [date, setDate] = useState<Date>(() => new Date());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setCategories(null);
    setJars([]);
    setFundFromJar(false);
    setAmountCents(null);
    setDate(new Date());
    setNote('');
    getExpenseFormOptions().then((result) => {
      if (cancelled) return;
      setCategories(result.categories);
      setJars(result.jars);
      const firstCategory = result.categories[0];
      setCategoryId(firstCategory?.id ?? '');
      setKindId(firstCategory?.kinds[0]?.id ?? '');
      setJarId(result.jars[0]?.id ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedCategory = categories?.find((c) => c.id === categoryId) ?? null;
  const selectedKind = selectedCategory?.kinds.find((k) => k.id === kindId) ?? null;
  const selectedJar = jars.find((j) => j.id === jarId) ?? null;

  const [state, dispatch, pending] = useActionState<ActionResult | null, undefined>(async () => {
    const occurredAt = utcNoonOf(date);
    const result = fundFromJar
      ? !selectedJar
        ? fail('Choose a saving jar.')
        : await createJarTransaction({
            jarId: selectedJar.id,
            amountMinor: -(amountCents ?? 0),
            occurredAt,
            note: note.trim() || undefined,
          })
      : !selectedKind
        ? fail('Choose a subcategory.')
        : await createTransaction({
            kindId: selectedKind.id,
            amountMinor: amountCents ?? 0,
            occurredAt,
            note: note.trim() || undefined,
          });
    if (result.ok) {
      router.refresh();
      onClose();
    }
    return result;
  }, null);

  const canSubmit =
    amountCents !== null &&
    amountCents > 0 &&
    (fundFromJar ? selectedJar !== null : selectedKind !== null) &&
    !pending;

  const noCategories = categories !== null && categories.length === 0 && jars.length === 0;

  const body =
    categories === null ? (
      <div className={styles.loading}>
        <Spinner label="Loading categories…" />
      </div>
    ) : noCategories ? (
      <EmptyState
        heading="No categories yet"
        description="Add an expense category first, then log expenses against it."
        action={
          <Link href="/ledger/settings" onClick={onClose}>
            Go to Settings
          </Link>
        }
      />
    ) : (
      <div className={styles.body}>
        <FormField
          label={`Amount (${(fundFromJar ? selectedJar?.currency : selectedKind?.currency) ?? ''})`}
        >
          {(field) => (
            <CurrencyInput
              {...field}
              valueCents={amountCents}
              onValueChange={setAmountCents}
              placeholder="0.00"
            />
          )}
        </FormField>

        {fundFromJar ? (
          <FormField label="Saving jar">
            {(field) => (
              <Select {...field} value={jarId} onChange={(e) => setJarId(e.target.value)}>
                {jars.map((jar) => (
                  <option key={jar.id} value={jar.id}>
                    {jar.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        ) : (
          <div className={styles.row}>
            <FormField label="Category">
              {(field) => (
                <Select
                  {...field}
                  value={categoryId}
                  onChange={(e) => {
                    const nextCategory = categories.find((c) => c.id === e.target.value);
                    setCategoryId(e.target.value);
                    setKindId(nextCategory?.kinds[0]?.id ?? '');
                  }}
                >
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label="Subcategory">
              {(field) => (
                <Select {...field} value={kindId} onChange={(e) => setKindId(e.target.value)}>
                  {selectedCategory?.kinds.map((kind) => (
                    <option key={kind.id} value={kind.id}>
                      {kind.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </div>
        )}

        <FormField label="Date">
          {(field) => (
            <DatePicker
              value={date}
              onChange={(next) => next && setDate(next)}
              aria-label="Date"
              placeholder="Select date"
              {...field}
            />
          )}
        </FormField>

        <div className={styles.jarRow}>
          <div className={styles.jarLabel}>
            <span>Fund from a saving jar</span>
            <span className={styles.jarHint}>
              {jars.length === 0
                ? 'No saving jars yet'
                : fundFromJar
                  ? 'On — withdraws from the jar instead'
                  : 'Off — this counts as regular spending'}
            </span>
          </div>
          <Toggle
            checked={fundFromJar}
            onChange={setFundFromJar}
            disabled={jars.length === 0}
            aria-label="Fund from a saving jar"
          />
        </div>

        <FormField label="Note (optional)">
          {(field) => (
            <Input
              {...field}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note…"
            />
          )}
        </FormField>

        {state && !state.ok && <p className={styles.feedbackError}>{state.error}</p>}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => startTransition(() => dispatch(undefined))}
            loading={pending}
            disabled={!canSubmit}
          >
            Add expense
          </Button>
        </div>
      </div>
    );

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        snapHeight="content"
        title="Add expense"
        aria-label="Add expense"
      >
        {body}
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} size="md" title="Add expense" aria-label="Add expense">
      {body}
    </Dialog>
  );
}
