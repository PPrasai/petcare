# app

Composition root: providers, router, query client, telemetry, service worker. Chooses the live or demo data layer. May import every other layer.

Layer rules are enforced by `pnpm lint:deps` (`.dependency-cruiser.cjs`).
