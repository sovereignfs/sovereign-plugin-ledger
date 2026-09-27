import type { ReactNode } from 'react';
import { registerPortability } from './_lib/portability';

/**
 * Registers Ledger's portability hooks (export / import / account deletion).
 *
 * The platform's portability registry is populated request-scoped as plugin
 * pages load — `sdk.portability.*` resolves the calling plugin from the
 * `x-sovereign-plugin-id` request header, so registration has to happen
 * inside a plugin route rather than at module load. A layout is the one place
 * every route under `/ledger` passes through.
 *
 * Fired without awaiting, deliberately: this layout is an *ancestor* of
 * `app/loading.tsx`'s Suspense boundary, so awaiting here would hold the
 * first byte — including the loading fallback — until registration resolved,
 * on every navigation into Ledger. It has no return value the render path
 * needs and no failure a user could act on, so there is nothing to wait for.
 * Registration is idempotent and best-effort; a failure leaves the budget UI
 * itself untouched.
 */
export default function LedgerLayout({ children }: { children: ReactNode }) {
  void registerPortability().catch(() => {
    // Best-effort platform integration — never blocks the UI.
  });
  return children;
}
