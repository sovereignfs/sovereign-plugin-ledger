'use client';

import { CurrencyInput } from '@sovereignfs/ui';
import type { ComponentProps } from 'react';
import { currencyDecimals } from '../_lib/currency-options';

type CurrencyInputProps = ComponentProps<typeof CurrencyInput>;

/**
 * `CurrencyInput` bound to a currency's own fraction digits.
 *
 * Amounts are stored as an integer count of the currency's smallest unit, and
 * how many of those make one major unit is not a constant: ISO 4217 gives JPY
 * and KRW zero and BHD, KWD and TND three, and BTC uses eight — the satoshi.
 * `CurrencyInput` takes that as its `decimals` prop (defaulting to 2); this
 * wrapper is what supplies it from `currencyDecimals`, so the lookup lives in
 * one place instead of being repeated at ~20 call sites where forgetting it
 * would silently record an amount off by a factor of 10^6 for BTC.
 *
 * `currency` is required for exactly that reason — a site that cannot say
 * which currency it is editing has no business rendering a money field, and
 * the compiler is what enforces it. A guard test keeps new code going through
 * here rather than reaching for `CurrencyInput` directly
 * (`__tests__/money-input-usage.test.ts`).
 *
 * Deliberately a thin binding, not a reimplementation: the control itself
 * stays in the design system (DS-first), and this adds only the plugin's own
 * currency table to it.
 */
export function MoneyInput({
  currency,
  ...rest
}: Omit<CurrencyInputProps, 'decimals'> & { currency: string }) {
  return <CurrencyInput {...rest} decimals={currencyDecimals(currency)} />;
}
