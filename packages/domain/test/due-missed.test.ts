import { describe, expect, it } from 'vitest';
import { applyMissedRule, doneSet, dueOccurrences, occurrenceStatus, snoozeMap } from '../src';
import type { RecordEnvelope, Schedule } from '../src';

// I-18: the missed daily/weekly listing rule (CON-003 2.6).
const TZ = 'Asia/Kathmandu';
const rec = (id: string, type: RecordEnvelope['type'], data: Record<string, unknown>) =>
  ({
    id,
    type,
    householdId: 'h',
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'u1',
    deletedAt: null,
    data,
  }) as RecordEnvelope;

function listed(schedule: Schedule, now: string, window = 30): string[] {
  const records = [rec('r1', 'reminder', { title: 't', active: true, schedule })];
  const nowMs = Date.parse(now);
  const occ = dueOccurrences(records, { from: new Date(nowMs - window * 86_400_000), to: now }, TZ);
  const done = doneSet(records);
  const snoozes = snoozeMap(records, 'u1');
  const status = (o: (typeof occ)[number]) => occurrenceStatus(o, now, done, snoozes);
  return applyMissedRule(occ, records, now, status).map((o) => o.occurrenceAt);
}

describe('missed daily/weekly rule', () => {
  const daily: Schedule = { tz: TZ, kind: 'daily', startOn: '2026-06-01', times: ['08:00'] };
  it('lists at most one overdue daily item per source', () => {
    // 08:00 local on 5 June has started, so 3 and 4 June are no longer listed.
    expect(listed(daily, '2026-06-05T04:00:00Z')).toEqual(['2026-06-05T02:15:00Z']);
  });
  it('keeps yesterday while today has not started', () => {
    expect(listed(daily, '2026-06-05T01:00:00Z')).toEqual(['2026-06-04T02:15:00Z']);
  });
  it('weekly lists the latest missed one only', () => {
    const weekly: Schedule = { ...daily, kind: 'weekly', daysOfWeek: [1] };
    const got = listed(weekly, '2026-06-20T00:00:00Z'); // Saturday
    expect(got).toEqual(['2026-06-15T02:15:00Z']);
  });
  it('keeps the 30-day window for monthly and yearly', () => {
    const monthly: Schedule = { ...daily, kind: 'monthly', dayOfMonth: 2 };
    expect(listed(monthly, '2026-06-20T00:00:00Z')).toEqual(['2026-06-02T02:15:00Z']);
    const yearly: Schedule = { ...daily, kind: 'yearly', startOn: '2026-06-02' };
    expect(listed(yearly, '2026-06-20T00:00:00Z')).toEqual(['2026-06-02T02:15:00Z']);
  });
});

describe('audience', () => {
  const schedule: Schedule = { tz: TZ, kind: 'daily', startOn: '2026-06-01', times: ['08:00'] };
  const window = { from: '2026-06-02T00:00:00Z', to: '2026-06-02T12:00:00Z' };
  const records = [
    rec('mine', 'reminder', { title: 'a', active: true, schedule, audienceUserId: 'u1' }),
    rec('all', 'reminder', { title: 'b', active: true, schedule, audienceUserId: null }),
  ];
  it('only the audience user gets a Just-me reminder', () => {
    expect(dueOccurrences(records, window, TZ, 'u1').map((o) => o.sourceId)).toEqual([
      'mine',
      'all',
    ]);
    expect(dueOccurrences(records, window, TZ, 'u2').map((o) => o.sourceId)).toEqual(['all']);
  });
  it('without a user nothing is filtered', () => {
    expect(dueOccurrences(records, window, TZ)).toHaveLength(2);
  });
});
