import { describe, expect, it } from 'vitest';
import { doneSet, dueOccurrences, occurrenceStatus, snoozeMap } from '../src';
import type { RecordEnvelope } from '../src';

const H = '01930f6e-0000-7000-8000-000000000001';
const PET = '01930f6e-0000-7000-8000-0000000000a1';
const TZ = 'Asia/Kathmandu';

function rec(
  id: string,
  type: RecordEnvelope['type'],
  data: Record<string, unknown>,
  deletedAt: string | null = null,
): RecordEnvelope {
  return {
    id,
    type,
    householdId: H,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    createdBy: 'u1',
    updatedAt: '2026-01-01T00:00:00Z',
    updatedBy: 'u1',
    deletedAt,
    data,
  };
}
const window = { from: '2026-06-01T00:00:00Z', to: '2026-07-31T00:00:00Z' };

describe('due occurrences (CON-002 2.6)', () => {
  it('vaccination: one occurrence at nextDueOn 09:00 local', () => {
    const v = rec('v1', 'vaccination', {
      petId: PET,
      vaccineName: 'Rabies',
      givenOn: '2025-06-10',
      nextDueOn: '2026-06-10',
    });
    expect(dueOccurrences([v], window, TZ)).toEqual([
      {
        sourceType: 'vaccination',
        sourceId: 'v1',
        petId: PET,
        occurrenceAt: '2026-06-10T03:15:00Z',
      },
    ]);
  });
  it('vaccination: dropped when a later one with the same name exists', () => {
    const old = rec('v1', 'vaccination', {
      petId: PET,
      vaccineName: 'Rabies',
      givenOn: '2025-06-10',
      nextDueOn: '2026-06-10',
    });
    const newer = rec('v2', 'vaccination', {
      petId: PET,
      vaccineName: ' rabies ',
      givenOn: '2026-06-05',
      nextDueOn: '2027-06-05',
    });
    const ids = dueOccurrences([old, newer], window, TZ).map((o) => o.sourceId);
    expect(ids).toEqual([]);
  });
  it('vet visit follow-up, inactive routines and deleted records', () => {
    const visit = rec('d1', 'vetVisit', {
      petId: PET,
      visitedOn: '2026-06-01',
      followUpOn: '2026-06-20',
    });
    const off = rec('r1', 'careRoutine', {
      petId: PET,
      kind: 'walk',
      title: 'Walk',
      active: false,
      schedule: { tz: TZ, kind: 'daily', startOn: '2026-06-01' },
    });
    const gone = rec(
      'r2',
      'reminder',
      { title: 'x', active: true, schedule: { tz: TZ, kind: 'daily', startOn: '2026-06-01' } },
      '2026-06-02T00:00:00Z',
    );
    expect(dueOccurrences([visit, off, gone], window, TZ).map((o) => o.sourceId)).toEqual(['d1']);
  });
});

describe('done, snoozed, overdue', () => {
  const med = rec('m1', 'medication', {
    petId: PET,
    name: 'Pill',
    schedule: { tz: TZ, kind: 'daily', startOn: '2026-06-01' },
  });
  const occ = {
    sourceType: 'medication' as const,
    sourceId: 'm1',
    petId: PET,
    occurrenceAt: '2026-06-02T03:15:00Z',
  };
  const now = '2026-06-02T10:00:00Z';

  it('is overdue when past, not done and not snoozed', () => {
    expect(occurrenceStatus(occ, now, doneSet([med]), snoozeMap([med], 'u1'))).toBe('overdue');
  });
  it('is upcoming when in the future', () => {
    expect(occurrenceStatus(occ, '2026-06-02T00:00:00Z', new Set(), new Map())).toBe('upcoming');
  });
  it('is done with a dose, including a skipped one, but not a deleted dose', () => {
    const dose = rec('x1', 'medicationDose', {
      medicationId: 'm1',
      petId: PET,
      occurrenceAt: '2026-06-02T03:15:00.000Z',
      givenAt: now,
      skipped: true,
    });
    expect(occurrenceStatus(occ, now, doneSet([dose]), new Map())).toBe('done');
    const deleted = { ...dose, deletedAt: now };
    expect(occurrenceStatus(occ, now, doneSet([deleted]), new Map())).toBe('overdue');
  });
  it('is snoozed only for the snoozing user and only until snoozedUntil', () => {
    const snooze = rec('s1', 'reminderSnooze', {
      sourceType: 'medication',
      sourceId: 'm1',
      occurrenceAt: occ.occurrenceAt,
      snoozedUntil: '2026-06-02T12:00:00Z',
      userId: 'u1',
    });
    expect(occurrenceStatus(occ, now, new Set(), snoozeMap([snooze], 'u1'))).toBe('snoozed');
    expect(occurrenceStatus(occ, now, new Set(), snoozeMap([snooze], 'u2'))).toBe('overdue');
    expect(
      occurrenceStatus(occ, '2026-06-02T12:30:00Z', new Set(), snoozeMap([snooze], 'u1')),
    ).toBe('overdue');
  });
});
