import { instantToLocalDate } from '@petcare/domain';
import type { CareSuggestion, CareSuggestionId } from '@petcare/domain';
import { addDays } from './health-logic';
import { emptyPetForm } from './pet-form';
import type { PetFormValues } from './pet-form';

/** The slice this build is at; suggestions newer than it are not offered (SPEC-petcare-002 P3). */
export const WIZARD_SLICE = 6;

/** The three species the wizard offers; every other species is added through "Something else". */
export const WIZARD_SPECIES = ['dog', 'cat', 'other'] as const;
export type WizardSpecies = (typeof WIZARD_SPECIES)[number];

export type AgeMode = 'date' | 'age';
export type AgeUnit = 'years' | 'months';

/** Everything the three steps collect. Only `name` is required. */
export interface WizardValues {
  name: string;
  species: WizardSpecies;
  speciesOther: string;
  breed: string;
  sex: PetFormValues['sex'];
  neutered: boolean;
  ageMode: AgeMode;
  birthDate: string;
  age: string;
  ageUnit: AgeUnit;
  colour: string;
  microchipId: string;
}

export const emptyWizard: WizardValues = {
  name: '',
  species: 'dog',
  speciesOther: '',
  breed: '',
  sex: '',
  neutered: false,
  ageMode: 'date',
  birthDate: '',
  age: '',
  ageUnit: 'years',
  colour: '',
  microchipId: '',
};

/** A suggestion as the user left it on step 3: unticked unless ticked (PO-petcare-002 Q-10). */
export interface SuggestionChoice {
  on: boolean;
  time: string;
  /** ISO weekday, used by weekly suggestions. */
  day: number;
}

const isoWeekday = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

/** A date `n` years or months before `today`, for "approximate age". */
export function approxBirthDate(n: number, unit: AgeUnit, today: string): string {
  const [y = 0, m = 1, d = 1] = today.split('-').map(Number);
  const months = unit === 'years' ? n * 12 : n;
  const total = y * 12 + (m - 1) - months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  // Clamp the day so that 31 March minus one month is 28 February, not a date that does not exist.
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** The wizard values as the pet form values the pet service saves. */
export function wizardToPetForm(v: WizardValues, today: string): PetFormValues {
  const age = Number(v.age);
  const approx = v.ageMode === 'age' && Number.isFinite(age) && age > 0;
  const birthDate =
    v.ageMode === 'date' ? v.birthDate : approx ? approxBirthDate(age, v.ageUnit, today) : '';
  return {
    ...emptyPetForm,
    name: v.name,
    species: v.species,
    speciesOther: v.species === 'other' ? v.speciesOther : '',
    breed: v.breed,
    sex: v.sex,
    neutered: (v.sex === 'male' || v.sex === 'female') && v.neutered ? 'yes' : '',
    birthDate,
    birthDateEstimated: approx,
    colour: v.colour,
    microchipId: v.microchipId,
  };
}

/** Local time of day, HH:MM, for an instant. */
export function localTime(now: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

/** What each suggestion is about (CON-003 `reminder.category`). */
const CATEGORY: Record<CareSuggestionId, string> = {
  walk: 'walk',
  flea: 'medication',
  brush: 'grooming',
  weighIn: 'weighIn',
  checkup: 'vetVisit',
};

/** The same calendar day one year on; 29 February becomes 28 February (CON-003 2.6). */
export function nextYear(date: string): string {
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number);
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate();
  return `${String(y + 1).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * The `reminder` data for a ticked suggestion, with its category and `notBefore` = now.
 * `startOn` is the date of the first occurrence after now, so the reminder is not born overdue;
 * the yearly check-up starts in 12 months (PO-petcare-002 Q-10).
 */
export function reminderFromSuggestion(
  s: CareSuggestion,
  title: string,
  choice: SuggestionChoice,
  petId: string,
  tz: string,
  now: Date,
): Record<string, unknown> {
  const today = instantToLocalDate(now.getTime(), tz);
  const firstDay = choice.time > localTime(now, tz) ? today : addDays(today, 1);
  let schedule: Record<string, unknown>;
  if (s.kind === 'weekly') {
    let start = firstDay;
    for (let i = 0; i < 7 && isoWeekday(start) !== choice.day; i++) start = addDays(start, 1);
    schedule = {
      tz,
      kind: 'weekly',
      times: [choice.time],
      daysOfWeek: [choice.day],
      startOn: start,
    };
  } else if (s.kind === 'monthly') {
    const dayOfMonth = Math.min(Number(firstDay.slice(8, 10)), 28);
    schedule = { tz, kind: 'monthly', times: [choice.time], dayOfMonth, startOn: firstDay };
  } else if (s.kind === 'yearly') {
    schedule = { tz, kind: 'yearly', times: [choice.time], startOn: nextYear(today) };
  } else {
    schedule = { tz, kind: 'daily', times: [choice.time], startOn: firstDay };
  }
  schedule.notBefore = now.toISOString();
  return { petId, title, active: true, category: CATEGORY[s.id], schedule };
}

/** The first choice for each suggestion: unticked, at its suggested time. */
export function initialChoices(list: CareSuggestion[]): Record<string, SuggestionChoice> {
  return Object.fromEntries(
    list.map((s) => [s.id, { on: false, time: s.time, day: s.daysOfWeek?.[0] ?? 7 }]),
  );
}
