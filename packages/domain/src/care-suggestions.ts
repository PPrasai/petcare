import suggestions from '../fixtures/care-suggestions.json';

export type CareSuggestionId = 'walk' | 'flea' | 'brush' | 'weighIn' | 'checkup';

export interface CareSuggestion {
  id: CareSuggestionId;
  /** `yearly` is a CON-003 shape: it is offered only from slice 6 (`minSlice`). */
  kind: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Local time of day, HH:MM. */
  time: string;
  /** ISO weekdays for a weekly suggestion. */
  daysOfWeek?: number[];
  /** The first slice that may offer it. */
  minSlice: number;
}

/**
 * The suggested reminders for a species at a given slice. Species other than dog and cat share
 * the "other" list. Entries newer than `slice` are left out (PO-petcare-002 Q-10).
 */
export function careSuggestions(species: string, slice: number): CareSuggestion[] {
  const table = suggestions as Record<string, CareSuggestion[]>;
  return (table[species] ?? table.other ?? []).filter((s) => s.minSlice <= slice);
}
