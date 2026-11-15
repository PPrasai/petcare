import { describe, expect, it } from 'vitest';
import { weekAhead } from './week-ahead';
import type { TodayItem, TodayView } from './today';

const NOW = new Date('2026-11-09T12:00:00Z');
const days = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

let n = 0;
const item = (at: string, extra: Partial<TodayItem> = {}): TodayItem => ({
  key: `k${n++}`,
  sourceType: 'reminder',
  sourceId: `s${n}`,
  petId: 'p',
  petName: 'Momo',
  title: `Task ${n}`,
  occurrenceAt: at,
  skipped: false,
  doneBy: null,
  snoozedUntil: null,
  ...extra,
});
const view = (upcoming: TodayItem[]): TodayView => ({
  overdue: [],
  today: [],
  upcoming,
  snoozed: [],
  done: [],
});

describe('weekAhead', () => {
  const table: [string, TodayItem[], number, number][] = [
    ['nothing upcoming', [], 0, 0],
    ['items inside the window are listed', [item(days(1)), item(days(6.5))], 2, 0],
    ['an item past 7 days is left out', [item(days(7.5)), item(days(30))], 0, 0],
    ['exactly 7 days ahead is in', [item(days(7))], 1, 0],
    ['an item that is already past is left out', [item(days(-1))], 0, 0],
    ['meals are never listed', [item(days(2), { routineKind: 'feeding' })], 0, 0],
    ['an item without a pet is left out', [item(days(2), { petId: null, petName: null })], 0, 0],
    [
      'more than five: five are listed and the rest are counted',
      Array.from({ length: 8 }, (_, i) => item(days(1 + i * 0.5))),
      5,
      3,
    ],
  ];
  for (const [name, upcoming, shown, more] of table) {
    it(name, () => {
      const result = weekAhead(view(upcoming), NOW);
      expect(result.items).toHaveLength(shown);
      expect(result.more).toBe(more);
    });
  }

  it('lists the soonest first, whatever the order of the input', () => {
    const late = item(days(5));
    const soon = item(days(1));
    const mid = item(days(3));
    expect(weekAhead(view([late, soon, mid]), NOW).items).toEqual([soon, mid, late]);
  });

  it('keeps the limit it is given', () => {
    const items = Array.from({ length: 4 }, (_, i) => item(days(1 + i)));
    const result = weekAhead(view(items), NOW, 2);
    expect(result.items).toHaveLength(2);
    expect(result.more).toBe(2);
  });
});
