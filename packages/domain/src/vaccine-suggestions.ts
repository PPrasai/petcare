import suggestions from '../fixtures/vaccine-suggestions.json';

export interface VaccineSuggestion {
  name: string;
  intervalDays: number;
}

export const VACCINE_SUGGESTION_LABEL = 'Suggestions — confirm intervals with your vet';

/** Suggested vaccines for a species. Other species have none (PO section 9 A-06). */
export function vaccineSuggestions(species: string): VaccineSuggestion[] {
  const table = suggestions as Record<string, VaccineSuggestion[]>;
  return table[species] ?? [];
}
