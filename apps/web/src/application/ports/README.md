# application/ports

Interfaces the adapters implement: RemoteApi, Clock, IdGenerator (and later Repository, FileStore, SyncStatus). `data` imports only this folder from `application`.

Layer rules are enforced by `pnpm lint:deps` (`.dependency-cruiser.cjs`).
