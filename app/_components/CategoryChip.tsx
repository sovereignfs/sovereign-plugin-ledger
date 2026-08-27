'use client';

import type { ReactNode } from 'react';
import styles from './CategoryChip.module.css';

/**
 * A tappable, pill-shaped, zero-to-many toggle option — for the setup
 * wizard's suggested-category chips (`docs/adhoc/setup-wizard.md` screen
 * 3). No existing `@sovereignfs/ui` component fits this shape: `TagInput`
 * is free-text, `SegmentedControl` is single-select, `Toggle` is a single
 * binary switch. Built plugin-local, following the same plain
 * `<button aria-pressed>` + CSS module pattern already used for toggled
 * pill/icon buttons elsewhere in this app family (e.g.
 * `sovereign-plugin-docs.local`'s `RichTextEditor` toolbar buttons) rather
 * than inventing a one-off. Worth promoting to `packages/ui` if a second
 * plugin needs the same shape — not before.
 */
export function CategoryChip({
  selected,
  onClick,
  dashed = false,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  /** The "+ Custom" chip's dashed-border affordance. */
  dashed?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={[styles.chip, selected && styles.chipSelected, dashed && styles.chipDashed]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </button>
  );
}
