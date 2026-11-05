import { entities } from '@petcare/domain';
import type { Device } from './harness';

export interface Row {
  id: string;
  type: string;
  householdId: string;
  version: number;
  deletedAt: string | null;
  data: Record<string, unknown>;
}

const byKey = (a: Row, b: Row) => `${a.type}/${a.id}`.localeCompare(`${b.type}/${b.id}`);

/** Everything a device holds locally, with the local-only flag dropped. */
export async function localSnapshot(device: Device): Promise<Row[]> {
  const rows: Row[] = [];
  for (const { type } of entities) {
    for (const r of await device.db.records(type).toArray()) {
      rows.push({
        id: r.id,
        type: r.type,
        householdId: r.householdId,
        version: r.version,
        deletedAt: r.deletedAt,
        data: r.data,
      });
    }
  }
  return rows.sort(byKey);
}

/** Everything the server holds for this person, read with a full pull from an empty cursor. */
export async function serverSnapshot(device: Device): Promise<Row[]> {
  const rows: Row[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await device.remote.pull(cursor, 500);
    for (const r of page.changes) {
      rows.push({
        id: r.id,
        type: r.type,
        householdId: r.householdId,
        version: r.version,
        deletedAt: r.deletedAt,
        data: r.data,
      });
    }
    cursor = page.cursor;
    if (!page.hasMore) return rows.sort(byKey);
  }
}
