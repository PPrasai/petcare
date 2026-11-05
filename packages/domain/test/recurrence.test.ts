import { describe, expect, it } from 'vitest';
import { dueAtNineLocal, localToInstant, occurrencesBetween } from '../src';
import type { Schedule } from '../src';

// I-12: recurrence obeys CON-002 2.6 in America/New_York and Asia/Kathmandu.
const NY = 'America/New_York';
const KTM = 'Asia/Kathmandu';
const iso = (d: Date) => d.toISOString();

function schedule(
  partial: Partial<Schedule> & Pick<Schedule, 'tz' | 'kind' | 'startOn'>,
): Schedule {
  return partial;
}

describe('local time to instant', () => {
  it('converts a normal time', () => {
    expect(iso(localToInstant('2026-01-15', '09:00', NY))).toBe('2026-01-15T14:00:00.000Z');
    expect(iso(localToInstant('2026-01-15', '09:00', KTM))).toBe('2026-01-15T03:15:00.000Z');
  });
  it('shifts a time in the DST gap forward by the gap length', () => {
    // 2026-03-08 02:30 does not exist in New York; it becomes 03:30 EDT.
    expect(iso(localToInstant('2026-03-08', '02:30', NY))).toBe('2026-03-08T07:30:00.000Z');
  });
  it('uses the first occurrence for a time in the DST overlap', () => {
    // 2026-11-01 01:30 happens twice in New York; the first is 01:30 EDT = 05:30Z.
    expect(iso(localToInstant('2026-11-01', '01:30', NY))).toBe('2026-11-01T05:30:00.000Z');
  });
  it('is not affected by DST in Kathmandu (fixed +05:45)', () => {
    expect(iso(localToInstant('2026-03-08', '02:30', KTM))).toBe('2026-03-07T20:45:00.000Z');
  });
});

describe('occurrences', () => {
  it('defaults to 09:00 local when times is empty', () => {
    const s = schedule({ tz: NY, kind: 'daily', startOn: '2026-06-01' });
    expect(occurrencesBetween(s, '2026-06-01T00:00:00Z', '2026-06-02T23:59:59Z')).toEqual([
      '2026-06-01T13:00:00Z',
      '2026-06-02T13:00:00Z',
    ]);
  });
  it('keeps the local time across the spring DST change', () => {
    const s = schedule({ tz: NY, kind: 'daily', startOn: '2026-03-06', times: ['08:00'] });
    expect(occurrencesBetween(s, '2026-03-07T00:00:00Z', '2026-03-10T00:00:00Z')).toEqual([
      '2026-03-07T13:00:00Z', // EST
      '2026-03-08T12:00:00Z', // EDT
      '2026-03-09T12:00:00Z',
    ]);
  });
  it('shifts a daily 02:30 forward on the gap day only', () => {
    const s = schedule({ tz: NY, kind: 'daily', startOn: '2026-03-07', times: ['02:30'] });
    expect(occurrencesBetween(s, '2026-03-07T00:00:00Z', '2026-03-09T23:00:00Z')).toEqual([
      '2026-03-07T07:30:00Z',
      '2026-03-08T07:30:00Z', // 03:30 EDT
      '2026-03-09T06:30:00Z',
    ]);
  });
  it('returns one occurrence on the overlap day', () => {
    const s = schedule({ tz: NY, kind: 'daily', startOn: '2026-11-01', times: ['01:30'] });
    expect(occurrencesBetween(s, '2026-11-01T00:00:00Z', '2026-11-01T23:59:59Z')).toEqual([
      '2026-11-01T05:30:00Z',
    ]);
  });
  it('clamps monthly day 31 to the last day of short months', () => {
    const s = schedule({ tz: NY, kind: 'monthly', startOn: '2026-01-01', dayOfMonth: 31 });
    const got = occurrencesBetween(s, '2026-01-01T00:00:00Z', '2026-05-01T00:00:00Z');
    expect(got).toEqual([
      '2026-01-31T14:00:00Z',
      '2026-02-28T14:00:00Z',
      '2026-03-31T13:00:00Z',
      '2026-04-30T13:00:00Z',
    ]);
  });
  it('clamps monthly day 30 to 29 in a leap February', () => {
    const s = schedule({ tz: KTM, kind: 'monthly', startOn: '2028-01-01', dayOfMonth: 30 });
    const got = occurrencesBetween(s, '2028-02-01T00:00:00Z', '2028-02-29T23:59:59Z');
    expect(got).toEqual(['2028-02-29T03:15:00Z']);
  });
  it('handles weekly schedules on ISO weekdays', () => {
    // 2026-06-01 is a Monday. Mon + Thu at 18:00 Kathmandu = 12:15Z.
    const s = schedule({
      tz: KTM,
      kind: 'weekly',
      startOn: '2026-06-01',
      daysOfWeek: [1, 4],
      times: ['18:00'],
    });
    expect(occurrencesBetween(s, '2026-06-01T00:00:00Z', '2026-06-08T23:59:59Z')).toEqual([
      '2026-06-01T12:15:00Z',
      '2026-06-04T12:15:00Z',
      '2026-06-08T12:15:00Z',
    ]);
  });
  it('handles everyNDays counted from startOn', () => {
    const s = schedule({ tz: KTM, kind: 'everyNDays', startOn: '2026-06-01', everyN: 3 });
    expect(occurrencesBetween(s, '2026-06-05T00:00:00Z', '2026-06-13T00:00:00Z')).toEqual([
      '2026-06-07T03:15:00Z',
      '2026-06-10T03:15:00Z',
    ]);
  });
  it('stops at endOn and starts at startOn', () => {
    const s = schedule({ tz: KTM, kind: 'daily', startOn: '2026-06-03', endOn: '2026-06-04' });
    expect(occurrencesBetween(s, '2026-06-01T00:00:00Z', '2026-06-10T00:00:00Z')).toEqual([
      '2026-06-03T03:15:00Z',
      '2026-06-04T03:15:00Z',
    ]);
  });
  it('once yields only startOn', () => {
    const s = schedule({ tz: NY, kind: 'once', startOn: '2026-07-04', times: ['10:00', '16:00'] });
    expect(occurrencesBetween(s, '2026-01-01T00:00:00Z', '2027-01-01T00:00:00Z')).toEqual([
      '2026-07-04T14:00:00Z',
      '2026-07-04T20:00:00Z',
    ]);
  });
  it('a single due date is 09:00 local', () => {
    expect(dueAtNineLocal('2026-12-01', KTM)).toBe('2026-12-01T03:15:00Z');
  });
});
