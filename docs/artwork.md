# Artwork

How a title's poster, backdrop, and logo are chosen, how every image TMDB
has for it is listed, and what is still planned.

## Defaults

A series carries one of each, chosen when it is laid out in
`packages/core/src/series/series.ts` and stored on the `series` row:

| Field          | Source                                   | Size       |
| -------------- | ---------------------------------------- | ---------- |
| `poster_url`   | the show's or film's `poster_path`       | `w780`     |
| `backdrop_url` | the show's or film's `backdrop_path`     | `original` |
| `logo_url`     | best-voted English or textless logo      | `w500`     |

## Choosing another

`PATCH /v1/anime/{anime_id}/artwork` (`sora.updateArtwork`) sets any of the
three to an HTTPS URL, for everyone, or back to the default with `null`. The
choice is stored in the `*_url_override` columns, which laying the series
out again never writes, and every card and page prefers it. Anyone who can
reach the API can change it; there are no accounts yet.

## Listing every image

`GET /v1/anime/{anime_id}/images` (`sora.images`) lists every backdrop,
poster, and logo TMDB has for the title, in every language, plus each
season's posters for a show. It is built in
`packages/core/src/series/artwork.ts` from TMDB's `/{tv|movie}/{id}/images`
and `/tv/{id}/season/{n}/images`, one request for the title and one per
season, each cached for a day. A season poster that is also the show's is
listed once. Standalone entries and shorts, which TMDB does not list, have
none.

| Parameter  | Values                                        | Default |
| ---------- | --------------------------------------------- | ------- |
| `type`     | `poster`, `backdrop`, `logo`, comma separated  | all     |
| `language` | ISO 639-1 codes and `none` (textless), comma separated | all |
| `sort`     | `votes`, `quality`                             | `votes` |

- **votes**: TMDB's rating as a Bayesian average, as if every image also
  had three votes of 5, so one 10/10 vote does not outrank dozens of 8s;
  then size.
- **quality**: the largest original first, then votes.

Each image has `type`, `url` (the original size), `width`, `height`,
`language` (`null` when textless), `vote_average`, `vote_count`, and
`season_number` (`null` for the title's own). A client wanting a smaller
file swaps `/original/` for a TMDB size bucket: `w300`, `w780`, `w1280` for
backdrops; `w185`, `w342`, `w500`, `w780` for posters; `w300`, `w500` for
logos. `meta.count` is the number of images; there is no paging, since a
title has a few hundred at most (Mob Psycho 100: 159).

The web app's artwork page loads the whole list once and filters it by
kind, language, and season in the browser; clicking an image saves it in
the size its default uses.

## Not built yet

- **Newest first.** TMDB does not say when an image was uploaded (checked
  on real responses: images carry size, language, region, and votes only).
  Sorting by newest needs Sora to record when it first saw each image: a
  `series_image` table with `first_seen_at`, refreshed from TMDB, which
  would also let filtering and paging happen in SQL.
- **Episode stills** (`/tv/{id}/season/{n}/episode/{e}/images`), to choose
  a still per episode.
- **A `size` parameter**, so the API resizes URLs instead of clients.
