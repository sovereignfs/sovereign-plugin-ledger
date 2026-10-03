'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
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
import { type ActionResult } from '../_lib/action-result';
import { useFormatters } from '../_lib/locale';
import { getUtcYearMonth, isCurrentMonth, utcNoonOf } from '../_lib/period';
import styles from './AddExpenseDialog.module.css';

/**
 * web-shell.md screen 6 (`Dialog size="md"`) and mobile-fork.md screen 8
 * (`Drawer`, `snapHeight="content"`) — one form, forking only the
 * surrounding overlay via `useIsMobile()`. Rendered from both
 * `LedgerSidebar` (desktop) and `AddExpenseFab` (mobile) so "+ Add expense"
 * works from any page under the shell, which is also why its category/kind
 * options are fetched lazily via `getExpenseFormOptions` rather than
 * preloaded by a specific page.
 *
 * This outer component exists only to remount the overlay on each open
 * (`session` below). A dialog opened from shell chrome never unmounts, so
 * form state — including the submission result, which no field reset can
 * reach — survived a close: reopening showed the *previous* attempt's error
 * above an otherwise blank form. Keying the whole surface resets all of it
 * at once, and takes the per-field reset effect with it.
 */
export function AddExpenseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Derived during render rather than in an effect (React's documented
  // "adjust state when a prop changes" pattern) so the remount lands in the
  // same commit the dialog opens in; an effect would paint one frame of the
  // previous session first. Only `open` bumps it, so the closing instance
  // stays mounted for its exit transition.
  const [session, setSession] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSession((n) => n + 1);
  }

  return <AddExpenseOverlay key={session} open={open} onClose={onClose} />;
}

function AddExpenseOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isMobile = useIsMobile();
  const { body, actions } = useAddExpenseForm({ onClose, isMobile });

  if (isMobile) {
    return (
      <Drawer
        open={open}
        onClose={onClose}
        snapHeight="content"
        title="Add expense"
        aria-label="Add expense"
      >
        {/* Drawer supplies no gutter of its own — every consumer brings one
            (the design system's own DatePicker does the same with its
            `.drawerBody`). Without this the fields sat flush against both
            screen edges. Drawer also has no footer slot, so the actions are
            simply the last thing in the sheet. */}
        <div className={styles.drawerBody}>
          {body}
          {actions}
        </div>
      </Drawer>
    );
  }

  return (
    // `header`, not `title`: Dialog renders `title` only in its mobile bar,
    // and mobile takes the Drawer branch above — so `title` here was never
    // visible at all, leaving the desktop panel with a bare close button and
    // no heading at all. `header` renders the same OverlayHeader unconditionally.
    //
    // `footer` keeps the actions and their feedback pinned below the
    // scrolling body. `size="md"` caps the panel at 42rem, so on a short
    // window the submit button used to scroll out of sight along with any
    // error it had just produced.
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      header="Add expense"
      aria-label="Add expense"
      footer={actions}
    >
      {body}
    </Dialog>
  );
}

/**
 * The form itself, returned as two pieces so the desktop branch can pin the
 * actions in `Dialog`'s footer while the mobile branch keeps them inline.
 *
 * No currency picker: a transaction's currency is always its subcategory's
 * own (`createTransaction` derives it server-side), so the selected
 * subcategory's currency is shown read-only in the amount label.
 *
 * The chosen day is sent as UTC noon of that calendar day (`utcNoonOf`),
 * never local midnight — local midnight on the 1st is still the previous
 * month in UTC for anyone east of Greenwich, which put expenses in the wrong
 * month's budget and report (see `period.ts`).
 *
 * **"Fund from a saving jar" (L.12)** — toggling it on swaps
 * Category+Subcategory for a single "Saving jar" `Select`; submitting then
 * calls `createJarTransaction` (a signed withdrawal) instead of
 * `createTransaction` — never both (SPEC.md's Data model correction #3).
 */
function useAddExpenseForm({ onClose, isMobile }: { onClose: () => void; isMobile: boolean }): {
  body: ReactNode;
  actions: ReactNode;
} {
  const router = useRouter();
  const formatters = useFormatters();
  const formId = useId();
  const amountRef = useRef<HTMLInputElement>(null);

  const [categories, setCategories] = useState<ExpenseFormCategoryOption[] | null>(null);
  const [jars, setJars] = useState<ExpenseFormJarOption[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [categoryId, setCategoryId] = useState('');
  const [kindId, setKindId] = useState('');
  const [fundFromJar, setFundFromJar] = useState(false);
  const [jarId, setJarId] = useState('');
  const [amountCents, setAmountCents] = useState<number | null>(null);
  const [date, setDate] = useState<Date>(() => new Date());
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    getExpenseFormOptions()
      .then((options) => {
        if (cancelled) return;
        setCategories(options.categories);
        setJars(options.jars);
        const firstCategory = options.categories[0];
        setCategoryId(firstCategory?.id ?? '');
        setKindId(firstCategory?.kinds[0]?.id ?? '');
        setJarId(options.jars[0]?.id ?? '');
        // Nothing to spend against but a jar to spend *from* is a real state
        // (a savings-only budget). Left off, the form opened on two empty
        // pickers with nothing saying the toggle below was the way through.
        setFundFromJar(options.categories.length === 0 && options.jars.length > 0);
      })
      .catch(() => {
        // Without this the dialog sat on "Loading categories…" forever: a
        // rejected server action left `categories` null with no way back.
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Desktop only. The overlay's own focus capture claims the header's close
  // button, so the first field has to take focus back — a frame later,
  // because that capture runs in a parent effect, after this one. Skipped on
  // mobile, where it would throw the keyboard up over a bottom sheet the
  // instant it opens.
  useEffect(() => {
    if (isMobile || categories === null) return;
    const frame = requestAnimationFrame(() => amountRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [isMobile, categories]);

  const selectedCategory = categories?.find((c) => c.id === categoryId) ?? null;
  const selectedKind = selectedCategory?.kinds.find((k) => k.id === kindId) ?? null;
  const selectedJar = jars.find((j) => j.id === jarId) ?? null;
  const currency = fundFromJar ? selectedJar?.currency : selectedKind?.currency;

  const occurredAt = utcNoonOf(date);
  const { year: occurredYear, month: occurredMonth } = getUtcYearMonth(occurredAt);
  const landsInAnotherMonth = !isCurrentMonth(occurredYear, occurredMonth);

  // Why the submit button is disabled, in the user's own terms. The design
  // system's convention is to prevent rather than fail — but an unavailable
  // action is disabled *with the reason next to it*, and the reason is the
  // half this form was missing. It also makes an overdraw visible before
  // submitting instead of only as a server rejection after.
  const blockedReason = ((): string | null => {
    if (fundFromJar) {
      if (!selectedJar) return 'Add a saving jar before funding an expense from one.';
      if (amountCents !== null && amountCents > selectedJar.balanceMinor) {
        return `That is more than ${selectedJar.name} holds — ${formatters.money(
          selectedJar.balanceMinor,
          selectedJar.currency,
        )} available.`;
      }
    } else if (!selectedKind) {
      return selectedCategory
        ? `${selectedCategory.name} has no subcategories yet — add one in Settings.`
        : 'Add an expense category before logging an expense.';
    }
    if (amountCents === null || amountCents <= 0) return 'Enter an amount to log this expense.';
    return null;
  })();

  const canSubmit = blockedReason === null && !pending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setResult(null);
    try {
      const outcome =
        fundFromJar && selectedJar
          ? await createJarTransaction({
              jarId: selectedJar.id,
              amountMinor: -(amountCents ?? 0),
              occurredAt,
              note: note.trim() || undefined,
            })
          : await createTransaction({
              kindId: selectedKind?.id ?? '',
              amountMinor: amountCents ?? 0,
              occurredAt,
              note: note.trim() || undefined,
            });
      if (outcome.ok) {
        router.refresh();
        onClose();
        return;
      }
      setResult(outcome);
    } finally {
      setPending(false);
    }
  }

  if (loadFailed) {
    return {
      body: (
        <EmptyState
          icon="alert-triangle"
          heading="Couldn't load your categories"
          description="Something went wrong reaching your budget."
          action={<Button onClick={() => setReloadKey((n) => n + 1)}>Try again</Button>}
        />
      ),
      actions: null,
    };
  }

  if (categories === null) {
    return {
      body: (
        <div className={styles.loading}>
          <Spinner label="Loading categories…" />
        </div>
      ),
      actions: null,
    };
  }

  if (categories.length === 0 && jars.length === 0) {
    return {
      body: (
        <EmptyState
          heading="No categories yet"
          description="Add an expense category first, then log expenses against it."
          action={
            <Link href="/ledger/settings" onClick={onClose}>
              Add a category
            </Link>
          }
        />
      ),
      actions: null,
    };
  }

  const body = (
    // A real <form>: Enter from the amount or note field now logs the
    // expense, which is the whole point of a quick-entry surface. The
    // always-visible submit button is CLAUDE.md's documented exception to
    // the commit-on-Enter-or-blur rule.
    <form id={formId} className={styles.body} onSubmit={handleSubmit}>
      <FormField label={currency ? `Amount (${currency})` : 'Amount'}>
        {(field) => (
          <CurrencyInput
            {...field}
            ref={amountRef}
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
                  {/* Every jar's balance is already fetched for this form;
                      showing it is what turns an overdraw from a rejection
                      after submitting into something visible before. */}
                  {jar.name} — {formatters.money(jar.balanceMinor, jar.currency)} available
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

      <FormField
        label="Date"
        // Backdating is legitimate (yesterday's receipt, logged on the 1st),
        // but the expense then lands in a month the user isn't looking at —
        // silently, until they go hunting for it.
        hint={
          landsInAnotherMonth
            ? `Counts towards ${formatters.period(occurredYear, occurredMonth)}.`
            : undefined
        }
      >
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
          <span id={`${formId}-jar-hint`} className={styles.jarHint}>
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
          aria-describedby={`${formId}-jar-hint`}
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
    </form>
  );

  const actions = (
    <div className={styles.footer}>
      {/* Announced, and on desktop pinned with the button that produced it,
          so neither a failure nor the reason the button is dead can scroll
          out of view. */}
      <p className={styles.feedback} role="status" aria-live="polite">
        {result && !result.ok ? (
          <span className={styles.feedbackError}>{result.error}</span>
        ) : (
          blockedReason
        )}
      </p>
      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        {/* `form=` rather than nesting: on desktop this button renders in
            Dialog's footer, a DOM sibling of the scrolling region holding
            the <form>, so naming its owner is the only way it can submit. */}
        <Button type="submit" form={formId} loading={pending} disabled={!canSubmit}>
          Add expense
        </Button>
      </div>
    </div>
  );

  return { body, actions };
}
