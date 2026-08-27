/**
 * Session resolution. Ledger is strictly single-user — there is no
 * membership/role model to check the way a shared-resource plugin (e.g.
 * `sovereign-plugin-kanban.local`) needs `getBoardRole`-style helpers.
 * Every action's real authorization check is simply "does this row's
 * `user_id` equal `actor.userId`" — done directly in the query/mutation's
 * own `WHERE` clause (see `queries.ts`/`actions.ts`), not a separate
 * pre-check, so a forged id belonging to another user can never match a row
 * at the SQL level.
 */
import { sdk } from '@sovereignfs/sdk';

export interface Actor {
  userId: string;
  /**
   * Platform-required, multi-tenancy-readiness column — constant across
   * this v1 single-tenant instance. NOT the authorization boundary; see
   * `userId` above. Carried only because every table requires it.
   */
  tenantId: string;
}

export async function requireUser(): Promise<Actor> {
  const session = await sdk.auth.requireSession();
  return { userId: session.user.id, tenantId: session.user.tenantId };
}
