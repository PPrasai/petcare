import type { RecordType } from '@petcare/domain';
import type { LocalDb, OutboxEntry } from '../local/local-db';

export type EnqueueOutcome = 'added' | 'coalesced' | 'eliminated';

/** Outbox entries of one record, oldest first. */
export function entriesFor(db: LocalDb, type: RecordType, id: string): Promise<OutboxEntry[]> {
  return db.outbox.where('[type+id]').equals([type, id]).sortBy('seq');
}

/**
 * Adds a mutation to the outbox (CON-petcare-002 2.5.1). Call inside a Dexie transaction that
 * also covers the local record write.
 *
 *  - An update right after an unsent update or create is merged into it: fields are combined,
 *    the earliest baseVersion and the latest clientTime are kept.
 *  - A delete of a record whose create was never sent removes every entry for the record
 *    ("eliminated"): the server never needs to hear about it.
 *  - An entry that is part of a request in flight is never changed.
 */
export async function enqueue(db: LocalDb, mutation: OutboxEntry): Promise<EnqueueOutcome> {
  const existing = await entriesFor(db, mutation.type, mutation.id);
  const last = existing.at(-1);

  if (mutation.op === 'update' && last && !last.sending && last.op !== 'delete') {
    await db.outbox.put({
      ...last,
      fields: { ...last.fields, ...mutation.fields },
      clientTime: mutation.clientTime,
    });
    return 'coalesced';
  }

  const first = existing[0];
  if (
    mutation.op === 'delete' &&
    first?.op === 'create' &&
    existing.every((entry) => !entry.sending)
  ) {
    await db.outbox.bulkDelete(
      existing.flatMap((entry) => (entry.seq === undefined ? [] : [entry.seq])),
    );
    return 'eliminated';
  }

  await db.outbox.add({ ...mutation });
  return 'added';
}

/** The next batch to send, FIFO. */
export function nextBatch(db: LocalDb, size: number): Promise<OutboxEntry[]> {
  return db.outbox.orderBy('seq').limit(size).toArray();
}

export function pendingCount(db: LocalDb): Promise<number> {
  return db.outbox.count();
}
