# state

Zustand stores: `session`, `connectivity`, `uiPreferences` and nothing else. A selector returns a primitive or uses `useShallow`. Actions live in the store file.

Layer rules are enforced by `pnpm lint:deps` (`.dependency-cruiser.cjs`).
