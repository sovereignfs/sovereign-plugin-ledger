export function formatMoney(amountMinor: number, currencyCode: string): string {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(
    amountMinor / 100,
  );
}
