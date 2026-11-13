import { describe, expect, it } from 'vitest';
import type { Schedule } from '@petcare/domain';
import { emptyReminderForm, reminderSchedule, reminderToForm } from './reminder-form';

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
    expect(reminderSchedule(v, 'UTC', TODAY).times).toEqual(['09:00', '20:00']);
    expect(reminderSchedule({ ...v, time2: '09:00' }, 'UTC', TODAY).times).toEqual(['09:00']);
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
