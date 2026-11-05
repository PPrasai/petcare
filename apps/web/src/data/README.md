# data

Adapters for the ports. `local/` is Dexie (one table per record type, built from the domain registry), `remote/` is openapi-fetch, `sync/` is the outbox and the sync engine, `demo/` is the in-memory demo store.

Layer rules are enforced by `pnpm lint:deps` (`.dependency-cruiser.cjs`).
