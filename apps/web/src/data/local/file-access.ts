import { v7 as uuidv7 } from 'uuid';
import type { FileApi } from '../../application/ports/file-api';
import type { FileGateway } from '../../application/ports/file-gateway';
import { cacheFile, cachedFile } from './file-cache';
import type { LocalDb } from './local-db';

/** Local file handling: pending uploads, the device file cache, and object URLs for viewing. */
export function createFileGateway(
  db: LocalDb,
  api: FileApi,
  userId: string,
  requestSync: () => void,
): FileGateway {
  return {
    async attach(householdId, file) {
      const id = uuidv7();
      await db.pendingFiles.put({
        id,
        householdId,
        name: file.name,
        mimeType: file.type,
        blob: file,
      });
      requestSync();
      return { fileId: id };
    },

    async open(fileId) {
      const pending = await db.pendingFiles.get(fileId);
      if (pending) {
        return {
          url: URL.createObjectURL(pending.blob),
          mimeType: pending.mimeType,
          name: pending.name,
        };
      }
      let blob = await cachedFile(userId, fileId);
      if (!blob) {
        blob = await api.download(fileId);
        if (!blob) return null;
        await cacheFile(userId, fileId, blob);
      }
      return { url: URL.createObjectURL(blob), mimeType: blob.type, name: null };
    },

    release(url) {
      URL.revokeObjectURL(url);
    },
  };
}
