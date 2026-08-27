import { redirect } from 'next/navigation';
import { BudgetView } from '../_components/BudgetView';
import { requireUser } from '../_lib/authz';
import { getBudgetData } from '../_lib/budget';
import { getDb } from '../_lib/db';
import { getSetupStatus } from '../_lib/setup-status';

/**
 * No link ever points here before setup is complete (the wizard is a
 * separate full-bleed tree with no sidebar to click Budget from), but a
 * manually-typed URL could still reach it mid-wizard — redirect to `/ledger`
 * rather than rendering a real sidebar shell around an empty budget while
 * the user hasn't even picked a currency yet.
 */
export default async function BudgetPage() {
  const actor = await requireUser();
  const db = await getDb();
  const status = await getSetupStatus(db, actor.userId);
  if (!status.complete) redirect('/ledger');

  const data = await getBudgetData(db, actor.userId);
  return <BudgetView data={data} />;
}
