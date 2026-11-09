import type { TodayItem, TodayView } from './today';
import { UPCOMING_DAYS } from './today';

/** Urgency weights of one open item (AS-petcare-002 4.2; mock `score()`). */
export const WEIGHTS = { overdue: 100, today: 40, soon: 20 } as const;
/** Vaccinations count as "coming up" this far ahead (PO-002 Q-02). */
export const VACCINE_SOON_DAYS = 30;
/** How long the Undo toast stays, and how long the order is held (PO-002 Q-01). */
export const UNDO_MS = 5000;

export type ItemStatus = keyof typeof WEIGHTS;
export type PetStatus = ItemStatus | 'ok' | 'clear';
export type PetLabel = 'needsYou' | 'dueToday' | 'comingUp' | 'onTrack' | 'allCaughtUp';

export interface RankedItem extends TodayItem {
  status: ItemStatus;
}

export interface RankablePet {
  id: string;
  name: string;
  archived: boolean;
}

export interface RankedPet<P extends RankablePet = RankablePet> {
  pet: P;
  score: number;
  /** The most urgent status among the open items; `ok` when there are none. */
  status: PetStatus;
  label: PetLabel;
  /** The open item with the highest weight, earliest first. */
  top: RankedItem | null;
  /** How many open items there are besides the top one. */
  more: number;
  open: RankedItem[];
}

const DAY_MS = 86_400_000;

/** The status of an open item, or null when it is too far ahead to show. */
export function itemStatus(item: TodayItem, bucket: 'overdue' | 'today' | 'upcoming', now: Date) {
  const at = Date.parse(item.occurrenceAt);
  if (bucket === 'overdue' || (bucket === 'today' && at < now.getTime())) return 'overdue' as const;
  if (bucket === 'today') return 'today' as const;
  const lead = item.sourceType === 'vaccination' ? VACCINE_SOON_DAYS : UPCOMING_DAYS;
  return at - now.getTime() <= lead * DAY_MS ? ('soon' as const) : null;
}

const byWeightThenTime = (a: RankedItem, b: RankedItem) =>
  WEIGHTS[b.status] - WEIGHTS[a.status] || a.occurrenceAt.localeCompare(b.occurrenceAt);

/**
 * Pets ordered by urgency (QA-25): the sum of the weights of a pet's open items, then the
 * earliest open occurrence, then the name. Open means not done and not snoozed for this user.
 * Archived pets are left out.
 */
export function rankPets<P extends RankablePet>(
  pets: P[],
  view: TodayView,
  now: Date,
): RankedPet<P>[] {
  const open = new Map<string, RankedItem[]>();
  const add = (items: TodayItem[], bucket: 'overdue' | 'today' | 'upcoming') => {
    for (const item of items) {
      if (item.petId === null) continue;
      const status = itemStatus(item, bucket, now);
      if (status === null) continue;
      const list = open.get(item.petId) ?? [];
      list.push({ ...item, status });
      open.set(item.petId, list);
    }
  };
  add(view.overdue, 'overdue');
  add(view.today, 'today');
  add(view.upcoming, 'upcoming');
  const doneToday = new Set(view.done.map((i) => i.petId));

  const ranked = pets
    .filter((pet) => !pet.archived)
    .map((pet): RankedPet<P> => {
      const items = (open.get(pet.id) ?? []).sort(byWeightThenTime);
      const top = items[0] ?? null;
      const score = items.reduce((sum, i) => sum + WEIGHTS[i.status], 0);
      const label: PetLabel = top
        ? top.status === 'overdue'
          ? 'needsYou'
          : top.status === 'today'
            ? 'dueToday'
            : 'comingUp'
        : doneToday.has(pet.id)
          ? 'allCaughtUp'
          : 'onTrack';
      return {
        pet,
        score,
        status: top ? top.status : doneToday.has(pet.id) ? 'clear' : 'ok',
        label,
        top,
        more: Math.max(items.length - 1, 0),
        open: items,
      };
    });

  const earliest = (r: RankedPet<P>) =>
    r.open.reduce((min, i) => (i.occurrenceAt < min ? i.occurrenceAt : min), '9999');
  return ranked.sort(
    (a, b) =>
      b.score - a.score ||
      earliest(a).localeCompare(earliest(b)) ||
      a.pet.name.localeCompare(b.pet.name),
  );
}

export type HomeSummary =
  | { kind: 'overdue'; item: RankedItem; more: number }
  | { kind: 'today'; item: RankedItem; count: number }
  | { kind: 'clear' };

/** The one-line summary under the greeting (mock `lede()`). */
export function summarize(ranked: RankedPet[]): HomeSummary {
  const all = ranked.flatMap((r) => r.open);
  const byTime = (a: RankedItem, b: RankedItem) => a.occurrenceAt.localeCompare(b.occurrenceAt);
  const overdue = all.filter((i) => i.status === 'overdue').sort(byTime);
  const today = all.filter((i) => i.status === 'today').sort(byTime);
  const first = overdue[0];
  if (first) return { kind: 'overdue', item: first, more: overdue.length - 1 + today.length };
  const next = today[0];
  if (next) return { kind: 'today', item: next, count: today.length };
  return { kind: 'clear' };
}
