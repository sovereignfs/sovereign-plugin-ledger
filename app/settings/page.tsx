import { redirect } from 'next/navigation';
import { SettingsView } from '../_components/SettingsView';
import { listMobileApps } from '../_lib/apps';
import { requireUser } from '../_lib/authz';
import { getDb } from '../_lib/db';
import { getSettingsData } from '../_lib/settings';
import { getSetupStatus } from '../_lib/setup-status';

/** Same guard as `/ledger/budget`/`/ledger/accounts` — no link reaches this
 *  route before setup is complete, but a manually-typed URL could. */
export default async function SettingsPage() {
  const actor = await requireUser();
  const db = await getDb();
  const status = await getSetupStatus(db, actor.userId);
  if (!status.complete) redirect('/ledger');

  const [data, apps] = await Promise.all([getSettingsData(db, actor.userId), listMobileApps()]);
  return <SettingsView data={data} apps={apps} />;
}
