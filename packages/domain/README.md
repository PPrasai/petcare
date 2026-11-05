# @petcare/domain

Pure TypeScript rules shared by the web app and the API. No Node or browser APIs, no app imports.

- `src/entities/` one `defineEntity` file per record type (17). `src/registry.ts` lists them.
- `src/permissions.ts` the permission table (`can`). QA-07 is generated from it.
- `src/recurrence.ts`, `src/due.ts` occurrences, done, snoozed, overdue (CON-petcare-002 2.6).
- `src/merge.ts` per-field merge helpers. `src/units.ts`, `src/money.ts` display conversions.

## Adding a record type

1. Add a `defineEntity` file in `src/entities/` and one line in `src/registry.ts`.
2. Add a Drizzle table and migration in `apps/api`.
3. Add one line to `apps/api/src/repositories/sync-registry.ts`.
4. Add a UI feature folder in `apps/web`.

QA-13b proves nothing else is needed. To add a storage back-end, implement
`application/ports/repository.ts`; for a remote back-end, `application/ports/remote-api.ts`.
