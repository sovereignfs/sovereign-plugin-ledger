import { SetupWizard } from './_components/SetupWizard';
import { requireUser } from './_lib/authz';
import { getDb } from './_lib/db';
import { getSetupStatus } from './_lib/setup-status';

/**
 * `/ledger` is both the setup wizard's entry point and (once its minimum is
 * met) the future Overview's placeholder — no separate `/ledger/setup`
 * route, per `SPEC.md`'s Routes section. Completion is derived from real
 * data (a base currency, a primary income, at least one category) rather
 * than a stored "onboarding done" flag — see `getSetupStatus`.
 *
 * Always mounts the SAME client component regardless of status, passing it
 * as an `initialStatus` prop rather than branching here between two
 * different components. `SetupWizard` snapshots that prop once via
 * `useState` and manages its own step transitions entirely client-side
 * from then on — required because every wizard-step action calls
 * `revalidatePath('/ledger', 'layout')` (the shared `refresh()` helper in
 * `actions.ts`), which makes Next.js automatically re-run this server
 * component mid-flow. A branch here (`if (!status.complete) return
 * <SetupWizard/>; return <Placeholder/>`) would let that incidental
 * refresh swap the whole tree out from under an in-progress wizard the
 * moment step 3's last category is created — skipping the Ready screen
 * entirely, since the parent would already be rendering the complete
 * placeholder before the user ever saw it. Snapshotting the prop into
 * client state sidesteps this: only a real full navigation re-mounts the
 * component and re-reads fresh status.
 */
export default async function LedgerHomePage() {
  const actor = await requireUser();
  const db = await getDb();
  const status = await getSetupStatus(db, actor.userId);

  return <SetupWizard initialStatus={status} />;
}
