import type { Db } from '../db/connection';
import { createAccountRepository } from './account-repository';
import { createFileRepository } from './file-repository';
import { createHouseholdRepository } from './household-repository';
import { createInviteRepository } from './invite-repository';
import { createNotificationRepository } from './notification-repository';
import { createPreferencesRepository } from './preferences-repository';
import { createRecordRepository } from './record-repository';
import { createSyncRepository } from './sync-repository';

/** Every repository bound to one database handle (the pool, or one transaction). */
export function createRepositories(db: Db) {
  return {
    accounts: createAccountRepository(db),
    files: createFileRepository(db),
    households: createHouseholdRepository(db),
    invites: createInviteRepository(db),
    notifications: createNotificationRepository(db),
    preferences: createPreferencesRepository(db),
    records: createRecordRepository(db),
    sync: createSyncRepository(db),
  };
}
export type Repositories = ReturnType<typeof createRepositories>;

/** Runs `work` in one transaction; every repository it gets uses that transaction. */
export function createUnitOfWork(db: Db) {
  return {
    repositories: createRepositories(db),
    run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T> {
      // A Drizzle transaction exposes the same query builders as the pool handle.
      return db.transaction((tx) => work(createRepositories(tx as unknown as Db)));
    },
  };
}
export type UnitOfWork = ReturnType<typeof createUnitOfWork>;
