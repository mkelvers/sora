<p align="center">
  <img src=".github/assets/logo.png" alt="Sora" height="120" />
</p>

<h1 align="center">Sora</h1>

<p align="center">Anime streaming you host yourself, built on an API you can build on.</p>

<p align="center">
  <img alt="Bun" src="https://img.shields.io/badge/runtime-bun-f9f1e1?style=flat-square" />
  <img alt="TypeScript" src="https://img.shields.io/badge/lang-typescript-3178c6?style=flat-square" />
  <img alt="SvelteKit" src="https://img.shields.io/badge/web-sveltekit-ff3e00?style=flat-square" />
  <img alt="PostgreSQL" src="https://img.shields.io/badge/db-postgres-336791?style=flat-square" />
</p>

Sora is a catalogue, player, watchlist, and release calendar for anime, run from your own server. Accounts hold any number of profiles, and each profile keeps its own watchlist, progress, and notifications.

The web app is one client of a versioned HTTP API. A scheduler keeps the catalogue current, and a typed SDK, checked against the API's own route definitions, gives your own code the same access the web app has.

- Playback tries AniKoto and MegaPlay in turn and falls through when a source fails. Streams go through a signed proxy, and skip-intro segments come with them.
- A show is listed once a provider actually carries its episode, and the calendar follows airing times.
- Search and browsing read from Sora's own database and never wait on an upstream service.

## Architecture

| Workspace | Role |
| --- | --- |
| [`@sora/api`](apps/api) | HTTP API and OpenAPI document |
| [`@sora/scheduler`](apps/scheduler) | Follows airing anime and stores new episodes under upstream limits |
| [`@sora/web`](apps/web) | SvelteKit app |
| [`@sora/core`](packages/core) | Database schema, catalogue, playback providers, scheduler jobs |
| [`@sora/sdk`](packages/sdk) | Typed client |
| [`@sora/shared`](packages/shared) | Helpers shared across workspaces |

## Getting started

Needs [Bun](https://bun.com) 1.4.0+ and Docker.

```sh
git clone https://github.com/mkelvers/sora.git
cd sora
bun install
cp packages/core/.env.example packages/core/.env
cp apps/web/.env.example apps/web/.env
# fill in both, then:
bun run dev
```

Sign-up is off. Create your account, then sign in at <http://localhost:5173>:

```sh
cd packages/core
bun run auth:create-account yourname
```

## Production

On a Linux server, a Mac with Docker Desktop or OrbStack, or WSL2:

```sh
curl -fsSL https://github.com/mkelvers/sora/releases/latest/download/install.sh | bash
```

The installer checks the machine, installs Docker on Linux if it is missing, and asks for four things:

- a [TMDB](https://www.themoviedb.org/settings/api) API Read Access Token
- an [AnimeSchedule](https://animeschedule.net) API token (Account settings, API applications)
- how you reach Sora: this computer only, your home network, or a domain with HTTPS from Let's Encrypt
- a username and password for the first account

It checks both keys, generates the remaining secrets, starts the stack, and waits until every service is healthy. Everything lands in `~/sora`, and every run writes a log to `~/sora/logs`. To answer ahead of time, for example in automation, set the variables listed at the top of [`install.sh`](deploy/install.sh) and pass `--yes`. `--dry-run` prints what would change.

A new install starts empty and fills its catalogue in the background. What you search for or browse is stored first and shows up within a few minutes; the rest fills over the next hours, most popular titles first. Sora needs about 1.5 GB of free memory: the scheduler peaks near 1 GB while it reads episode stills.

```sh
~/sora/sora.sh update      # back up, then move to the newest release
~/sora/sora.sh backup      # database dump into ~/sora/backups
~/sora/sora.sh uninstall   # stop Sora; asks before deleting data
```

Running the one-line installer again does the same as `update`. It keeps the secrets and settings in `~/sora/.env` and never creates a second account.

### Without the installer

Each [release](https://github.com/mkelvers/sora/releases) carries `compose.yaml`, `install.sh`, and their `SHA256SUMS`. To set Sora up by hand, download `compose.yaml` into a folder and write a `.env` beside it:

```sh
SORA_VERSION=1.2.3                 # the release, without the v
COMPOSE_PROFILES=http              # http, or https for a domain
SORA_BIND=127.0.0.1                # http: 127.0.0.1 for this computer, 0.0.0.0 for your network
SORA_PORT=8080                     # http only
SORA_DOMAIN=                       # https only, such as sora.example.com
SORA_SCHEDULER_SUFFIX=             # -full adds timing dub subtitles to speech (~1.5 GB)
TMDB_READ_ACCESS_TOKEN=
ANIME_SCHEDULE_API_KEY=
POSTGRES_PASSWORD=                 # openssl rand -hex 32
AUTH_SECRET=                       # openssl rand -base64 48
STREAM_SIGNING_SECRET=             # openssl rand -base64 48
WEB_CLIENT_KEY=                    # openssl rand -base64 48
```

Then start it, and create the first account:

```sh
docker compose up -d --wait
docker compose exec api bun packages/core/src/auth/create-account.ts yourname
```

The stack is PostgreSQL 18, a one-shot migration, the API, the scheduler, the web app, and Caddy in front, which is the only service with a published port. Caddy sends `/v1` to the API and everything else to the web app. The images are `ghcr.io/mkelvers/sora-api`, `sora-web`, and `sora-scheduler`, for amd64 and arm64. `sora-scheduler:X.Y.Z-full` adds ffmpeg and faster-whisper, to time dub subtitles to speech, and on amd64 Real-ESRGAN, to upscale backdrops. Without it, upscaling a backdrop fails with a message.

The optional AniList and MyAnimeList connections take `ANILIST_CLIENT_ID`, `ANILIST_CLIENT_SECRET`, `MAL_CLIENT_ID`, and `MAL_CLIENT_SECRET` in the same `.env`; see [`packages/core/.env.example`](packages/core/.env.example). After editing `.env`, apply it with `docker compose up -d --wait`.

### Restore a backup

```sh
cd ~/sora
docker compose stop api scheduler web
docker compose exec -T database pg_restore -U sora -d sora --clean --if-exists < backups/sora-<time>.dump
docker compose up -d --wait
```

To go back to an earlier release after a failed update, set `SORA_VERSION` back in `.env` before the last command. A newer release may have migrated the database, so restore the backup `update` made first.

### PostgreSQL upgrades

The stack stays on PostgreSQL 18. A later major version cannot read its data directory, so moving to one will need a dump, a fresh volume, and a restore; the release that does so will say how.

The optional portfolio endpoint `GET /v1/public/now-watching` requires `Authorization: Bearer <PORTFOLIO_TOKEN>`. Set `PORTFOLIO_TOKEN` and `NOW_WATCHING_PROFILE_ID` on the API container, as documented in `packages/core/.env.example`. Without the token it returns 404; without a profile it returns an empty list. It publishes only up to three display titles from unfinished viewing activity within 30 days, including active rewatches. Keep the token private and rotate it on both servers together.

## Credits

Sora makes no anime data and hosts no video.

- [AniList](https://anilist.co) for titles, art, scores, relations, and airing schedules.
- [TMDB](https://www.themoviedb.org) for episode details, backdrops, and logos. This product uses the TMDB API but is not endorsed or certified by TMDB.
- [AnimeSchedule.net](https://animeschedule.net) for English dub release times.

## License

Sora is licensed under the [GNU Affero General Public License v3.0](LICENSE).
