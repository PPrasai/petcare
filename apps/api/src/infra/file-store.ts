import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { HouseholdFiles } from '../services/ports';

/** Blobs live at <filesDir>/<householdId>/<fileId>; paths are always server-generated ids. */
export function createFileStore(filesDir: string): HouseholdFiles {
  const dir = (householdId: string) => join(filesDir, householdId);
  return {
    async removeAll(householdId) {
      await rm(dir(householdId), { recursive: true, force: true });
    },
    async write(householdId, fileId, bytes) {
      await mkdir(dir(householdId), { recursive: true });
      await writeFile(join(dir(householdId), fileId), bytes);
    },
    async read(householdId, fileId) {
      try {
        return await readFile(join(dir(householdId), fileId));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    async remove(householdId, fileId) {
      await rm(join(dir(householdId), fileId), { force: true });
    },
  };
}
