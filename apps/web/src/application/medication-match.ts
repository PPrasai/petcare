import type { TodayItem } from './today';

/** A name shorter than this never matches a task (PO-petcare-002 R-09, QA-29). */
export const MIN_MATCH_LENGTH = 3;

const norm = (s: string): string => s.trim().toLowerCase();

/**
 * The open medication dose a logged medication answers (ADR-14): the same pet, not done, and the
 * logged name ("Carprofen 25mg") contains the task's medication name ("Carprofen"). With several
 * open doses of it (an overdue one and today's) the earliest is the one checked off. `items` are
 * the overdue and due-today occurrences; nothing here looks at upcoming ones.
 */
export function matchMedicationTask(
  name: string,
  petId: string,
  items: readonly TodayItem[],
  medicationId?: string,
): TodayItem | null {
  const logged = norm(name);
  if (logged.length < MIN_MATCH_LENGTH) return null;
  const open = items
    .filter(
      (i) =>
        i.sourceType === 'medication' &&
        i.petId === petId &&
        i.doneBy === null &&
        norm(i.title).length >= MIN_MATCH_LENGTH,
    )
    .filter((i) => (medicationId ? i.sourceId === medicationId : logged.includes(norm(i.title))))
    .sort((a, b) => a.occurrenceAt.localeCompare(b.occurrenceAt));
  return open[0] ?? null;
}
