import { careSuggestions } from '@petcare/domain';
import type { CareSuggestion } from '@petcare/domain';
import { describe, expect, it } from 'vitest';
import {
  WIZARD_SLICE,
  approxBirthDate,
  emptyWizard,
  initialChoices,
  reminderFromSuggestion,
  wizardToPetForm,
} from './pet-wizard';

const NOW = new Date('2026-11-09T10:00:00Z');

describe('care suggestions', () => {
  it('offer only existing shapes: no yearly check-up before slice 6', () => {
    for (const species of ['dog', 'cat', 'other', 'bird']) {
      const list = careSuggestions(species, WIZARD_SLICE);
      expect(list.length).toBeGreaterThan(0);
      expect(list.some((s) => s.kind === 'yearly')).toBe(false);
    }
    expect(careSuggestions('dog', 6).some((s) => s.kind === 'yearly')).toBe(true);
    expect(careSuggestions('dog', WIZARD_SLICE).map((s) => s.id)).toEqual(['walk', 'flea']);
    expect(careSuggestions('cat', WIZARD_SLICE).map((s) => s.id)).toEqual(['flea', 'brush']);
    expect(careSuggestions('other', WIZARD_SLICE).map((s) => s.id)).toEqual(['weighIn']);
  });

  it('start unticked', () => {
    const choices = initialChoices(careSuggestions('dog', WIZARD_SLICE));
    expect(Object.values(choices).every((c) => !c.on)).toBe(true);
  });
});

describe('reminderFromSuggestion', () => {
  const pick = (species: string, id: string): CareSuggestion => {
    const found = careSuggestions(species, WIZARD_SLICE).find((s) => s.id === id);
    if (!found) throw new Error(`no ${id} suggestion for ${species}`);
    return found;
  };
  const walk = pick('dog', 'walk');
  const flea = pick('dog', 'flea');
  const brush = pick('cat', 'brush');
  const choice = (s: { time: string }, day = 7) => ({ on: true, time: s.time, day });

  it('starts a daily reminder today when its time has not passed, tomorrow when it has', () => {
    const early = reminderFromSuggestion(walk, 'Daily walk', choice(walk), 'p', 'UTC', NOW);
    expect(early).toMatchObject({ petId: 'p', title: 'Daily walk', active: true });
    expect(early.schedule).toEqual({
      tz: 'UTC',
      kind: 'daily',
      times: ['18:00'],
      startOn: '2026-11-09',
    });
    const late = reminderFromSuggestion(
      walk,
      'Daily walk',
      choice(walk),
      'p',
      'UTC',
      new Date('2026-11-09T19:00:00Z'),
    );
    expect((late.schedule as { startOn: string }).startOn).toBe('2026-11-10');
  });

  it('writes a monthly day and a weekly day and never a category', () => {
    // 09:00 has passed at 10:00, so the first monthly occurrence is tomorrow.
    const monthly = reminderFromSuggestion(flea, 'Flea', choice(flea), 'p', 'UTC', NOW);
    expect(monthly.schedule).toMatchObject({
      kind: 'monthly',
      dayOfMonth: 10,
      startOn: '2026-11-10',
    });
    const weekly = reminderFromSuggestion(brush, 'Brush', choice(brush), 'p', 'UTC', NOW);
    // 2026-11-09 is a Monday; the next Sunday is the 15th.
    expect(weekly.schedule).toMatchObject({
      kind: 'weekly',
      daysOfWeek: [7],
      startOn: '2026-11-15',
    });
    for (const r of [monthly, weekly]) {
      expect(Object.keys(r).sort()).toEqual(['active', 'petId', 'schedule', 'title']);
    }
  });
});

describe('wizard values', () => {
  it('turns an approximate age into an estimated birthday', () => {
    expect(approxBirthDate(3, 'years', '2026-11-09')).toBe('2023-11-09');
    expect(approxBirthDate(2, 'months', '2026-03-31')).toBe('2026-01-31');
    expect(approxBirthDate(1, 'months', '2026-03-31')).toBe('2026-02-28');
    const form = wizardToPetForm(
      { ...emptyWizard, name: 'Momo', ageMode: 'age', age: '3' },
      '2026-11-09',
    );
    expect(form).toMatchObject({ birthDate: '2023-11-09', birthDateEstimated: true });
  });

  it('keeps a name-only pet minimal and the spayed flag only for a known sex', () => {
    const form = wizardToPetForm({ ...emptyWizard, name: 'Momo', neutered: true }, '2026-11-09');
    expect(form).toMatchObject({ name: 'Momo', species: 'dog', neutered: '', birthDate: '' });
    expect(
      wizardToPetForm({ ...emptyWizard, name: 'M', sex: 'female', neutered: true }, '2026-11-09')
        .neutered,
    ).toBe('yes');
  });
});
