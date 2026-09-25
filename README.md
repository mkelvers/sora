<p align="center">
  <img src=".github/assets/logo.png" alt="Sora" height="140" />
</p>

<h1 align="center">Sora Web</h1>

<p align="center">The Sora web app, built on the Sora API.</p>

<p align="center">
  <img alt="SvelteKit" src="https://img.shields.io/badge/framework-sveltekit-ff3e00?style=flat-square" />
  <img alt="Bun" src="https://img.shields.io/badge/runtime-bun-f9f1e1?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/lang-typescript-3178c6?style=flat-square" />
</p>

---

## What is Sora Web?

Sora is an anime streaming and tracking platform. This is its web app: browse,
search, and watch anime in the browser.

It talks to the [Sora server](https://github.com/soraorg/server) through the
typed `@sora/sdk`, so a change to the API that breaks the app fails
type-checking before it ships.

## Getting started

This repository lives inside the server as `packages/web` and takes the SDK from
its Bun workspace, so clone the server with its submodules.

Requires [Bun](https://bun.com) 1.4+ and a running
[Sora API](https://github.com/soraorg/server#getting-started).

```sh
git clone --recurse-submodules git@github.com:soraorg/server.git sora
cd sora
bun install

bun run --filter web dev   # web app on :5173
```

## Development

```sh
bun run check   # type-check with svelte-check
bun run build   # production build
```
