// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { LedgerMobileShell } from '../LedgerMobileShell';
import type { MobileAppEntry } from '../../_lib/apps';

vi.mock('next/navigation', () => ({
  usePathname: () => '/ledger',
  useRouter: () => ({ push: vi.fn() }),
}));

// `Drawer` (under MobileAppsDrawer) reads prefers-reduced-motion through
// matchMedia; AddExpenseFab's dialog forks on it too. Same fixture as the
// design system's own overlay suites.
function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

/** What `sdk.plugins.list()` really hands a plugin: everything installed and
 *  available to the user, chrome plugins included — it applies no chrome
 *  filter of its own (`runtime/src/sdk-host.ts`). */
const APPS: MobileAppEntry[] = [
  { id: 'fs.sovereign.launcher', name: 'Launcher', routePrefix: '/launcher', hasIcon: true },
  { id: 'fs.sovereign.account', name: 'Account', routePrefix: '/account', hasIcon: true },
  { id: 'fs.sovereign.console', name: 'Console', routePrefix: '/console', hasIcon: true },
  { id: 'fs.sovereign.inbox', name: 'Inbox', routePrefix: '/inbox', hasIcon: true },
  { id: 'fs.sovereign.tasks', name: 'Tasks', routePrefix: '/tasks', hasIcon: true },
  { id: 'fs.sovereign.notes', name: 'Notes', routePrefix: '/notes', hasIcon: false },
];

beforeEach(installMatchMedia);

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

/**
 * The dark-mode half of this fix is not covered here: jsdom applies no CSS,
 * so `:global([data-theme='dark']) .drawerIcon { filter: invert(1) }` has
 * nothing to assert against. Verified in a real browser instead.
 */
describe('LedgerMobileShell', () => {
  it('uses the real Launcher icon for the footer’s Apps button', () => {
    render(
      <LedgerMobileShell apps={APPS}>
        <p>Content</p>
      </LedgerMobileShell>,
    );

    // Regression: no `launcherIcon` was passed, so MobileFooter fell back to
    // its generic `grid-2x2` glyph — the one slot in this bar that did not
    // match the Apps button everywhere else in the instance.
    const appsButton = screen.getByRole('button', { name: 'Apps' });
    const icon = appsButton.querySelector('img');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('src')).toBe('/plugin-icons/fs.sovereign.launcher.svg');
  });

  it('falls back to the generic glyph when the Launcher declares no icon', () => {
    render(
      <LedgerMobileShell apps={APPS.map((a) => ({ ...a, hasIcon: false }))}>
        <p>Content</p>
      </LedgerMobileShell>,
    );
    expect(screen.getByRole('button', { name: 'Apps' }).querySelector('img')).toBeNull();
  });

  it('keeps platform chrome plugins out of the Apps drawer', () => {
    render(
      <LedgerMobileShell apps={APPS}>
        <p>Content</p>
      </LedgerMobileShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apps' }));

    // Regression: `sdk.plugins.list()` applies no chrome filter, so these
    // four were listed as ordinary app tiles — and Launcher twice over, once
    // the footer button started carrying its icon. The runtime excludes the
    // same set via CHROME_PLUGIN_IDS (SRS LCH-04, PLT-12).
    for (const chrome of ['Launcher', 'Account', 'Console', 'Inbox']) {
      expect(screen.queryByText(chrome)).toBeNull();
    }
    // Real apps still there.
    expect(screen.getByText('Tasks')).toBeTruthy();
    expect(screen.getByText('Notes')).toBeTruthy();
  });
});
