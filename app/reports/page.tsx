import { redirect } from 'next/navigation';
import { ReportsView } from '../_components/ReportsView';
import { requireUser } from '../_lib/authz';
import { getDb } from '../_lib/db';
import { getReportsData } from '../_lib/reports';
import { getSetupStatus } from '../_lib/setup-status';

/** Same guard as `/ledger/budget`/`/ledger/accounts` — no link reaches this
 *  route before setup is complete, but a manually-typed URL could. */
export default async function ReportsPage() {
  const actor = await requireUser();
  const db = await getDb();
  const status = await getSetupStatus(db, actor.userId);
  if (!status.complete) redirect('/ledger');

  const data = await getReportsData(db, actor.userId);
  return <ReportsView data={data} />;
}
