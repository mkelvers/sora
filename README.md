# Sora backend

This private repository owns Sora's server-side behavior. It contains the database, provider integrations, HTTP backend, authentication, and scheduler. The public client boundary lives in the separate [Sora API repository](https://github.com/soraorg/api).

```text
clients -> public API contracts and SDK -> backend HTTP process -> core -> database/providers
                                                                          ^
                                                                    scheduler process
```

## Development

Install dependencies and run the checks:

```bash
bun install
bun run format:check
bun run lint
bun run check
```

Run the database and both backend processes in separate terminals:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/scheduler/.env.example apps/scheduler/.env
bun --cwd packages/shared db:up
bun --cwd apps/api dev
bun --cwd apps/scheduler dev
```

The existing `.env.example` files document the required variables. The API is the remotely reachable process that owns authentication, database access, provider credentials, and the `/v1` transport used by the SDK. The SDK is the typed client for that transport, not a replacement for the server process.

## Packages

- `@soraorg/core` contains server-only catalog, user, playback, provider, and maintenance behavior.
- `@soraorg/shared` contains the database connection, Drizzle schema, migrations, and generated provider client.
- `@soraorg/contracts` contains the backend's client-safe request and response schemas.
- `apps/api` hosts HTTP requests and authentication.
- `apps/scheduler` runs background maintenance separately from request handling. Keep it separate from the API process so provider stalls or long maintenance jobs do not block client requests.

The repository intentionally has no GitHub Actions workflow. Deployment and database operations are performed explicitly from a trusted environment.
