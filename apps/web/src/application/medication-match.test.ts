import { describe, expect, it } from 'vitest';
import { matchMedicationTask } from './medication-match';
import type { TodayItem } from './today';

const PET = 'pet-1';
const item = (over: Partial<TodayItem>): TodayItem => ({
  key: 'k',
  sourceType: 'medication',
  sourceId: 'med-1',
  petId: PET,
  petName: 'Momo',
  title: 'Carprofen',
  occurrenceAt: '2026-11-09T08:00:00Z',
  skipped: false,
  doneBy: null,
  snoozedUntil: null,
  ...over,
});

// QA-29: which open task a medication log checks off.
describe('matchMedicationTask', () => {
  it('matches a logged name that contains the medication name, ignoring case', () => {
    expect(matchMedicationTask('carprofen 25MG', PET, [item({})])?.sourceId).toBe('med-1');
  });

  it('takes the earliest open dose', () => {
    const late = item({ occurrenceAt: '2026-11-09T20:00:00Z' });
    const early = item({ occurrenceAt: '2026-11-09T08:00:00Z' });
    expect(matchMedicationTask('Carprofen', PET, [late, early])?.occurrenceAt).toBe(
      early.occurrenceAt,
    );
  });

  it('never matches a name under 3 characters, or such a medication', () => {
    expect(matchMedicationTask('Ca', PET, [item({ title: 'Ca' })])).toBeNull();
    expect(matchMedicationTask('Rx 5mg', PET, [item({ title: 'Rx' })])).toBeNull();
  });

  it('ignores done doses, other pets, and tasks that are not medications', () => {
    expect(matchMedicationTask('Carprofen', PET, [item({ doneBy: 'me' })])).toBeNull();
    expect(matchMedicationTask('Carprofen', PET, [item({ petId: 'other' })])).toBeNull();
    expect(matchMedicationTask('Carprofen', PET, [item({ sourceType: 'reminder' })])).toBeNull();
  });

  it('with a chosen medication matches only that one', () => {
    const a = item({ sourceId: 'a', title: 'Carprofen' });
    const b = item({ sourceId: 'b', title: 'Apoquel' });
    expect(matchMedicationTask('Apoquel 5mg', PET, [a, b], 'b')?.sourceId).toBe('b');
    expect(matchMedicationTask('Apoquel 5mg', PET, [a], 'b')).toBeNull();
  });
});
