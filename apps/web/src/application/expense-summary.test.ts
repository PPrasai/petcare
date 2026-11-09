import { describe, expect, it } from 'vitest';
import {
  categoryTotals,
  displayCurrency,
  grandTotals,
  inPeriod,
  summarise,
} from './expense-summary';
import type { StoredRecord } from './ports/record-store';

const expense = (
  spentOn: string,
  amountMinor: number,
  currency: string,
  petId: string | null,
  deletedAt: string | null = null,
): StoredRecord => ({
  id: `${spentOn}-${amountMinor}-${currency}-${petId}`,
  type: 'expense',
  householdId: 'h',
  version: 1,
  createdBy: 'u',
  updatedAt: '2026-06-01T00:00:00Z',
  deletedAt,
  pending: false,
  data: { spentOn, amountMinor, currency, category: 'vet', ...(petId ? { petId } : {}) },
});

const ALL = [
  expense('2026-06-02', 1000, 'USD', 'momo'),
  expense('2026-06-20', 550, 'USD', 'momo'),
  expense('2026-06-21', 2000, 'NPR', 'momo'),
  expense('2026-06-22', 300, 'USD', 'biralo'),
  expense('2026-06-23', 99, 'USD', null),
  expense('2026-05-31', 7777, 'USD', 'momo'),
  expense('2026-03-01', 4000, 'USD', 'biralo'),
  expense('2026-06-10', 5000, 'USD', 'momo', '2026-06-11T00:00:00Z'),
];

describe('summarise', () => {
  it('totals the month per pet and per currency, never mixing currencies', () => {
    expect(summarise(ALL, '2026-06-15', 'month')).toEqual([
      { petId: 'biralo', currency: 'USD', totalMinor: 300, count: 1 },
      { petId: 'momo', currency: 'NPR', totalMinor: 2000, count: 1 },
      { petId: 'momo', currency: 'USD', totalMinor: 1550, count: 2 },
      { petId: null, currency: 'USD', totalMinor: 99, count: 1 },
    ]);
  });

  it('covers the whole year and skips deleted expenses', () => {
    const rows = summarise(ALL, '2026-06-15', 'year');
    expect(grandTotals(rows)).toEqual([
      { currency: 'NPR', totalMinor: 2000 },
      { currency: 'USD', totalMinor: 1000 + 550 + 300 + 99 + 7777 + 4000 },
    ]);
  });

  it('can be limited to one pet', () => {
    const rows = summarise(ALL, '2026-06-15', 'month', 'biralo');
    expect(rows).toEqual([{ petId: 'biralo', currency: 'USD', totalMinor: 300, count: 1 }]);
  });
});

describe('inPeriod', () => {
  it('compares year and month prefixes', () => {
    expect(inPeriod('2026-06-30', '2026-06-01', 'month')).toBe(true);
    expect(inPeriod('2026-07-01', '2026-06-01', 'month')).toBe(false);
    expect(inPeriod('2026-01-01', '2026-12-31', 'year')).toBe(true);
  });
});

describe('the headline currency and category split', () => {
  it('prefers the preference when it has spending, else the busiest currency, ties alphabetical', () => {
    expect(displayCurrency(ALL, '2026-06-15', 'month', 'NPR')).toBe('NPR');
    expect(displayCurrency(ALL, '2026-06-15', 'month', 'EUR')).toBe('USD');
    const tie = [expense('2026-06-02', 100, 'NPR', null), expense('2026-06-03', 100, 'GBP', null)];
    expect(displayCurrency(tie, '2026-06-15', 'month', 'USD')).toBe('GBP');
    expect(displayCurrency(ALL, '2025-01-01', 'month', 'USD')).toBeNull();
  });

  it('adds one currency per category, largest first, ignoring the others', () => {
    const rows = [
      {
        ...expense('2026-06-02', 500, 'USD', null),
        id: 'a',
        data: { spentOn: '2026-06-02', amountMinor: 500, currency: 'USD', category: 'food' },
      },
      { ...expense('2026-06-03', 900, 'USD', null), id: 'b' },
      {
        ...expense('2026-06-04', 300, 'USD', null),
        id: 'c',
        data: { spentOn: '2026-06-04', amountMinor: 300, currency: 'USD', category: 'food' },
      },
      expense('2026-06-05', 99999, 'NPR', null),
    ];
    expect(categoryTotals(rows, '2026-06-15', 'month', 'USD')).toEqual([
      { category: 'vet', totalMinor: 900 },
      { category: 'food', totalMinor: 800 },
    ]);
  });
});
