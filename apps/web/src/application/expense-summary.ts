import { totalsByCurrency } from '@petcare/domain';
import type { StoredRecord } from './ports/record-store';

export type Period = 'month' | 'year';

export interface SummaryRow {
  /** Pet id, or null for expenses that belong to no pet. */
  petId: string | null;
  currency: string;
  totalMinor: number;
  count: number;
}

/** Whether a calendar date (YYYY-MM-DD) falls in the month or year of `anchor`. */
export function inPeriod(date: string, anchor: string, period: Period): boolean {
  return date.startsWith(period === 'month' ? anchor.slice(0, 7) : anchor.slice(0, 4));
}

/**
 * Totals for the period, per pet and per currency. Currencies are never added together.
 * Rows are ordered by pet (no-pet last) and then by currency.
 */
export function summarise(
  expenses: StoredRecord[],
  anchor: string,
  period: Period,
  petId?: string,
): SummaryRow[] {
  const inRange = expenses.filter(
    (e) =>
      e.deletedAt === null &&
      inPeriod(String(e.data.spentOn), anchor, period) &&
      (petId === undefined || e.data.petId === petId),
  );
  const byPet = new Map<string | null, StoredRecord[]>();
  for (const e of inRange) {
    const key = typeof e.data.petId === 'string' ? e.data.petId : null;
    byPet.set(key, [...(byPet.get(key) ?? []), e]);
  }
  const rows: SummaryRow[] = [];
  for (const [pet, list] of byPet) {
    const totals = totalsByCurrency(
      list.map((e) => ({
        amountMinor: Number(e.data.amountMinor),
        currency: String(e.data.currency),
      })),
    );
    for (const [currency, totalMinor] of totals) {
      const count = list.filter((e) => e.data.currency === currency).length;
      rows.push({ petId: pet, currency, totalMinor, count });
    }
  }
  return rows.sort(
    (a, b) =>
      Number(a.petId === null) - Number(b.petId === null) ||
      String(a.petId).localeCompare(String(b.petId)) ||
      a.currency.localeCompare(b.currency),
  );
}

/** The grand total per currency across the summary rows. */
export function grandTotals(rows: SummaryRow[]): { currency: string; totalMinor: number }[] {
  const totals = totalsByCurrency(
    rows.map((r) => ({ amountMinor: r.totalMinor, currency: r.currency })),
  );
  return [...totals]
    .map(([currency, totalMinor]) => ({ currency, totalMinor }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}
