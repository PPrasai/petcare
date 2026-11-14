import { describe, expect, it } from 'vitest';
import { buildActivity } from './activity';
import type { StoredRecord } from './ports/record-store';

const PET = 'pet-1';
let n = 0;
const rec = (
  type: StoredRecord['type'],
  data: Record<string, unknown>,
  over: Partial<StoredRecord> = {},
): StoredRecord => ({
  id: `r${n++}`,
  type,
  householdId: 'h',
  version: 1,
  createdBy: 'me',
  updatedAt: '2026-11-09T10:00:00.000Z',
  deletedAt: null,
  pending: false,
  data,
  ...over,
});

describe('buildActivity', () => {
  it('merges care logs, completions and notes of one pet, newest first', () => {
    const routine = rec('careRoutine', { petId: PET, title: 'Evening walk' });
    const all = [
      rec('careLog', {
        petId: PET,
        kind: 'walk',
        occurredAt: '2026-11-09T09:00:00Z',
        durationMin: 30,
      }),
      rec('symptomEntry', {
        petId: PET,
        observedAt: '2026-11-09T11:00:00Z',
        description: 'Itching',
      }),
      routine,
      rec('careCompletion', {
        routineId: routine.id,
        petId: PET,
        completedAt: '2026-11-08T18:00:00Z',
      }),
      rec('careLog', {
        petId: 'other',
        kind: 'walk',
        occurredAt: '2026-11-09T12:00:00Z',
        durationMin: 15,
      }),
    ];
    const out = buildActivity(all, PET);
    expect(out.map((e) => e.kind)).toEqual(['note', 'walk', 'done']);
    expect(out[2]).toMatchObject({ title: 'Evening walk', skipped: false });
  });

  it('skips deleted records and shows a medication check-off once', () => {
    const log = rec('careLog', {
      petId: PET,
      kind: 'medication',
      occurredAt: '2026-11-09T08:00:00Z',
      medicationName: 'Carprofen 25mg',
      medicationId: 'm1',
    });
    const dose = rec('medicationDose', {
      medicationId: 'm1',
      petId: PET,
      givenAt: '2026-11-09T10:00:00Z',
      skipped: false,
    });
    const gone = rec(
      'careLog',
      { petId: PET, kind: 'walk', occurredAt: '2026-11-09T07:00:00Z', durationMin: 15 },
      { deletedAt: '2026-11-09T10:01:00Z' },
    );
    expect(buildActivity([log, dose, gone], PET).map((e) => e.kind)).toEqual(['medication']);
  });
});
