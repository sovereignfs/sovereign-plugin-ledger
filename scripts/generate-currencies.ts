/**
 * Regenerates `app/_lib/currency-options.ts`'s data table from the Node
 * runtime's own ICU database — `pnpm tsx scripts/generate-currencies.ts` from
 * this plugin's root, then commit the result.
 *
 * Generated-then-committed, not read from ICU at runtime, for three reasons:
 * the table is then deterministic rather than varying with whichever ICU the
 * server and the browser each happen to carry; it is reviewable in a diff;
 * and the client bundle gets a plain array instead of depending on
 * `Intl.supportedValuesOf`. Same shape as the platform's own
 * `scripts/icon-list.ts` + `pnpm generate:icons`.
 *
 * ICU is the source for codes, display names and — most importantly —
 * each currency's own fraction digits, which are not uniformly 2: ISO 4217
 * gives JPY, KRW, CLP and ISK zero, and BHD, KWD and TND three. Getting
 * those from ICU rather than by hand is the point of generating this.
 *
 * BTC is appended by hand. It is not ISO 4217, so ICU does not carry it:
 * asked about it, ICU reports the name "BTC" and the default 2 digits, which
 * would cap the smallest recordable amount at 0.01 BTC. Eight digits is the
 * satoshi.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface CurrencyOption {
  code: string;
  name: string;
  decimals: number;
}

const OUT = join(import.meta.dirname, '..', 'app', '_lib', 'currency-options.ts');

/** Not in ISO 4217 and so not in ICU — see this file's own doc comment. */
const EXTRA: CurrencyOption[] = [{ code: 'BTC', name: 'Bitcoin', decimals: 8 }];

function build(): CurrencyOption[] {
  const displayNames = new Intl.DisplayNames(['en'], { type: 'currency' });
  const iso = Intl.supportedValuesOf('currency').map((code) => ({
    code,
    // `of()` falls back to the code itself for anything ICU lacks a name for.
    name: displayNames.of(code) ?? code,
    // `maximumFractionDigits` is optional on the resolved options type, but
    // is always present for `style: 'currency'`. Fall back to 2 rather than
    // widening the field to `number | undefined` for a case that cannot occur.
    decimals:
      new Intl.NumberFormat('en', { style: 'currency', currency: code }).resolvedOptions()
        .maximumFractionDigits ?? 2,
  }));
  return [...iso, ...EXTRA].sort((a, b) => a.code.localeCompare(b.code));
}

function render(options: CurrencyOption[]): string {
  const rows = options
    .map(
      (o) => `  { code: '${o.code}', name: ${JSON.stringify(o.name)}, decimals: ${o.decimals} },`,
    )
    .join('\n');

  return `// GENERATED FILE — do not edit by hand.
// Regenerate with \`pnpm tsx scripts/generate-currencies.ts\` from this
// plugin's root; the generator's own doc comment explains the sources.

/**
 * The single pivot every \`ledger_fx_rates\` row is stored against — USD, not
 * EUR, despite Frankfurter's ECB data being natively EUR-denominated: a
 * crypto source would default to USD pricing, so USD is the pivot both
 * kinds of source can share without a second conversion hop (see
 * \`app/_jobs/fetch-fx-rates.ts\`). Cross-rates between any two currencies are
 * derived from their two pivot legs at query time (\`getCrossRateAsOf\`).
 */
export const FX_PIVOT_CODE = 'USD';

export interface CurrencyOption {
  code: string;
  name: string;
  /**
   * Fraction digits this currency uses — the exponent relating a stored
   * \`amountMinor\` integer to the amount a person reads. **Not uniformly 2**:
   * ISO 4217 gives JPY, KRW, CLP and ISK zero and BHD, KWD and TND three,
   * and BTC (not ISO 4217 at all) uses eight, the satoshi. Every amount is
   * stored as an integer count of this currency's smallest unit, so this is
   * what both \`formatMoney\` and \`CurrencyInput\`'s \`decimals\` prop need.
   */
  decimals: number;
}

/**
 * Every currency selectable anywhere in Ledger — ICU's ISO 4217 set plus
 * BTC. A user adds the ones they actually use (\`ledger_currencies\`); the
 * daily rate job fetches rates for exactly that in-use set rather than for
 * this whole list (\`app/_jobs/fetch-fx-rates.ts\`).
 */
export const CURRENCY_OPTIONS: CurrencyOption[] = [
${rows}
];

const BY_CODE = new Map(CURRENCY_OPTIONS.map((c) => [c.code, c]));

/** True for a code the app supports — the only currencies any row may carry. */
export function isSupportedCurrencyCode(code: string): boolean {
  return BY_CODE.has(code);
}

/**
 * This currency's fraction digits, defaulting to 2 for an unknown code.
 *
 * The default matters: a row stored before a code left this list (or written
 * by a restored export from another instance) must still render as *something*
 * sane rather than throwing mid-render, and 2 is what the app assumed
 * everywhere before currencies carried their own exponent.
 */
export function currencyDecimals(code: string): number {
  return BY_CODE.get(code)?.decimals ?? 2;
}

/** The whole-unit scale for a currency — 10 ** its fraction digits. */
export function currencyScale(code: string): number {
  return 10 ** currencyDecimals(code);
}
`;
}

const options = build();
writeFileSync(OUT, render(options), 'utf8');
console.log(`[generate-currencies] wrote ${options.length} currencies to ${OUT}`);
