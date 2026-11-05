import { entities } from '@petcare/domain';
import type { FileApi } from '../../application/ports/file-api';
import { RemoteError } from '../../application/ports/remote-api';
import { cacheFile } from '../local/file-cache';
import type { LocalDb } from '../local/local-db';

const withFileRefs = entities.filter((e) => e.fileRefs.length > 0);

const swap = (value: unknown, from: string, to: string): unknown => {
  if (value === from) return to;
  if (Array.isArray(value)) return value.map((v) => swap(v, from, to));
  return value;
};

/** Replaces a placeholder file id by the server's in the outbox and in local records. */
async function replaceFileId(db: LocalDb, from: string, to: string): Promise<string[]> {
  const changed = new Set<string>();
  const tables = withFileRefs.map((e) => db.records(e.type));
  await db.transaction('rw', [db.outbox, db.pendingFiles, ...tables], async () => {
    for (const entity of withFileRefs) {
      const refs = entity.fileRefs;
      await db
        .records(entity.type)
        .toCollection()
        .modify((record) => {
          for (const ref of refs) {
            const before = record.data[ref];
            const after = swap(before, from, to);
            if (after !== before && JSON.stringify(after) !== JSON.stringify(before)) {
              record.data = { ...record.data, [ref]: after };
              changed.add(entity.type);
            }
          }
        });
    }
    await db.outbox.toCollection().modify((entry) => {
      const entity = withFileRefs.find((e) => e.type === entry.type);
      if (!entity) return;
      for (const ref of entity.fileRefs) {
        if (ref in entry.fields)
          entry.fields = { ...entry.fields, [ref]: swap(entry.fields[ref], from, to) };
      }
    });
    await db.pendingFiles.delete(from);
  });
  return [...changed];
}

/**
 * Sends files that were chosen offline (or just now) before the changes that refer to them,
 * because the server checks that a referenced file exists. A network failure stops the sync
 * run; a refusal (too large, wrong type, quota) is noted as a sync problem and the file dropped.
 */
export async function uploadPendingFiles(
  db: LocalDb,
  api: FileApi,
  userId: string,
  changed: (types: string[]) => void,
): Promise<void> {
  for (const file of await db.pendingFiles.toArray()) {
    try {
      const stored = await api.upload(file.householdId, file.blob, file.name);
      await cacheFile(userId, stored.id, file.blob);
      changed(await replaceFileId(db, file.id, stored.id));
    } catch (error) {
      if (!(error instanceof RemoteError)) throw error;
      await db.problems.add({
        at: new Date().toISOString(),
        mutationId: file.id,
        type: 'document',
        recordId: file.id,
        code: error.code,
        message: `${file.name}: ${error.code}`,
      });
      await db.pendingFiles.delete(file.id);
    }
  }
}
