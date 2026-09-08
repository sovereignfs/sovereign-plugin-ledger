import { redirect } from 'next/navigation';
import { ReportsView } from '../_components/ReportsView';
import { listMobileApps } from '../_lib/apps';
import { requireUser } from '../_lib/authz';
import { getDb } from '../_lib/db';
import { getInsights } from '../_lib/insights';
import { getReportsData } from '../_lib/reports';
import { getRequestLocale } from '../_lib/request-locale';
import { getSetupStatus } from '../_lib/setup-status';

/** Same guard as `/ledger/budget`/`/ledger/accounts` — no link reaches this
 *  route before setup is complete, but a manually-typed URL could. */
export default async function ReportsPage() {
  const [actor, db, locale] = await Promise.all([requireUser(), getDb(), getRequestLocale()]);
  const status = await getSetupStatus(db, actor.userId);
  if (!status.complete) redirect('/ledger');

  const [data, apps] = await Promise.all([getReportsData(db, actor.userId), listMobileApps()]);
  // Insights reuse the report payload computed above rather than
  // recomputing it (`getInsights`'s optional third argument).
  const insights = await getInsights(db, actor.userId, data);
  return <ReportsView data={data} apps={apps} insights={insights} locale={locale} />;
}
