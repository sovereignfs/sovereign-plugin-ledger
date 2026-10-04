'use client';

import { Combobox } from '@sovereignfs/ui';
import { CURRENCY_OPTIONS } from '../_lib/currency-options';

/**
 * The currency chooser, as one component rather than nine copies of the same
 * `<Select>` block.
 *
 * `Combobox`, not `Select`: the list is ICU's full ISO 4217 set plus BTC —
 * 163 entries — and the design system draws that line explicitly ("for a
 * fixed, short option list where search adds no value, use `Select`… this is
 * for option lists long enough that typing to filter beats scanning").
 * Scrolling a 163-row native dropdown to find NZD is not a thing to ask of
 * anyone.
 *
 * The code goes in the label, not just the value, because `Combobox` filters
 * on the label alone — a user typing "USD" has to match, and so does one
 * typing "dollar".
 *
 * `options` is deliberately a prop rather than always the full list: the Add
 * currency dialog passes only the codes the user hasn't added yet.
 */
export function CurrencyPicker({
  value,
  onChange,
  options = CURRENCY_OPTIONS,
  'aria-label': ariaLabel = 'Currency',
  ...rest
}: {
  value: string;
  onChange: (code: string) => void;
  options?: typeof CURRENCY_OPTIONS;
  'aria-label'?: string;
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Combobox
      {...rest}
      aria-label={ariaLabel}
      value={value || null}
      onChange={onChange}
      options={options.map((c) => ({ value: c.code, label: `${c.code} — ${c.name}` }))}
      placeholder="Select a currency…"
      searchPlaceholder="Search by code or name…"
      emptyMessage="No currency matches that."
    />
  );
}
