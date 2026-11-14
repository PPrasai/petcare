import { describe, expect, it } from 'vitest';
import { WEIGHTS, rankPets, summarize } from './ranking';
import type { RankablePet } from './ranking';
import type { TodayItem, TodayView } from './today';

// QA-25: ranking correctness, table-driven (AS-petcare-002 4.2).
const NOW = new Date('2026-11-09T12:00:00Z');
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

let n = 0;
const item = (
  petId: string | null,
  occurrenceAt: string,
  extra: Partial<TodayItem> = {},
): TodayItem => ({
  key: `k${n++}`,
  sourceType: 'reminder',
  sourceId: `s${n}`,
  petId,
  petName: petId,
  title: `Task ${n}`,
  occurrenceAt,
  skipped: false,
  doneBy: null,
  snoozedUntil: null,
  ...extra,
});

const view = (parts: Partial<TodayView>): TodayView => ({
  overdue: [],
  today: [],
  upcoming: [],
  snoozed: [],
  done: [],
  ...parts,
});

const pets: RankablePet[] = [
  { id: 'a', name: 'Anna', archived: false },
  { id: 'b', name: 'Bo', archived: false },
  { id: 'c', name: 'Cy', archived: false },
];

const order = (v: TodayView, list = pets) => rankPets(list, v, NOW).map((r) => r.pet.id);

describe('rankPets', () => {
  it('ranks overdue above today above soon', () => {
    const v = view({
      upcoming: [item('a', hours(30))],
      today: [item('b', hours(3))],
      overdue: [item('c', hours(-48))],
    });
    expect(order(v)).toEqual(['c', 'b', 'a']);
  });

  it('sums the weights of every open item', () => {
    const v = view({
      overdue: [item('a', hours(-30))],
      today: [item('b', hours(2)), item('b', hours(3))],
    });
    const ranked = rankPets(pets, v, NOW);
    expect(ranked.map((r) => [r.pet.id, r.score])).toEqual([
      ['a', WEIGHTS.overdue],
      ['b', 2 * WEIGHTS.today],
      ['c', 0],
    ]);
    const crowd = view({
      overdue: [item('a', hours(-30))],
      today: [item('b', hours(2)), item('b', hours(3)), item('b', hours(4))],
    });
    expect(order(crowd)).toEqual(['b', 'a', 'c']);
  });

  it('breaks ties by the earliest open occurrence, then by name', () => {
    const v = view({
      today: [item('b', hours(5)), item('a', hours(2))],
    });
    expect(order(v)).toEqual(['a', 'b', 'c']);
    const same = view({ today: [item('b', hours(2)), item('a', hours(2))] });
    expect(order(same)).toEqual(['a', 'b', 'c']);
  });

  it('treats a time already passed today as overdue', () => {
    const [first] = rankPets(pets, view({ today: [item('a', hours(-2))] }), NOW);
    expect(first?.status).toBe('overdue');
    expect(first?.label).toBe('needsYou');
  });

  it('ignores snoozed and done items, and items without a pet', () => {
    const v = view({
      snoozed: [item('a', hours(-5))],
      done: [item('b', hours(-4), { doneBy: 'me' })],
      today: [item(null, hours(2))],
    });
    const ranked = rankPets(pets, v, NOW);
    expect(ranked.every((r) => r.score === 0 && r.top === null)).toBe(true);
  });

  it('leaves feeding routines out of the ranking, the top task and the done count', () => {
    const meal = item('a', hours(-1), { sourceType: 'careRoutine', routineKind: 'feeding' });
    const walk = item('b', hours(-1), { sourceType: 'careRoutine', routineKind: 'walk' });
    const ranked = rankPets(
      pets,
      view({ overdue: [meal, walk], done: [{ ...meal, doneBy: 'me' }] }),
      NOW,
    );
    expect(ranked.map((r) => r.pet.id)).toEqual(['b', 'a', 'c']);
    const a = ranked.find((r) => r.pet.id === 'a');
    expect(a?.open).toEqual([]);
    expect(a?.label).toBe('onTrack');
  });

  it('leaves archived pets out', () => {
    const list = [...pets, { id: 'z', name: 'Zed', archived: true }];
    const v = view({ overdue: [item('z', hours(-48))] });
    expect(order(v, list)).not.toContain('z');
  });

  it('shows vaccinations 30 days ahead but other items only 7 days', () => {
    const v = view({
      upcoming: [
        item('a', hours(24 * 20), { sourceType: 'vaccination' }),
        item('b', hours(24 * 20), { sourceType: 'reminder' }),
        item('c', hours(24 * 5), { sourceType: 'reminder' }),
      ],
    });
    const ranked = rankPets(pets, v, NOW);
    expect(ranked.find((r) => r.pet.id === 'a')?.status).toBe('soon');
    expect(ranked.find((r) => r.pet.id === 'b')?.score).toBe(0);
    expect(ranked.find((r) => r.pet.id === 'c')?.status).toBe('soon');
    const far = view({ upcoming: [item('a', hours(24 * 40), { sourceType: 'vaccination' })] });
    expect(rankPets(pets, far, NOW).every((r) => r.score === 0)).toBe(true);
  });

  const labels: [string, TodayView, string][] = [
    ['overdue', view({ overdue: [item('a', hours(-30))] }), 'needsYou'],
    ['today', view({ today: [item('a', hours(1))] }), 'dueToday'],
    ['soon', view({ upcoming: [item('a', hours(48))] }), 'comingUp'],
    ['done today', view({ done: [item('a', hours(-3), { doneBy: 'me' })] }), 'allCaughtUp'],
    ['nothing', view({}), 'onTrack'],
  ];
  for (const [name, v, label] of labels) {
    it(`labels a pet with ${name} as ${label}`, () => {
      expect(rankPets(pets, v, NOW).find((r) => r.pet.id === 'a')?.label).toBe(label);
    });
  }

  it('picks the highest weight as the top task, earliest first, and counts the rest', () => {
    const early = item('a', hours(-30), { title: 'Early' });
    const late = item('a', hours(-26), { title: 'Late' });
    const v = view({
      overdue: [late, early],
      today: [item('a', hours(3))],
      upcoming: [item('a', hours(60))],
    });
    const a = rankPets(pets, v, NOW).find((r) => r.pet.id === 'a');
    expect(a?.top?.title).toBe('Early');
    expect(a?.more).toBe(3);
  });
});

describe('summarize', () => {
  it('names the earliest overdue item and counts the other things today', () => {
    const v = view({
      overdue: [item('b', hours(-30), { title: 'Flea treatment' })],
      today: [item('a', hours(2)), item('a', hours(3))],
    });
    const s = summarize(rankPets(pets, v, NOW));
    expect(s).toMatchObject({ kind: 'overdue', more: 2 });
  });
  it('counts what is left today when nothing is overdue', () => {
    const v = view({ today: [item('a', hours(2)), item('b', hours(1))] });
    expect(summarize(rankPets(pets, v, NOW))).toMatchObject({ kind: 'today', count: 2 });
  });
  it('is clear when nothing is open', () => {
    expect(summarize(rankPets(pets, view({}), NOW))).toEqual({ kind: 'clear' });
  });
});
