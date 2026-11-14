import { describe, expect, it } from 'vitest';
import type { Schedule } from '@petcare/domain';
import {
  audienceOf,
  emptyReminderForm,
  notBeforeFor,
  reminderSchedule,
  reminderToForm,
} from './reminder-form';

const TODAY = '2026-11-09';
const base: Schedule = { tz: 'UTC', kind: 'daily', startOn: '2026-10-01', times: ['08:00'] };

describe('reminderSchedule', () => {
  it('builds a one-off on its date', () => {
    const v = {
      ...emptyReminderForm(TODAY),
      repeat: 'once' as const,
      date: '2026-11-20',
      time: '07:30',
    };
    expect(reminderSchedule(v, 'UTC', TODAY)).toEqual({
      tz: 'UTC',
      kind: 'once',
      startOn: '2026-11-20',
      times: ['07:30'],
    });
  });

  it('builds a daily reminder with a second time, and drops a repeated one', () => {
    const v = { ...emptyReminderForm(TODAY), time2: '20:00' };
    expect(reminderSchedule(v, 'UTC', TODAY).times).toEqual(['18:00', '20:00']);
    expect(reminderSchedule({ ...v, time2: '18:00' }, 'UTC', TODAY).times).toEqual(['18:00']);
  });

  it('builds a weekly reminder with sorted days and a monthly one with the day of the month', () => {
    const w = { ...emptyReminderForm(TODAY), repeat: 'weekly' as const, days: [5, 1] };
    expect(reminderSchedule(w, 'UTC', TODAY)).toMatchObject({ daysOfWeek: [1, 5], startOn: TODAY });
    const m = { ...emptyReminderForm(TODAY), repeat: 'monthly' as const, date: '2026-11-17' };
    expect(reminderSchedule(m, 'UTC', TODAY)).toMatchObject({
      dayOfMonth: 17,
      startOn: '2026-11-17',
    });
  });

  it('keeps the start date, end date and later times of the stored schedule on an edit', () => {
    const stored: Schedule = {
      ...base,
      times: ['08:00', '12:00', '16:00', '20:00'],
      endOn: '2027-01-01',
    };
    const v = reminderToForm('Meds', stored);
    expect(reminderSchedule({ ...v, time: '09:00' }, 'UTC', TODAY, stored)).toMatchObject({
      startOn: '2026-10-01',
      endOn: '2027-01-01',
      times: ['09:00', '12:00', '16:00', '20:00'],
    });
  });

  it('round-trips a legacy every-N-days schedule', () => {
    const stored: Schedule = { tz: 'UTC', kind: 'everyNDays', startOn: TODAY, everyN: 3 };
    const v = reminderToForm('Drops', stored);
    expect(v.repeat).toBe('everyNDays');
    expect(reminderSchedule(v, 'UTC', TODAY, stored)).toMatchObject({
      kind: 'everyNDays',
      everyN: 3,
    });
  });
});

describe('notBefore (CON-003 2.6)', () => {
  const NOW = new Date('2026-11-09T18:00:00Z');
  const v = { ...emptyReminderForm(TODAY), time: '08:00' };

  it('is now for a new schedule, except a one-off, which keeps its own date', () => {
    expect(reminderSchedule(v, 'UTC', TODAY, undefined, NOW).notBefore).toBe(NOW.toISOString());
    const once = { ...v, repeat: 'once' as const };
    expect('notBefore' in reminderSchedule(once, 'UTC', TODAY, undefined, NOW)).toBe(false);
  });

  it('is kept when an edit leaves the schedule alone and renewed when it changes', () => {
    const earlier = '2026-10-01T10:00:00.000Z';
    const stored: Schedule = { ...base, startOn: TODAY, notBefore: earlier };
    const form = reminderToForm('Meds', stored);
    expect(reminderSchedule(form, 'UTC', TODAY, stored, NOW).notBefore).toBe(earlier);
    const moved = reminderSchedule({ ...form, time: '09:30' }, 'UTC', TODAY, stored, NOW);
    expect(moved.notBefore).toBe(NOW.toISOString());
    // The end date is not a schedule change.
    const ends = { ...stored, endOn: '2027-01-01' };
    expect(notBeforeFor({ ...stored, endOn: '2027-06-01' }, ends, NOW)).toBe(earlier);
  });

  it('writes yearly with its date, and reads an audience as seen by one user', () => {
    const yearly = { ...v, repeat: 'yearly' as const, date: '2027-03-01' };
    expect(reminderSchedule(yearly, 'UTC', TODAY, undefined, NOW)).toMatchObject({
      kind: 'yearly',
      startOn: '2027-03-01',
    });
    expect(audienceOf(null, 'u1')).toBe('everyone');
    expect(audienceOf('u1', 'u1')).toBe('me');
    expect(audienceOf('u2', 'u1')).toBe('other');
  });
});
