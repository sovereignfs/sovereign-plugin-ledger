import { headers } from 'next/headers';

/**
 * The viewer's preferred locale from `Accept-Language`, or `undefined` when
 * absent/unparseable. Read once per server render and passed down to
 * `LedgerLocaleProvider` so client components format identically during SSR
 * and hydration. Only the first (highest-q) tag is used; `Intl` treats an
 * unknown tag as a fallback to the default locale rather than throwing, but
 * the regex below rejects anything that isn't a plausible BCP 47 tag anyway.
 */
export async function getRequestLocale(): Promise<string | undefined> {
  const value = (await headers()).get('accept-language');
  if (!value) return undefined;
  const first = value.split(',')[0]?.split(';')[0]?.trim();
  if (!first || first === '*' || !/^[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*$/.test(first)) {
    return undefined;
  }
  try {
    return Intl.getCanonicalLocales(first)[0];
  } catch {
    return undefined;
  }
}
