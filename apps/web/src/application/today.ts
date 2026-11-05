import {
  completionOf,
  dueOccurrences,
  instantToLocalDate,
  occurrenceStatus,
  overdueWindowStart,
  snoozeMap,
} from '@petcare/domain';
import type { RecordEnvelope, SourceType } from '@petcare/domain';
import type { StoredRecord } from './ports/record-store';

export const UPCOMING_DAYS = 7;

export interface TodayItem {
  /** Unique per source and occurrence. */
  key: string;
  sourceType: SourceType;
  sourceId: string;
  petId: string | null;
  petName: string | null;
  title: string;
  occurrenceAt: string;
  /** For done items: whether it was skipped and who logged it. */
  skipped: boolean;
  doneBy: 'me' | 'other' | null;
  snoozedUntil: string | null;
}

export interface TodayView {
  overdue: TodayItem[];
  today: TodayItem[];
  upcoming: TodayItem[];
  snoozed: TodayItem[];
  done: TodayItem[];
}

export interface TodayOptions {
  now: Date;
  tz: string;
  userId: string;
  /** Only this pet's items (reminders without a pet are hidden); null for the whole household. */
  petId: string | null;
}

const keyOf = (type: string, id: string, at: string): string => `${type}:${id}:${Date.parse(at)}`;
const asEnvelope = (r: StoredRecord): RecordEnvelope => ({
  ...r,
  createdAt: r.updatedAt,
  updatedBy: r.createdBy,
});

/** Completion kinds that can be marked done in the app; vaccinations and visits are answered by recording them. */
export const completable = (type: SourceType): boolean =>
  type === 'medication' || type === 'careRoutine' || type === 'reminder';

/** Reminders have no "skipped" state; doses and routines do. */
export const skippable = (type: SourceType): boolean =>
  type === 'medication' || type === 'careRoutine';

function titleOf(source: StoredRecord, type: SourceType): string {
  const d = source.data;
  switch (type) {
    case 'vaccination':
      return String(d.vaccineName ?? '');
    case 'medication':
      return String(d.name ?? '');
    case 'vetVisit':
      return String(d.reason ?? '');
    default:
      return String(d.title ?? '');
  }
}

/** What is overdue, due today, coming up, snoozed and done, for one user, from the local records. */
export function buildToday(all: StoredRecord[], opts: TodayOptions): TodayView {
  const live = all.filter((r) => r.deletedAt === null);
  const envelopes = live.map(asEnvelope);
  const byId = new Map(live.map((r) => [r.id, r]));
  const petName = (id: string | null): string | null =>
    id ? String(byId.get(id)?.data.name ?? '') || null : null;
  const today = instantToLocalDate(opts.now.getTime(), opts.tz);

  const doneBy = new Map<string, StoredRecord>();
  for (const r of live) {
    const c = completionOf(asEnvelope(r));
    if (c) doneBy.set(keyOf(c.sourceType, c.sourceId, c.occurrenceAt), r);
  }
  const snoozes = snoozeMap(envelopes, opts.userId);
  const to = new Date(opts.now.getTime() + UPCOMING_DAYS * 86_400_000);
  const occurrences = dueOccurrences(
    envelopes,
    { from: overdueWindowStart(opts.now), to },
    opts.tz,
  );

  const view: TodayView = { overdue: [], today: [], upcoming: [], snoozed: [], done: [] };
  for (const o of occurrences) {
    if (opts.petId !== null && o.petId !== opts.petId) continue;
    const source = byId.get(o.sourceId);
    if (!source) continue;
    const k = keyOf(o.sourceType, o.sourceId, o.occurrenceAt);
    const completion = doneBy.get(k);
    const day = instantToLocalDate(Date.parse(o.occurrenceAt), opts.tz);
    const snoozedUntil = snoozes.get(k);
    const item: TodayItem = {
      key: k,
      sourceType: o.sourceType,
      sourceId: o.sourceId,
      petId: o.petId,
      petName: petName(o.petId),
      title: titleOf(source, o.sourceType),
      occurrenceAt: o.occurrenceAt,
      skipped: completion?.data.skipped === true,
      doneBy: completion ? (completion.createdBy === opts.userId ? 'me' : 'other') : null,
      snoozedUntil: snoozedUntil ? new Date(snoozedUntil).toISOString() : null,
    };
    const status = occurrenceStatus(o, opts.now, new Set(completion ? [k] : []), snoozes);
    if (status === 'done') {
      if (day === today) view.done.push(item);
    } else if (status === 'snoozed') view.snoozed.push(item);
    else if (day < today) view.overdue.push(item);
    else if (day === today) view.today.push(item);
    else view.upcoming.push(item);
  }
  return view;
}
