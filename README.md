# Sora SDK backend

This private repository owns Sora's server-side behavior. It contains the database and provider integrations, the HTTP backend, the scheduler, the browser-safe contracts, and the client SDK.

```text
clients -> @soraorg/sdk -> backend HTTP process -> core -> database/providers
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
bun --cwd packages/sdk test
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
- `@soraorg/contracts` contains client-safe schemas and types shared by the backend and SDK.
- `@soraorg/sdk` contains the typed HTTP client used by web, mobile, and TV applications.
- `apps/api` hosts HTTP requests and authentication.
- `apps/scheduler` runs background maintenance separately from request handling. Keep it separate from the API process so provider stalls or long maintenance jobs do not block client requests.

Publish `@soraorg/contracts` first and then `@soraorg/sdk` to GitHub Packages. Both packages are private to the `soraorg` organization. Client repositories should authenticate to `npm.pkg.github.com` and install `@soraorg/sdk` as a normal package; no `bun link` or repository coupling is required.

Create a GitHub token with package read access for client development and configure the client repository's `.npmrc`:

```ini
@soraorg:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_PACKAGES_TOKEN}
```

Then install the SDK normally:

```bash
bun add @soraorg/sdk
```
