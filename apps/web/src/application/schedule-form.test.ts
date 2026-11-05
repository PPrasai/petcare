import { describe, expect, it } from 'vitest';
import { scheduleSchema } from '@petcare/domain';
import { emptyScheduleForm, scheduleFromForm, scheduleToForm } from './schedule-form';

describe('schedule form', () => {
  it('builds a valid daily schedule with times', () => {
    const s = scheduleFromForm({ ...emptyScheduleForm('2026-06-01'), times: '8:00, 20:00' }, 'UTC');
    expect(s).toEqual({
      tz: 'UTC',
      kind: 'daily',
      startOn: '2026-06-01',
      times: ['08:00', '20:00'],
    });
    expect(scheduleSchema.safeParse(s).success).toBe(true);
  });

  it('keeps only the fields of the chosen kind', () => {
    const base = {
      ...emptyScheduleForm('2026-06-01'),
      daysOfWeek: [3, 1],
      dayOfMonth: '5',
      everyN: '2',
    };
    expect(scheduleFromForm({ ...base, kind: 'weekly' }, 'UTC')).toMatchObject({
      daysOfWeek: [1, 3],
    });
    expect(scheduleFromForm({ ...base, kind: 'monthly' }, 'UTC')).toMatchObject({ dayOfMonth: 5 });
    const every = scheduleFromForm({ ...base, kind: 'everyNDays' }, 'UTC');
    expect(every).toMatchObject({ everyN: 2 });
    expect(every).not.toHaveProperty('daysOfWeek');
  });

  it('a weekly schedule without days is refused by the schema', () => {
    const s = scheduleFromForm({ ...emptyScheduleForm('2026-06-01'), kind: 'weekly' }, 'UTC');
    expect(scheduleSchema.safeParse(s).success).toBe(false);
  });

  it('round-trips a stored schedule', () => {
    const stored = scheduleSchema.parse({
      tz: 'UTC',
      kind: 'everyNDays',
      everyN: 3,
      times: ['09:30'],
      startOn: '2026-06-01',
      endOn: '2026-07-01',
    });
    expect(scheduleFromForm(scheduleToForm(stored), 'UTC')).toEqual(stored);
  });
});
