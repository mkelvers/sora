# Sora backend

The private Sora backend runs the server-side parts of Sora.

It provides the `/v1` HTTP API used by the [Sora SDK](../sdk), handles authentication, stores application data in PostgreSQL, reads catalog and playback data from providers, and runs scheduled maintenance.

## Packages

- `apps/api` runs the HTTP API.
- `apps/scheduler` runs catalog and maintenance jobs.
- `packages/core` contains catalog, user, playback, provider, and maintenance logic.
- `packages/shared` contains the PostgreSQL connection, Drizzle schema, migrations, and generated provider clients.

## Local run

Install dependencies and create the local environment files.

```sh
bun install
cp apps/api/.env.example apps/api/.env
cp apps/scheduler/.env.example apps/scheduler/.env
```

Start PostgreSQL, the API, and the scheduler in separate terminals.

```sh
bun --cwd packages/shared db:up
bun --cwd apps/api dev
bun --cwd apps/scheduler dev
```

The API listens on the port in `apps/api/.env`, which defaults to `3000`.

## Checks

```sh
bun run format:check
bun run lint
bun run check
bun run db:check
```
