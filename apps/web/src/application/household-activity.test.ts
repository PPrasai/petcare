import { describe, expect, it } from 'vitest';
import { buildHouseholdActivity } from './household-activity';
import type { StoredRecord } from './ports/record-store';

const log = (id: string, petId: string, at: string, by = 'u1'): StoredRecord => ({
  id,
  type: 'careLog',
  householdId: 'h',
  version: 1,
  createdBy: by,
  updatedAt: at,
  deletedAt: null,
  pending: false,
  data: { petId, kind: 'walk', durationMin: 20, occurredAt: at },
});
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 9, 8, minutes)).toISOString();

describe('buildHouseholdActivity', () => {
  it('merges the pets, newest first, and tags each line with its pet', () => {
    const rows = [log('a', 'p1', at(1)), log('b', 'p2', at(3)), log('c', 'p1', at(2))];
    const out = buildHouseholdActivity(rows, ['p1', 'p2']);
    expect(out.map((e) => [e.key, e.petId])).toEqual([
      ['b', 'p2'],
      ['c', 'p1'],
      ['a', 'p1'],
    ]);
  });

  it('is empty when there are no pets or no records', () => {
    expect(buildHouseholdActivity([], ['p1'])).toEqual([]);
    expect(buildHouseholdActivity([log('a', 'p1', at(1))], [])).toEqual([]);
  });

  it('ignores deleted records and records of a pet that is not listed', () => {
    const gone = { ...log('a', 'p1', at(1)), deletedAt: at(5) };
    const other = log('b', 'p9', at(2));
    expect(buildHouseholdActivity([gone, other], ['p1'])).toEqual([]);
  });

  const many = (pets: string[], each: number) =>
    pets.flatMap((p, pi) =>
      Array.from({ length: each }, (_, i) => log(`${p}-${i}`, p, at(i * 3 + pi))),
    );

  const bounds: [string, number, number, number][] = [
    // name, pets, records per pet, expected lines
    ['a few lines are all kept', 2, 3, 6],
    ['one busy pet is cut to 20', 1, 50, 20],
    ['many busy pets are cut to 20 in all', 5, 40, 20],
  ];
  for (const [name, pets, each, expected] of bounds) {
    it(name, () => {
      const ids = Array.from({ length: pets }, (_, i) => `p${i}`);
      expect(buildHouseholdActivity(many(ids, each), ids)).toHaveLength(expected);
    });
  }

  it('reads at most the per-pet bound from each pet, so a quiet pet still shows', () => {
    const busy = Array.from({ length: 30 }, (_, i) => log(`b${i}`, 'busy', at(30 + i)));
    const quiet = [log('q', 'quiet', at(1))];
    const out = buildHouseholdActivity([...busy, ...quiet], ['busy', 'quiet'], 50, 5);
    expect(out.filter((e) => e.petId === 'busy')).toHaveLength(5);
    expect(out.some((e) => e.petId === 'quiet')).toBe(true);
  });
});
