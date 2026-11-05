import type { UnitOfWork } from '../repositories';
import type { HouseholdFiles } from './ports';

const DAY_MS = 24 * 60 * 60 * 1000;
export const HISTORY_DAYS = 90;
export const SENT_NOTIFICATION_DAYS = 30;
export const UNREFERENCED_FILE_HOURS = 24;

export interface PurgeResult {
  tombstones: number;
  changeLogRows: number;
  notifications: number;
  files: number;
}

/**
 * The nightly purge (AS 4.8): tombstones and change-log rows older than 90 days, sent
 * notifications older than 30 days, and files older than 24 hours that no live record references.
 */
export function createPurgeService(deps: {
  unitOfWork: UnitOfWork;
  files: HouseholdFiles;
  clock: () => Date;
}) {
  const { unitOfWork, files, clock } = deps;
  return {
    async purge(): Promise<PurgeResult> {
      const now = clock().getTime();
      const repo = unitOfWork.repositories.maintenance;
      const history = await repo.purgeHistory(new Date(now - HISTORY_DAYS * DAY_MS));
      const notifications = await repo.purgeSentNotifications(
        new Date(now - SENT_NOTIFICATION_DAYS * DAY_MS),
      );
      const stale = await repo.findUnreferencedFiles(
        new Date(now - UNREFERENCED_FILE_HOURS * 60 * 60 * 1000),
      );
      // Blob first: a crash in between leaves a row without a blob (retried tomorrow), never a
      // blob nobody can see.
      for (const file of stale) await files.remove(file.householdId, file.id);
      await repo.deleteFileRows(stale.map((f) => f.id));
      return { ...history, notifications, files: stale.length };
    },
  };
}
export type PurgeService = ReturnType<typeof createPurgeService>;
