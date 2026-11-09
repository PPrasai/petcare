import { DEMO_SEED, resolveDemoRecords } from '@petcare/domain';
import { describe, expect, it } from 'vitest';
import { VACCINE_SOON_DAYS, rankPets } from './ranking';
import type { StoredRecord } from './ports/record-store';
import { buildToday } from './today';

// P2 demo seed: four pets with mixed urgency, one of each label, at a fixed moment.
const NOW = new Date('2026-06-10T12:00:00Z');

describe('demo seed on Home', () => {
  const stored: StoredRecord[] = resolveDemoRecords(NOW).map((r) => ({
    id: r.id,
    type: r.type,
    householdId: r.householdId,
    version: r.version,
    createdBy: r.createdBy,
    updatedAt: r.updatedAt,
    deletedAt: r.deletedAt,
    pending: false,
    data: r.data,
  }));
  const pets = stored
    .filter((r) => r.type === 'pet')
    .map((r) => ({ id: r.id, name: String(r.data.name), archived: false }));
  const view = buildToday(stored, {
    now: NOW,
    tz: 'UTC',
    userId: DEMO_SEED.user.id,
    petId: null,
    horizonDays: VACCINE_SOON_DAYS,
  });
  const ranked = rankPets(pets, view, NOW);

  it('ranks overdue, due today, coming up and all caught up in that order', () => {
    expect(ranked.map((r) => [r.pet.name, r.label])).toEqual([
      ['Momo', 'needsYou'],
      ['Biralo', 'dueToday'],
      ['Miso', 'comingUp'],
      ['Pip', 'allCaughtUp'],
    ]);
  });

  it('shows the vaccine 20 days out as coming up, from 30 days before it is due', () => {
    const miso = ranked.find((r) => r.pet.name === 'Miso');
    expect(miso?.top).toMatchObject({ sourceType: 'vaccination', title: 'Rabies' });
  });
});
