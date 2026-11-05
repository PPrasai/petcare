// Public entry point of the sync engine. tests/system imports only this file (ISS-AS-01).
export { createSyncEngine } from './engine';
export type { SyncEngine, SyncEngineDeps, SyncStatus } from './engine';
export { LocalStore } from './local-store';
export type { LocalStoreDeps } from './local-store';
export { LocalDb, dbNameFor } from '../local/local-db';
export type { LocalRecord, OutboxEntry, SyncProblem } from '../local/local-db';
export { NetworkError, RemoteError } from '../../application/ports/remote-api';
export type {
  RemoteApi,
  PullPage,
  PushResult,
  PushMutation,
} from '../../application/ports/remote-api';
