import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { HouseholdFiles } from '../services/ports';

/** Blobs live at <filesDir>/<householdId>/<fileId>; paths are always server-generated. */
export function createFileStore(filesDir: string): HouseholdFiles {
  return {
    async removeAll(householdId) {
      await rm(join(filesDir, householdId), { recursive: true, force: true });
    },
  };
}
