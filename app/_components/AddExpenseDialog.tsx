'use client';

import { useRouter } from 'next/navigation';
import { startTransition, useActionState, useEffect, useState } from 'react';
import {
  Button,
  CurrencyInput,
  DatePicker,
  Dialog,
  Drawer,
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
import styles from './AddExpenseDialog.module.css';

/**
 * web-shell.md screen 6 (`Dialog size="md"`, corrected from the original
 * wireframe's `Sheet` draft — no desktop equivalent) and mobile-fork.md
 * screen 8 (`Drawer`, `snapHeight="content"`) — one component, one form,
 * forking only the surrounding overlay via `useIsMobile()`. Rendered from
 * both `LedgerSidebar` (desktop) and `AddExpenseFab` (mobile) so
 * "+ Add expense" works from any page under the shell, which is also why
 * its category/kind options are fetched lazily here via
 * `getExpenseFormOptions` rather than preloaded by a specific page — see
 * that action's own doc comment.
 *
 * No `useCommitOnEnterOrBlur` on amount/note: this dialog has its own
 * always-visible "Add expense" submit button, the documented exception in
 * CLAUDE.md's quick-entry-input rule (that rule is for fields that must
 * persist themselves on blur with no other affordance to do so).
 *
 * The wireframe draws an inline "EUR ▾" currency picker inside the amount
 * field — not built that way: `CurrencyInput` has no currency prop by
 * design, and every kind's currency is fixed at creation time (the wizard
 * is still the only path that sets one), so letting a user pick a
 * different currency here would just create an amount that disagrees with
 * the subcategory's own budget currency. The selected subcategory's
 * currency is shown read-only in the amount field's own label instead.
 *
 * **"Fund from a saving jar" (L.12)** — the open question web-shell.md's
 * own doc left unresolved: toggling it on swaps Category+Subcategory for a
 * single "Saving jar" `Select`, matching the wireframe's literal "a single
 * jar picker" wording rather than asking for a second, separate spend
 * category on top of the jar. Submitting then calls `createJarTransaction`
 * (a signed withdrawal) instead of `createTransaction` — never both, the
 * exact double-booking this app's data model was corrected once already to
 * avoid (SPEC.md's Data model correction #3). The toggle disables itself
 * with a "No saving jars yet" hint when the user has none, rather than
 * letting it be turned on with nothing to pick.
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
    const result = fundFromJar
      ? !selectedJar
        ? fail('Choose a saving jar.')
        : await createJarTransaction({
            jarId: selectedJar.id,
            amountMinor: -(amountCents ?? 0),
            occurredAt: date.getTime(),
            note: note.trim() || undefined,
          })
      : !selectedKind
        ? fail('Choose a subcategory.')
        : await createTransaction({
            kindId: selectedKind.id,
            amountMinor: amountCents ?? 0,
            currency: selectedKind.currency,
            occurredAt: date.getTime(),
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

  const body =
    categories === null ? (
      <div className={styles.loading}>
        <Spinner label="Loading categories…" />
      </div>
    ) : (
      <div className={styles.body}>
        <FormField label={`Amount (${(fundFromJar ? selectedJar?.currency : selectedKind?.currency) ?? ''})`}>
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
              onChange={setDate}
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
      <Drawer open={open} onClose={onClose} snapHeight="content" title="Add expense" aria-label="Add expense">
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
