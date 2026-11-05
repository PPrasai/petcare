import seedJson from '../fixtures/demo-seed.json';
import type { RecordEnvelope } from './envelope';
import type { RecordType } from './schemas';

/** A date or instant written relative to the day the demo is opened. */
interface DayOffset {
  $daysFromToday: number;
  /** HH:MM in UTC. With it the value is an instant, without it a calendar date. */
  time?: string;
}

export interface DemoFile {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
}

export interface DemoSeed {
  household: { id: string; name: string };
  user: { id: string; name: string; email: string };
  members: { name: string; role: 'owner' | 'caretaker' | 'viewer' }[];
  records: { type: RecordType; id: string; data: Record<string, unknown> }[];
  files: DemoFile[];
}

export const DEMO_SEED = seedJson as unknown as DemoSeed;

const isOffset = (value: unknown): value is DayOffset =>
  typeof value === 'object' && value !== null && '$daysFromToday' in value;

const DAY_MS = 86_400_000;

/** Replaces every `{ "$daysFromToday": n }` with a date (or an instant, with `time`). */
function resolveValue(value: unknown, today: Date): unknown {
  if (isOffset(value)) {
    const day = new Date(
      Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) +
        value.$daysFromToday * DAY_MS,
    );
    const date = day.toISOString().slice(0, 10);
    return value.time ? `${date}T${value.time}:00Z` : date;
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, today));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, resolveValue(v, today)]),
    );
  }
  return value;
}

/** The demo records with dates relative to `today`, as ordinary synced-looking records. */
export function resolveDemoRecords(today: Date, seed: DemoSeed = DEMO_SEED): RecordEnvelope[] {
  const stamp = today.toISOString();
  return seed.records.map((r) => ({
    id: r.id,
    type: r.type,
    householdId: seed.household.id,
    version: 1,
    createdAt: stamp,
    createdBy: seed.user.id,
    updatedAt: stamp,
    updatedBy: seed.user.id,
    deletedAt: null,
    data: resolveValue(r.data, today) as Record<string, unknown>,
  }));
}
