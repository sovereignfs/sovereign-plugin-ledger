import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CURRENCY_OPTIONS,
  currencyDecimals,
  currencyScale,
  isSupportedCurrencyCode,
} from '../currency-options';
import { formatMoney } from '../format';

const COMPONENTS_DIR = join(import.meta.dirname, '..', '..', '_components');

describe('currency options', () => {
  it('covers ISO 4217 plus BTC, not the old curated twenty', () => {
    expect(CURRENCY_OPTIONS.length).toBeGreaterThan(150);
    for (const code of ['USD', 'EUR', 'GBP', 'LKR', 'AED', 'NZD', 'BTC']) {
      expect(isSupportedCurrencyCode(code)).toBe(true);
    }
    expect(isSupportedCurrencyCode('ZZZ')).toBe(false);
  });

  it('carries each currency’s own fraction digits, which are not all 2', () => {
    expect(currencyDecimals('USD')).toBe(2);
    expect(currencyDecimals('JPY')).toBe(0); // ISO exponent 0
    expect(currencyDecimals('KRW')).toBe(0);
    expect(currencyDecimals('KWD')).toBe(3); // ISO exponent 3
    expect(currencyDecimals('BHD')).toBe(3);
    expect(currencyDecimals('BTC')).toBe(8); // the satoshi
  });

  it('defaults an unknown code to 2 rather than throwing', () => {
    // A row can outlive its code — a restored export from another instance,
    // or a code dropped from a later ICU. Rendering must degrade, not crash.
    expect(currencyDecimals('ZZZ')).toBe(2);
    expect(currencyScale('ZZZ')).toBe(100);
  });

  it('has no duplicate codes', () => {
    const codes = CURRENCY_OPTIONS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

/** ICU separates a currency code from the number with U+00A0, not a plain
 *  space — normalised here so the assertions read as what a person sees and
 *  don't hinge on which space a given ICU build picks. */
const money = (minor: number, code: string, locale = 'en-US') =>
  formatMoney(minor, code, locale).replace(/\u00a0|\u202f/g, ' ');

describe('formatMoney', () => {
  it('scales by the currency’s own exponent', () => {
    expect(money(2340, 'USD')).toBe('$23.40');
    // 1500 minor units of a zero-decimal currency is ¥1,500, not ¥15.
    expect(money(1500, 'JPY')).toBe('¥1,500');
    expect(money(12_345, 'KWD')).toContain('12.345');
  });

  it('renders a satoshi rather than rounding it away', () => {
    // At the old flat /100 this was "BTC 0.00" — ICU has no BTC entry, so its
    // own default is 2 digits and the amount disappears.
    expect(money(1, 'BTC')).toBe('BTC 0.00000001');
    expect(money(150_000_000, 'BTC')).toBe('BTC 1.50000000');
  });

  it('still honours the request locale', () => {
    expect(money(123_450, 'EUR', 'de-DE')).toContain('1.234,50');
  });
});

describe('money input usage', () => {
  it('routes every money field through MoneyInput, never CurrencyInput directly', () => {
    // MoneyInput is what binds `decimals` to the currency. A field reaching
    // for CurrencyInput directly silently gets the default 2 — which for BTC
    // is wrong by a factor of 10^6 — so the boundary is asserted rather than
    // left to reviewer memory.
    const offenders = readdirSync(COMPONENTS_DIR)
      .filter((f) => f.endsWith('.tsx') && f !== 'MoneyInput.tsx')
      .filter((f) => /\bCurrencyInput\b/.test(readFileSync(join(COMPONENTS_DIR, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
