# PetCare

An installable, offline-first web app for keeping a household's pets: health records, vaccinations,
medications and reminders, care routines, documents, expenses and an emergency page. It works
without a connection and syncs when one is back. Several people can share one household.

## What is in the repository

| Path                 | What it is                                                                            |
| -------------------- | ------------------------------------------------------------------------------------- |
| `apps/web`           | The React PWA: UI, local database (IndexedDB), sync engine, demo mode, browser traces |
| `apps/api`           | The Fastify API: auth, households, sync, files, push, calendar, jobs, telemetry relay |
| `packages/domain`    | Rules shared by both sides: entities, permissions, merge, recurrence, units           |
| `packages/contracts` | The OpenAPI file and the types generated from it (frozen; do not edit)                |
| `e2e`                | Playwright tests against the production web build and a real API                      |
| `tests/system`       | Two-client sync tests (conflicts, idempotency, extensibility)                         |
| `deploy`             | Production images, compose file, Caddy config, Grafana dashboards and alerts          |

Layering is enforced by `pnpm lint:deps`: features depend on ui, application and state;
application depends on ports and the domain; data implements the ports; `app` wires it together.

## Run it locally

You need Node 24, pnpm 9 and Docker.

```sh
pnpm install
cp .env.example .env     # then set BETTER_AUTH_SECRET to 32+ random characters
pnpm dev                 # Postgres, Redis and Grafana in Docker; API on :3000, web on :5173
```

Open http://localhost:5173. "Try the demo" needs no account and sends nothing to the server.

## Commands

| Command                                             | What it does                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------------- |
| `pnpm verify`                                       | Everything below, in order. Run it before every commit.                    |
| `pnpm typecheck` / `lint` / `lint:deps`             | Types, eslint and prettier, layering rules                                 |
| `pnpm lint:openapi`                                 | Lints the contract                                                         |
| `pnpm test`                                         | Unit and integration tests (integration uses Docker containers)            |
| `pnpm e2e`                                          | Playwright: offline, sync, accessibility, tracing, cached start, and more  |
| `pnpm perf`                                         | QA-01 load run on the envelope seed; writes `reports/perf-<date>.json`     |
| `pnpm --filter @petcare/api cli vapid`              | Prints a VAPID key pair for web push                                       |
| `pnpm --filter @petcare/api cli reset-link <email>` | Prints a one-time password-reset link                                      |
| `pnpm --filter @petcare/api cli seed-envelope`      | Fills an empty, migrated database with 1,000 users and 10 x 20,000 records |

Notes for `pnpm perf`: virtual users pause 0.5-1.5 s between requests. Set `PERF_THINK_MS=0` to remove
the pause and find where the API saturates. The run exits non-zero if reads p95 is over 300 ms,
push p95 over 500 ms, or API memory over 512 MB.

## Configuration

The API reads its settings from environment variables; `.env.example` lists them with development
values and `loadConfig` in `apps/api/src/config/env.ts` validates them. The ones you will touch:
`APP_ORIGIN` (the only origin allowed to write), `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`,
`AUTH_<PROVIDER>_CLIENT_ID` / `_SECRET` (a sign-in provider is on when both are set),
`VAPID_*` (push), `FILES_DIR`, and the cron settings for the background jobs.

## Background jobs

Run in the API process (`RUN_JOBS=true`): dispatch due notifications every minute, re-derive reminder
schedules nightly, and purge nightly (`PURGE_CRON`): tombstones and change-log rows older than 90
days, sent notifications older than 30 days, and files older than 24 hours that no record uses.
A device that has been offline longer than 90 days gets `410 cursorExpired` and pulls everything again.

## Observability

The API and the browser send OpenTelemetry traces; the browser's go through `POST /api/telemetry/v1/traces`
so the collector is never exposed. `compose.dev.yaml` runs Grafana, Tempo, Loki and Prometheus with
four provisioned dashboards (API, sync, notifications, auth) and five alert rules from
`deploy/observability`. Passwords, cookies, tokens and record contents are never logged or traced.

## Deploying

Merging to `main` runs CI and then the `deploy` workflow. See `deploy/README.md` for how it works,
how to roll back, and the server setup. The web image is Caddy serving the built PWA with a fallback
to `index.html` (this is what makes `/e/:token` links work) and forwarding `/api` and `/cal` to the API.

## Where the requirements live

The quality checks QA-01 to QA-23 each have an executable test; `pnpm verify` runs them all except
the load run, which is `pnpm perf`.
