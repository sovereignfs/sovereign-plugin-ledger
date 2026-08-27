import { redirect } from 'next/navigation';
import { AccountsView } from '../_components/AccountsView';
import { requireUser } from '../_lib/authz';
import { getAccountsData } from '../_lib/accounts';
import { getDb } from '../_lib/db';
import { getSetupStatus } from '../_lib/setup-status';

/** Same guard as `/ledger/budget` — no link reaches this route before setup
 *  is complete, but a manually-typed URL could. */
export default async function AccountsPage() {
  const actor = await requireUser();
  const db = await getDb();
  const status = await getSetupStatus(db, actor.userId);
  if (!status.complete) redirect('/ledger');

  const data = await getAccountsData(db, actor.userId);
  return <AccountsView data={data} />;
}
