<p align="center">
  <img src=".github/assets/logo.png" alt="Sora" height="140" />
</p>

<h1 align="center">Sora</h1>

<p align="center">The API, scheduler, and typed SDK behind every Sora app.</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/runtime-bun-f9f1e1?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/lang-typescript-3178c6?style=flat-square" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/db-postgres-336791?style=flat-square" />
</p>

---

## What is Sora?

Sora is an anime streaming and tracking platform. Every Sora app, on web, mobile,
and TV, talks to one server.

At its core is the _Sora API_, a versioned HTTP API for browsing, searching, and
watching anime. It resolves playback across several stream providers and falls
through to the next one when a provider breaks, so a failing source rarely
reaches the viewer. Alongside it, a scheduler follows every airing anime and
stores each new episode as soon as a provider carries it.

```ts
import { SoraClient } from "@sora/sdk";

const sora = new SoraClient({
  baseUrl: "http://localhost:3000"
});

const [result] = await sora.search("Frieren");

const series = await sora.series(result.id, {
  params: {
    episodes: true
  }
});

const season = series.seasons[0];
const episode = season.episodes[0];

const media = await sora.playback({
  seasonId: season.id,
  number: episode.number
});
```

The SDK's types are derived from the API itself, so a route change that breaks a
client fails type-checking here, before it ships.

## Packages

| Package                                 | What it does                                                          |
| --------------------------------------- | --------------------------------------------------------------------- |
| [`@sora/api`](packages/api)             | HTTP API under `/v1`, with an OpenAPI document and `/health`          |
| [`@sora/core`](packages/core)           | Catalog, playback providers, database schema, and migrations          |
| [`@sora/scheduler`](packages/scheduler) | Follows airing anime and stores new episodes once a provider has them |
| [`@sora/sdk`](packages/sdk)             | Typed client for the API                                              |

## Getting started

Requires [Bun](https://bun.com) 1.4+ and Docker.

```sh
bun install
docker compose up -d                              # local PostgreSQL
cp packages/core/.env.example packages/core/.env  # then fill in the secrets
bun run --filter @sora/core db:migrate

bun run --filter @sora/api dev                    # API on :3000
bun run --filter @sora/scheduler start            # background jobs
```

The API's OpenAPI document is served at
[`/v1/openapi.json`](http://localhost:3000/v1/openapi.json).

## Development

```sh
bun run check   # type-check every package
bun run test    # run every package's tests
```
