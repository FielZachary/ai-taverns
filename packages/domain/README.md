# Domain Type Ownership

`packages/domain` is the source of truth for app/game concepts that are not tied
to HTTP, React, Fastify, or database rows.

## Current Consolidation Path

The migration foundation intentionally leaves production web behavior untouched,
so some older game types still exist in:

- `apps/web/lib/game-types.ts`
- `packages/shared/src/game.ts`

As routes move to Fastify, shared concepts should be migrated in this order:

1. Add or refine the pure domain model in `packages/domain`.
2. Add API-facing DTO schemas in `packages/contracts`.
3. Add database row types and row-to-domain mappers in `packages/db`.
4. Update the route or frontend slice to import from the shared package.
5. Remove the old local duplicate once no imports depend on it.

`packages/shared` should stay as a compatibility bridge only until migrated
routes and frontend screens import `packages/domain` and `packages/contracts`
directly.
