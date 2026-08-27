import { sdk } from '@sovereignfs/sdk';
import type { LedgerDb } from '../_db/client';

/** This plugin's isolated database, typed for the ledger schema. */
export async function getDb(): Promise<LedgerDb> {
  return (await sdk.db.getClient()) as LedgerDb;
}
