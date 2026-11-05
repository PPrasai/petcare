/** Money is integer minor units plus an ISO 4217 code. Never a float. */

export function minorDigits(currency: string, locale = 'en'): number {
  const options = new Intl.NumberFormat(locale, { style: 'currency', currency }).resolvedOptions();
  return options.maximumFractionDigits ?? 2;
}

/** 12.34 USD -> 1234. Rounds to the nearest minor unit. */
export function toMinor(amount: number, currency: string): number {
  return Math.round(amount * 10 ** minorDigits(currency));
}

export function fromMinor(amountMinor: number, currency: string): number {
  return amountMinor / 10 ** minorDigits(currency);
}

export function formatMoney(amountMinor: number, currency: string, locale = 'en'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    fromMinor(amountMinor, currency),
  );
}

/** Totals per currency. Different currencies are never summed together. */
export function totalsByCurrency(
  items: { amountMinor: number; currency: string }[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.amountMinor);
  }
  return totals;
}
