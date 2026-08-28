import { OverviewView } from './_components/OverviewView';
import { SetupWizard } from './_components/SetupWizard';
import { listMobileApps } from './_lib/apps';
import { requireUser } from './_lib/authz';
import { getDb } from './_lib/db';
import { getInsights } from './_lib/insights';
import { getOverviewData } from './_lib/overview';
import { getSetupStatus } from './_lib/setup-status';

/**
 * `/ledger` is both the setup wizard's entry point and, once its minimum is
 * met, Overview itself — no separate `/ledger/setup` route, per SPEC.md's
 * Routes section. Completion is derived from real data (a base currency, a
 * primary income, at least one category), not a stored flag — see
 * `getSetupStatus`.
 *
 * Branches directly on a single fresh status read, unlike the shape this
 * had through L.4 (always render `SetupWizard`, let it decide internally).
 * That indirection existed only because a wizard-step action's
 * `revalidatePath('/ledger', 'layout')` re-runs this server component
 * mid-flow, and swapping to a *different* component while the user is
 * actively completing steps 1-3 would discard their in-progress wizard —
 * see `SetupWizard`'s own doc comment for the full incident. That risk is
 * specific to an in-progress client interaction on the currently-rendered
 * component getting yanked out from under it; it doesn't apply to a fresh,
 * first render deciding which branch to take at all. Overview (as built in
 * L.5) triggers no mutations of its own yet, so there's no path by which an
 * incidental refresh could fire while a user is mid-interaction with it —
 * re-check this reasoning if a later task (e.g. L.6's Add-expense dialog)
 * adds one directly on this page.
 */
export default async function LedgerHomePage() {
  const actor = await requireUser();
  const db = await getDb();
  const status = await getSetupStatus(db, actor.userId);

  if (!status.complete) {
    return <SetupWizard initialStatus={status} />;
  }

  const [data, apps, insights] = await Promise.all([
    getOverviewData(db, actor.userId),
    listMobileApps(),
    getInsights(db, actor.userId),
  ]);
  return <OverviewView data={data} apps={apps} insights={insights} />;
}
