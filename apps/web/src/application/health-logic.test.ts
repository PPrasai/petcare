import { describe, expect, it } from 'vitest';
import { addDays, courseEnded, doseSlots, vaccinationBadge } from './health-logic';
import type { StoredRecord } from './ports/record-store';

const rec = (
  id: string,
  type: StoredRecord['type'],
  data: Record<string, unknown>,
): StoredRecord => ({
  id,
  type,
  householdId: 'h',
  version: 1,
  createdBy: 'u',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  pending: false,
  data,
});

const vac = (id: string, givenOn: string, nextDueOn: string | null, name = 'Rabies') =>
  rec(id, 'vaccination', { petId: 'p', vaccineName: name, givenOn, nextDueOn });

describe('vaccinationBadge', () => {
  const today = '2026-06-10';
  it('flags overdue, due soon and upcoming', () => {
    expect(vaccinationBadge(vac('a', '2025-06-01', '2026-06-01'), [], today)).toBe('overdue');
    expect(vaccinationBadge(vac('a', '2025-06-20', '2026-06-20'), [], today)).toBe('dueSoon');
    expect(vaccinationBadge(vac('a', '2026-01-01', '2027-01-01'), [], today)).toBe('upcoming');
    expect(vaccinationBadge(vac('a', '2026-01-01', null), [], today)).toBe('none');
  });

  it('shows nothing once a later dose of the same vaccine exists', () => {
    const old = vac('a', '2025-06-01', '2026-06-01');
    const next = vac('b', '2026-06-05', '2027-06-05', ' rabies ');
    expect(vaccinationBadge(old, [old, next], today)).toBe('none');
    expect(vaccinationBadge(next, [old, next], today)).toBe('upcoming');
    const other = vac('c', '2026-06-05', '2027-06-05', 'Distemper');
    expect(vaccinationBadge(old, [old, other], today)).toBe('overdue');
  });
});

describe('doseSlots', () => {
  const med = rec('m', 'medication', {
    petId: 'p',
    name: 'Pill',
    schedule: {
      tz: 'UTC',
      kind: 'daily',
      times: ['08:00', '20:00'],
      startOn: '2026-06-01',
      endOn: null,
    },
  });

  it('lists scheduled doses around now and attaches logged ones', () => {
    const dose = rec('d', 'medicationDose', {
      medicationId: 'm',
      petId: 'p',
      occurrenceAt: '2026-06-10T08:00:00Z',
      givenAt: '2026-06-10T08:05:00Z',
      skipped: false,
    });
    const slots = doseSlots(med, [dose], new Date('2026-06-10T10:00:00Z'), 14, 12);
    expect(slots.map((s) => s.occurrenceAt)).toEqual([
      '2026-06-09T20:00:00Z',
      '2026-06-10T08:00:00Z',
      '2026-06-10T20:00:00Z',
    ]);
    expect(slots[1]?.dose?.id).toBe('d');
    expect(slots[0]?.dose).toBeUndefined();
  });

  it('knows when a course has ended', () => {
    const ended = rec('m', 'medication', {
      schedule: { tz: 'UTC', kind: 'daily', startOn: '2026-06-01', endOn: '2026-06-05' },
    });
    expect(courseEnded(ended, '2026-06-06')).toBe(true);
    expect(courseEnded(ended, '2026-06-05')).toBe(false);
    expect(courseEnded(med, '2030-01-01')).toBe(false);
  });
});

describe('addDays', () => {
  it('crosses month and year ends', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
