# Artwork

A plan for exposing every backdrop, poster, and logo TMDB has for a title,
not only the one Sora picks. Nothing here is built yet.

## Today

A series carries one of each, chosen in `packages/core/src/series/series.ts`
and stored on the `series` row:

| Field          | Source                                   | Size       |
| -------------- | ---------------------------------------- | ---------- |
| `poster_url`   | the show's or film's `poster_path`       | `w780`     |
| `backdrop_url` | the show's or film's `backdrop_path`     | `original` |
| `logo_url`     | best-voted English or textless logo      | `w500`     |

Everything else TMDB has is never fetched. `getLogoPath` in
`packages/core/src/tmdb/resources.ts` already calls the images endpoint, but
only for logos, and only English and textless ones.

## What TMDB offers

`GET /3/tv/{id}/images` and `GET /3/movie/{id}/images` return `backdrops`,
`posters`, and `logos`. Without `include_image_language`, every language
comes back. Frieren, for example, has 192 backdrops, 142 posters, and 44
logos, most of them textless and the rest in about a dozen languages.

Each image has:

| Field          | Meaning                                         |
| -------------- | ----------------------------------------------- |
| `file_path`    | Path to append to `https://image.tmdb.org/t/p/{size}` |
| `width`, `height`, `aspect_ratio` | Size of the original              |
| `iso_639_1`    | Language of any text on it; `null` when textless |
| `iso_3166_1`   | Region, alongside the language                  |
| `vote_average`, `vote_count` | TMDB users' votes                 |

**TMDB does not say when an image was uploaded.** Sorting by newest needs
Sora to record when it first saw each image (see below).

## API

```
GET /v1/anime/{anime_id}/images
```

| Parameter  | Values                                        | Default |
| ---------- | --------------------------------------------- | ------- |
| `type`     | `backdrop`, `poster`, `logo`, comma separated  | all     |
| `language` | ISO 639-1 codes and `none` (textless), comma separated | all |
| `sort`     | `quality`, `votes`, `newest`                   | `votes` |
| `page`, `per_page` | as on the other list routes           |         |

So `?type=backdrop,poster&language=en,none&sort=quality` gives English and
textless backdrops and posters, largest first; no `type` gives everything.

Sorts:

- **quality**: largest original first (`width × height`), then votes.
- **votes**: TMDB's `vote_average`, weighted by `vote_count` so one 10/10
  vote does not outrank a hundred 8/10 ones; then size.
- **newest**: when Sora first saw the image, most recent first. Images Sora
  saw when it started tracking share that time and fall back to votes.

The response follows the other routes: snake_case, `{ results, meta }`,
paging in `meta`.

```json
{
  "results": [
    {
      "type": "backdrop",
      "url": "https://image.tmdb.org/t/p/original/rBOnrVlck7BIlGeWVlzYiZeg4l2.jpg",
      "width": 3840,
      "height": 2160,
      "language": null,
      "region": null,
      "vote_average": 10,
      "vote_count": 3,
      "first_seen_at": "2026-09-25T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "per_page": 24,
    "has_next_page": true,
    "next": "…",
    "previous": null
  }
}
```

`url` is always the `original` size. A client wanting a smaller file swaps
the size segment for one of TMDB's buckets (`w300`, `w780`, `w1280` for
backdrops; `w185`, `w500`, `w780` for posters; `w300`, `w500` for logos).
Whether the API should do that itself, with a `size` parameter, is open.

## SDK

```ts
const images = await sora.images(seriesId, {
  params: {
    type: ["backdrop", "poster"],
    language: ["en", null],
    sort: "quality"
  }
});
```

`language` takes `null` for textless, as the response spells it; the SDK
sends it as `none`. `meta: true` gives paging, as on the other methods.

## Core

- Fetch the images endpoint once per TMDB show or film, without a language
  filter, through the existing `tmdb()` client and its snapshot cache (a
  day, as logos use now).
- Store them in a `series_image` table: series, type, `file_path`, size,
  language, region, votes, and `first_seen_at`. A refresh inserts new
  images with the current time, updates votes on known ones, and deletes
  ones TMDB no longer lists. Filtering, sorting, and paging then happen in
  SQL.
- Shorts (series with no TMDB show) have no TMDB images; the route returns
  an empty list for them.
- `getLogoPath` can read from the same table instead of calling TMDB itself.

## Open questions

- Season posters (`/tv/{id}/season/{n}/images`) and episode stills
  (`…/episode/{e}/images`) could be listed the same way, per season.
- Whether picking a series' default poster, backdrop, or logo from this list
  should be part of editing a title's details.
- Whether the API should resize URLs itself (`size` parameter).
