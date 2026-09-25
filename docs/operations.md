# Operations

How to tell whether Sora's upstream providers are working, and what is
planned for monitoring beyond that.

## Provider health

Stream providers are scrapers, and they break without warning. Playback falls
through to the next provider when one fails, so users rarely notice, and
without records nobody else would either.

### What is recorded

Every call through the `StreamProvider` interface (`findMedia`,
`listEpisodes`, `resolveStream`, `syncCatalog`) is counted in the
`provider_calls` table, one row per provider, operation, and hour:

| Column                         | Meaning                                                   |
| ------------------------------ | --------------------------------------------------------- |
| `ok`                           | Calls that returned something                             |
| `empty`                        | Calls that returned nothing: no match, or no episodes     |
| `failed`                       | Calls that threw                                          |
| `duration_ms`                  | Total time spent in the hour's calls, for average latency |
| `last_error`, `last_error_at`  | The hour's latest error message and when it happened      |

`empty` matters as much as `failed`: a scraper whose site changed often
returns nothing instead of throwing.

Recording happens in the background and never slows down or fails a call.
Rows older than 30 days are deleted daily by the `prune-provider-calls` job.

The recording lives in `packages/core/src/playback/providers/calls.ts`, and
the status rules below in `health.ts` next to it.

### Status

Each provider has one status, worked out over the last three hours:

- **ok**: a call succeeded.
- **failing**: at least 5 calls were made, and none succeeded.
- **idle**: too few calls to tell.

The minimum of 5 calls prevents false alarms during quiet hours. A provider
does not carry every title, so a few misses in a row are normal. Both numbers
are constants in `health.ts` (`failingAfterMs`, `failingAfterCalls`).

### Where it shows up

- **`GET /health`** returns `200` and `status: "ok"` whatever the providers are
  doing, since a broken scraper is no reason for a load balancer to pull an API
  instance. It also lists each provider's status, last success, last error
  time, and the last day's calls per operation. Each instance reads these at
  most once a minute. Error messages are left out because the endpoint is
  public and scraper errors can quote upstream URLs and pages.
- **The scheduler log** gets a warning every hour at :25 for each failing
  provider, with its last error, until the provider recovers
  (`check-provider-health`).
- **The database** has the full detail, including error messages.

### Useful queries

```sql
-- The last 24 hours per provider and operation
select provider, operation, sum(ok) ok, sum(empty) empty, sum(failed) failed,
       sum(duration_ms) / nullif(sum(ok + empty + failed), 0) avg_ms
from provider_calls
where hour > now() - interval '1 day'
group by 1, 2
order by 1, 2;

-- Recent errors, newest first
select provider, operation, last_error_at, last_error
from provider_calls
where last_error is not null
order by last_error_at desc
limit 20;

-- Calls per hour across all providers: a rough view of peak and quiet times
select hour, sum(ok + empty + failed) calls
from provider_calls
group by 1
order by 1 desc
limit 48;
```

### Known limits

- Warnings only reach the scheduler's log. Nothing sends alerts or pages
  anyone.
- Only provider calls are recorded. API requests, errors outside providers,
  and uptime are not.

## Later: monitoring and error tracking

Not built yet on purpose; it is too early. When Sora has real traffic, add a
monitoring setup that covers:

- **Uptime**: whether the API and scheduler are up, from outside the process.
- **Usage patterns**: requests over time, to see peak and quiet hours, and to
  schedule heavy jobs (full catalogue syncs, backfills) for the quiet ones and
  not run them more often than needed.
- **Error tracking**: which errors happen most often, grouped, so the most
  common ones get fixed first.
- **Alerts**: tell someone when a provider fails or the API goes down, instead
  of relying on log reading.

It does not have to be Sentry. A structured logger that other tools can read
would be enough to start with. Things to keep in mind when picking one:

- `provider_calls` and `/health` already cover provider health. A new tool can
  read those or replace them, but does not have to measure it again.
- Logs today are `console` calls in the API and graphile-worker's logger in
  the scheduler. A shared logger in `@sora/core` would be the place to add
  structure (levels, fields such as provider and anime ID) before sending logs
  anywhere.
- The provider interface and the API's `onError` handler are single choke
  points, so error reporting only has to be added in a few places.
