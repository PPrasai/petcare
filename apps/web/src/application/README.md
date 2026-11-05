# application

Use-case services (PetService, ReminderService...). Depend only on `application/ports` and `@petcare/domain`.

Layer rules are enforced by `pnpm lint:deps` (`.dependency-cruiser.cjs`).
