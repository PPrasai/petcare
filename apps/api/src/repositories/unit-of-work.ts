import type { Db } from '../db/connection';
import { createAccountRepository } from './account-repository';
import { createHouseholdRepository } from './household-repository';
import { createInviteRepository } from './invite-repository';
import { createPreferencesRepository } from './preferences-repository';

/** Every repository bound to one database handle (the pool, or one transaction). */
export function createRepositories(db: Db) {
  return {
    accounts: createAccountRepository(db),
    households: createHouseholdRepository(db),
    invites: createInviteRepository(db),
    preferences: createPreferencesRepository(db),
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
