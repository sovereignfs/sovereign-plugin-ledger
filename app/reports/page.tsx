import { redirect } from 'next/navigation';
import { ReportsView } from '../_components/ReportsView';
import { listMobileApps } from '../_lib/apps';
import { requireUser } from '../_lib/authz';
import { getDb } from '../_lib/db';
import { getInsights } from '../_lib/insights';
import { getReportsData } from '../_lib/reports';
import { getSetupStatus } from '../_lib/setup-status';

/** Same guard as `/ledger/budget`/`/ledger/accounts` — no link reaches this
 *  route before setup is complete, but a manually-typed URL could. */
export default async function ReportsPage() {
  const actor = await requireUser();
  const db = await getDb();
  const status = await getSetupStatus(db, actor.userId);
  if (!status.complete) redirect('/ledger');

  const [data, apps, insights] = await Promise.all([
    getReportsData(db, actor.userId),
    listMobileApps(),
    getInsights(db, actor.userId),
  ]);
  return <ReportsView data={data} apps={apps} insights={insights} />;
}
