/**
 * The fixed set of fiat currencies selectable anywhere in Ledger (setup
 * wizard, every create/edit dialog's currency picker). Also the exact set
 * `app/_jobs/fetch-fx-rates.ts` (L.10) fetches rates for — "every supported
 * currency" means this list, not a runtime query over currencies actually in
 * use. No crypto currency is selectable anywhere in the app yet, despite
 * CONCEPT.md's "fiat and crypto alike" framing of the rate table's eventual
 * scope — see that job's own doc comment.
 */
export const CURRENCY_OPTIONS: Array<{ code: string; name: string }> = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'ZAR', name: 'South African Rand' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'LKR', name: 'Sri Lankan Rupee' },
  { code: 'AED', name: 'UAE Dirham' },
];
