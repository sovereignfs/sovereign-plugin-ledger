import { sdk } from '@sovereignfs/sdk';

const LEDGER_PLUGIN_ID = 'fs.sovereign.ledger';

export interface MobileAppEntry {
  id: string;
  name: string;
  routePrefix: string;
  hasIcon: boolean;
}

/**
 * The installed-apps list for the self-rendered mobile footer's Apps
 * drawer (`shellConfig.mobileFooter: false` removes the platform's own
 * `MobileNav` — and the real Apps drawer it opens — from this plugin's
 * routes entirely, per RFC 0075). `MobileAppsDrawer` itself is a published
 * `@sovereignfs/ui` component (unlike `NotificationBell`/`AccountMenu`,
 * which aren't); only the data needs reconstructing, via `sdk.plugins.list()`
 * — exactly matching `sovereign-plugin-tally.local`'s own `(home)/layout.tsx`
 * (same `shell: default` situation): `hasIcon` here, not a ready-made
 * `iconUrl` — `PluginAvailability.icon` is each plugin's raw manifest
 * value (e.g. `"icon.svg"`, relative to that plugin's own directory), never
 * a servable URL on its own; the real served path is always
 * `/plugin-icons/<id>.svg`, constructed by the caller. Only this plugin
 * itself is filtered out — no synthetic "Home" tile, unlike
 * `sovereign-plugin-kanban.local`'s `shell: minimal` build: Ledger keeps the
 * platform's own mobile header (see `LedgerMobileShell`'s doc comment), so
 * its brand badge already links home.
 */
export async function listMobileApps(): Promise<MobileAppEntry[]> {
  const apps = await sdk.plugins.list();
  return apps
    .filter((app) => app.availableToUser && app.id !== LEDGER_PLUGIN_ID)
    .map((app) => ({
      id: app.id,
      name: app.name,
      routePrefix: app.routePrefix,
      hasIcon: Boolean(app.icon),
    }));
}
