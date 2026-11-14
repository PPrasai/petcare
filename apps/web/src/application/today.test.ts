import { describe, expect, it } from 'vitest';
import { buildToday } from './today';
import type { StoredRecord } from './ports/record-store';

let n = 0;
const rec = (
  type: StoredRecord['type'],
  data: Record<string, unknown>,
  extra: Partial<StoredRecord> = {},
): StoredRecord => ({
  id: extra.id ?? `id-${n++}`,
  type,
  householdId: 'h',
  version: 1,
  createdBy: 'me',
  updatedAt: '2026-01-01T00:00:00Z',
  deletedAt: null,
  pending: false,
  data,
  ...extra,
});

const pet = rec('pet', { name: 'Momo', species: 'dog' }, { id: 'pet1' });
const daily = (id: string, title: string, startOn = '2026-06-01') =>
  rec(
    'careRoutine',
    {
      petId: 'pet1',
      kind: 'feeding',
      title,
      active: true,
      schedule: { tz: 'UTC', kind: 'daily', times: ['08:00'], startOn },
    },
    { id },
  );

const opts = { now: new Date('2026-06-10T12:00:00Z'), tz: 'UTC', userId: 'me', petId: null };

describe('buildToday', () => {
  it('sorts items into overdue, today, upcoming', () => {
    const view = buildToday([pet, daily('r1', 'Breakfast')], opts);
    expect(view.today.map((i) => i.occurrenceAt)).toEqual(['2026-06-10T08:00:00Z']);
    // Yesterday's 08:00 is dropped: today's has started (PO-002 Q-03).
    expect(view.overdue).toHaveLength(0);
    expect(view.upcoming.map((i) => i.occurrenceAt)).toContain('2026-06-11T08:00:00Z');
    expect(view.today[0]).toMatchObject({ title: 'Breakfast', petName: 'Momo' });
  });

  it('moves a completed occurrence to done and records who did it', () => {
    const done = rec('careCompletion', {
      routineId: 'r1',
      petId: 'pet1',
      occurrenceAt: '2026-06-10T08:00:00Z',
      completedAt: '2026-06-10T08:30:00Z',
      skipped: false,
    });
    const other = { ...done, id: 'x', createdBy: 'someone' };
    const mine = buildToday([pet, daily('r1', 'Breakfast'), done], opts);
    expect(mine.today).toHaveLength(0);
    expect(mine.done[0]).toMatchObject({ doneBy: 'me', skipped: false });
    expect(buildToday([pet, daily('r1', 'Breakfast'), other], opts).done[0]?.doneBy).toBe('other');
  });

  it('hides a snoozed occurrence for the snoozing user only', () => {
    const snooze = rec('reminderSnooze', {
      sourceType: 'careRoutine',
      sourceId: 'r1',
      occurrenceAt: '2026-06-10T08:00:00Z',
      snoozedUntil: '2026-06-10T15:00:00Z',
      userId: 'me',
    });
    const mine = buildToday([pet, daily('r1', 'Breakfast'), snooze], opts);
    expect(mine.today).toHaveLength(0);
    expect(mine.snoozed[0]?.snoozedUntil).toBe('2026-06-10T15:00:00.000Z');
    const theirs = buildToday([pet, daily('r1', 'Breakfast'), snooze], { ...opts, userId: 'you' });
    expect(theirs.today).toHaveLength(1);
  });

  it('lists a vaccination due date and filters by pet', () => {
    const vac = rec('vaccination', {
      petId: 'pet1',
      vaccineName: 'Rabies',
      givenOn: '2025-06-01',
      nextDueOn: '2026-06-08',
    });
    expect(buildToday([pet, vac], opts).overdue[0]).toMatchObject({
      sourceType: 'vaccination',
      title: 'Rabies',
    });
    expect(buildToday([pet, vac], { ...opts, petId: 'other' }).overdue).toHaveLength(0);
  });

  it('ignores inactive routines and deleted records', () => {
    const off = { ...daily('r2', 'Off'), data: { ...daily('r2', 'Off').data, active: false } };
    const gone = { ...daily('r3', 'Gone'), deletedAt: '2026-06-02T00:00:00Z' };
    const view = buildToday([pet, off, gone], opts);
    expect([...view.today, ...view.overdue, ...view.upcoming]).toHaveLength(0);
  });

  it('stops listing overdue items after 30 days', () => {
    const monthly = rec(
      'reminder',
      {
        petId: 'pet1',
        title: 'Flea',
        active: true,
        schedule: {
          tz: 'UTC',
          kind: 'monthly',
          times: ['08:00'],
          startOn: '2026-01-01',
          dayOfMonth: 1,
        },
      },
      { id: 'm1' },
    );
    const view = buildToday([pet, monthly], opts);
    expect(view.overdue.map((i) => i.occurrenceAt)).toEqual(['2026-06-01T08:00:00Z']);
  });

  it('lists one missed daily item, not a pile (PO-002 Q-03)', () => {
    const view = buildToday([pet, daily('r1', 'Breakfast', '2026-01-01')], opts);
    expect(view.overdue).toHaveLength(0);
    expect(view.today.map((i) => i.occurrenceAt)).toEqual(['2026-06-10T08:00:00Z']);
  });

  it('keeps yesterday while today has not started', () => {
    const early = { ...opts, now: new Date('2026-06-10T06:00:00Z') };
    const view = buildToday([pet, daily('r1', 'Breakfast', '2026-01-01')], early);
    expect(view.overdue.map((i) => i.occurrenceAt)).toEqual(['2026-06-09T08:00:00Z']);
  });
});

describe('buildToday audience (PO-002 Q-08)', () => {
  const reminder = (id: string, audienceUserId: string | null) =>
    rec(
      'reminder',
      {
        petId: 'pet1',
        title: id,
        active: true,
        audienceUserId,
        schedule: { tz: 'UTC', kind: 'daily', times: ['18:00'], startOn: '2026-06-10' },
      },
      { id },
    );
  const titles = (view: ReturnType<typeof buildToday>) => view.today.map((i) => i.title).sort();

  it("leaves another member's Just-me reminder out, and keeps one's own and everyone's", () => {
    const all = [pet, reminder('everyone', null), reminder('mine', 'me'), reminder('theirs', 'u2')];
    expect(titles(buildToday(all, opts))).toEqual(['everyone', 'mine']);
    expect(titles(buildToday(all, { ...opts, userId: 'u2' }))).toEqual(['everyone', 'theirs']);
  });
});
