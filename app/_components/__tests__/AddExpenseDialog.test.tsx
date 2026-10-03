// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddExpenseDialog } from '../AddExpenseDialog';

const getExpenseFormOptions = vi.fn();
const createTransaction = vi.fn();
const createJarTransaction = vi.fn();

vi.mock('../../actions', () => ({
  getExpenseFormOptions: () => getExpenseFormOptions(),
  createTransaction: (...args: unknown[]) => createTransaction(...args),
  createJarTransaction: (...args: unknown[]) => createJarTransaction(...args),
}));

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

// Dialog/Drawer read prefers-reduced-motion through matchMedia, and
// `useIsMobile` resolves the breakpoint the same way. `matches: false` is the
// desktop, motion-enabled branch — the one with the header and the pinned
// footer. Same fixture as the design system's own overlay suites.
function installMatchMedia(matches = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

const CATEGORIES = [
  {
    id: 'cat-1',
    name: 'Groceries',
    kinds: [{ id: 'kind-1', name: 'Essen', currency: 'EUR' }],
  },
];

const JARS = [{ id: 'jar-1', name: 'Travel jar', balanceMinor: 42_000, currency: 'EUR' }];

beforeEach(() => {
  installMatchMedia();
  vi.clearAllMocks();
  getExpenseFormOptions.mockResolvedValue({ categories: CATEGORIES, jars: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

/** Waits out the options fetch so the form (not the spinner) is on screen. */
async function openedForm() {
  await screen.findByLabelText('Amount (EUR)');
}

/**
 * Two of this task's fixes are deliberately not covered here, because jsdom
 * applies no CSS and both live entirely in the stylesheet:
 *
 * - The desktop heading (`title` → `header`). `Dialog` hides its `title` bar
 *   outside the mobile breakpoint via `.mobileHeader { display: none }`, so in
 *   jsdom the old `title` text is in the DOM exactly like the new `header` —
 *   a test asserting on it passes against the pre-fix code too, which is how
 *   this one was caught. Verified by reading `Dialog.module.css` instead.
 * - The mobile drawer gutter (`.drawerBody`). Padding is unobservable without
 *   a layout engine; verified in a real browser.
 */
describe('AddExpenseDialog', () => {
  it('submits the form on Enter rather than only on a button click', async () => {
    createTransaction.mockResolvedValue({ ok: true });
    render(<AddExpenseDialog open onClose={() => {}} />);
    await openedForm();

    fireEvent.change(screen.getByLabelText('Amount (EUR)'), { target: { value: '23.40' } });
    // Regression: the fields used to sit in a plain <div>, so there was no
    // form to submit and Enter did nothing on a daily quick-entry surface.
    const form = document.querySelector('form');
    expect(form).toBeTruthy();
    await act(async () => {
      fireEvent.submit(form as HTMLFormElement);
    });

    await waitFor(() => expect(createTransaction).toHaveBeenCalledOnce());
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ kindId: 'kind-1', amountMinor: 2340 }),
    );
  });

  it('says why the submit button is disabled instead of just disabling it', async () => {
    render(<AddExpenseDialog open onClose={() => {}} />);
    await openedForm();

    expect(screen.getByRole('button', { name: 'Add expense' })).toHaveProperty('disabled', true);
    expect(screen.getByText('Enter an amount to log this expense.')).toBeTruthy();
  });

  it('clears a previous attempt’s error when reopened', async () => {
    createTransaction.mockResolvedValue({ ok: false, error: 'Amount is too large.' });
    const { rerender } = render(<AddExpenseDialog open onClose={() => {}} />);
    await openedForm();

    fireEvent.change(screen.getByLabelText('Amount (EUR)'), { target: { value: '5.00' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    });
    await screen.findByText('Amount is too large.');

    // Regression: this dialog is rendered by shell chrome and never unmounts,
    // so the failed result survived a close and greeted the user again above
    // an otherwise blank form on the next open.
    rerender(<AddExpenseDialog open={false} onClose={() => {}} />);
    rerender(<AddExpenseDialog open onClose={() => {}} />);
    await openedForm();

    expect(screen.queryByText('Amount is too large.')).toBeNull();
  });

  it('offers a retry when the options fetch fails, rather than spinning forever', async () => {
    getExpenseFormOptions.mockRejectedValueOnce(new Error('network'));
    render(<AddExpenseDialog open onClose={() => {}} />);

    // Regression: `.then()` with no `.catch()` left `categories` null, so the
    // dialog sat on "Loading categories…" with no way out.
    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.queryByText('Loading categories…')).toBeNull();

    getExpenseFormOptions.mockResolvedValue({ categories: CATEGORIES, jars: [] });
    await act(async () => {
      fireEvent.click(retry);
    });
    await openedForm();
  });

  it('shows each jar’s available balance and blocks an overdraw before submitting', async () => {
    getExpenseFormOptions.mockResolvedValue({ categories: [], jars: JARS });
    render(<AddExpenseDialog open onClose={() => {}} />);
    await screen.findByLabelText('Amount (EUR)');

    // With no categories but a jar available, the toggle defaults on — the
    // form used to open on two empty pickers with no way through.
    expect(
      screen.getByRole('switch', { name: 'Fund from a saving jar' }).getAttribute('aria-checked'),
    ).toBe('true');
    // The balance was already fetched for every jar and thrown away.
    expect(screen.getByRole('option', { name: /Travel jar/ }).textContent).toContain('420.00');

    fireEvent.change(screen.getByLabelText('Amount (EUR)'), { target: { value: '500.00' } });
    expect(screen.getByRole('button', { name: 'Add expense' })).toHaveProperty('disabled', true);
    expect(screen.getByText(/more than Travel jar holds/)).toBeTruthy();
    expect(createJarTransaction).not.toHaveBeenCalled();
  });
});
