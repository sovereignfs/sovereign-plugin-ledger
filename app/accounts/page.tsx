import { redirect } from 'next/navigation';
import { AccountsView } from '../_components/AccountsView';
import { listMobileApps } from '../_lib/apps';
import { requireUser } from '../_lib/authz';
import { getAccountsData } from '../_lib/accounts';
import { getDb } from '../_lib/db';
import { getRequestLocale } from '../_lib/request-locale';
import { getSetupStatus } from '../_lib/setup-status';

/** Same guard as `/ledger/budget` — no link reaches this route before setup
 *  is complete, but a manually-typed URL could. */
export default async function AccountsPage() {
  const [actor, db, locale] = await Promise.all([requireUser(), getDb(), getRequestLocale()]);
  const status = await getSetupStatus(db, actor.userId);
  if (!status.complete) redirect('/ledger');

  const [data, apps] = await Promise.all([getAccountsData(db, actor.userId), listMobileApps()]);
  return <AccountsView data={data} apps={apps} locale={locale} />;
}
