# Sora backend

This Bun workspace contains the server runtimes and the code they share. The API and scheduler deploy as separate processes; both use the same core and database packages.

## Structure

- `apps/api` owns HTTP routes, authentication, request handling, and startup migrations.
- `apps/scheduler` owns the background worker process.
- `packages/core` owns server behavior, including catalog, playback, provider, user, and maintenance logic.
- `packages/core/src/catalog/anilist` and `packages/core/src/catalog/tmdb` own their provider integrations.
- `packages/database` owns the PostgreSQL connection, Drizzle schema, and migrations.

The public client SDK lives in a separate repository. Client code consumes the HTTP API and does not import these server packages.

## Commands

Run `bun run check`, `bun run lint`, and `bun run format:check` from the workspace root. Run database commands with `bun run db:check` or `bun run --cwd packages/database db:generate`.
