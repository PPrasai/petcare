import type { StoredRecord } from './ports/record-store';

/** One line of a pet's Recent activity (SPEC-petcare-002 P7). */
export type ActivityEntry = { key: string; at: string; by: string } & (
  | { kind: 'meal'; food: string; quantity?: number; unit?: string }
  | { kind: 'walk'; minutes: number }
  | { kind: 'grooming'; tasks: string[]; note: string }
  | { kind: 'medication'; name: string; route?: string; dose?: string }
  | { kind: 'note'; text: string }
  | { kind: 'done'; title: string; skipped: boolean }
);

/** A medication check-off writes a log and a dose together; they are one line, not two. */
const SAME_EVENT_MS = 60_000;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Care logs, completions and notes of one pet, newest first. `all` holds the live records of
 * careLog, symptomEntry, careCompletion, careRoutine, reminderCompletion, reminder, medicationDose
 * and medication.
 */
export function buildActivity(all: readonly StoredRecord[], petId: string): ActivityEntry[] {
  const live = all.filter((r) => r.deletedAt === null);
  const byId = new Map(live.map((r) => [r.id, r]));
  const out: ActivityEntry[] = [];
  const medLogs = live.filter((r) => r.type === 'careLog' && r.data.kind === 'medication');

  for (const r of live) {
    const d = r.data;
    const base = { key: r.id, by: r.createdBy };
    switch (r.type) {
      case 'careLog': {
        if (d.petId !== petId) break;
        const at = str(d.occurredAt);
        if (d.kind === 'meal') {
          out.push({
            ...base,
            at,
            kind: 'meal',
            food: str(d.foodName),
            ...(typeof d.quantity === 'number' ? { quantity: d.quantity } : {}),
            ...(d.quantityUnit ? { unit: str(d.quantityUnit) } : {}),
          });
        } else if (d.kind === 'walk') {
          out.push({ ...base, at, kind: 'walk', minutes: Number(d.durationMin) });
        } else if (d.kind === 'grooming') {
          out.push({
            ...base,
            at,
            kind: 'grooming',
            tasks: Array.isArray(d.groomingTasks) ? d.groomingTasks.map(String) : [],
            note: str(d.note),
          });
        } else if (d.kind === 'medication') {
          out.push({
            ...base,
            at,
            kind: 'medication',
            name: str(d.medicationName),
            ...(d.route ? { route: str(d.route) } : {}),
            ...(d.doseText ? { dose: str(d.doseText) } : {}),
          });
        }
        break;
      }
      case 'symptomEntry':
        if (d.petId === petId) {
          out.push({ ...base, at: str(d.observedAt), kind: 'note', text: str(d.description) });
        }
        break;
      case 'careCompletion':
        if (d.petId === petId) {
          out.push({
            ...base,
            at: str(d.completedAt),
            kind: 'done',
            title: str(byId.get(str(d.routineId))?.data.title),
            skipped: d.skipped === true,
          });
        }
        break;
      case 'reminderCompletion': {
        const reminder = byId.get(str(d.reminderId));
        if (reminder && reminder.data.petId === petId) {
          out.push({
            ...base,
            at: str(d.completedAt),
            kind: 'done',
            title: str(reminder.data.title),
            skipped: false,
          });
        }
        break;
      }
      case 'medicationDose': {
        if (d.petId !== petId) break;
        const stamp = Date.parse(r.updatedAt);
        const logged = medLogs.some(
          (m) =>
            m.data.medicationId === d.medicationId &&
            m.createdBy === r.createdBy &&
            Math.abs(Date.parse(m.updatedAt) - stamp) <= SAME_EVENT_MS,
        );
        if (logged) break;
        out.push({
          ...base,
          at: str(d.givenAt),
          kind: 'done',
          title: str(byId.get(str(d.medicationId))?.data.name),
          skipped: d.skipped === true,
        });
        break;
      }
      default:
        break;
    }
  }
  return out.sort((a, b) => b.at.localeCompare(a.at) || b.key.localeCompare(a.key));
}
