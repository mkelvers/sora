import { createRoute, z } from "@hono/zod-openapi";
import { getGenres } from "@sora/core/catalog";
import { browseSeries, getAiringSchedule, getSeasonEpisodes, getSeries } from "@sora/core/series";

import { browseLimit, catalogLimit } from "../http/rate-limit";
import { createRouter, publicCache } from "../http/router";
import { itemsOf, json, problem, SeasonIdParam, SeriesIdParam, tooManyRequests } from "../schemas/common";
import { PageSchema, ScheduledEpisodeSchema, SeasonEpisodeSchema, SeriesSchema, toScheduledEpisodeBody } from "../schemas/series";

const day = 24 * 60 * 60 * 1_000;

/** A comma-separated query value, such as `genres=Action,Comedy`. */
function commaSeparated<TItem extends z.ZodType<unknown, string>>(item: TItem) {
  return z
    .string()
    .transform((value) => value.split(",").map((part) => part.trim()).filter((part) => part.length > 0))
    .pipe(z.array(item));
}

const BrowseQuerySchema = z.object({
  search: z.string().trim().min(1).max(200).optional().openapi({
    description: "Free-text search. Results are ordered by relevance unless `sort` is set.",
    example: "tensura"
  }),
  sort: z
    .enum([
      "trending",
      "popular",
      "score",
      "newest",
      "title"
    ])
    .optional(),
  season: z
    .enum([
      "WINTER",
      "SPRING",
      "SUMMER",
      "FALL"
    ])
    .optional(),
  seasonYear: z.coerce.number().int().min(1940).max(2100).optional(),
  format: commaSeparated(
    z.enum([
      "TV",
      "TV_SHORT",
      "MOVIE",
      "SPECIAL",
      "OVA",
      "ONA"
    ])
  )
    .optional()
    .openapi({
      type: "string",
      description: "Comma-separated formats.",
      example: "TV,MOVIE"
    }),
  status: z
    .enum([
      "RELEASING",
      "FINISHED",
      "NOT_YET_RELEASED",
      "CANCELLED",
      "HIATUS"
    ])
    .optional(),
  genres: commaSeparated(z.string().min(1))
    .optional()
    .openapi({
      type: "string",
      description: "Comma-separated genres; see `GET /genres`.",
      example: "Action,Fantasy"
    }),
  page: z.coerce.number().int().positive().max(500).default(1),
  perPage: z.coerce.number().int().positive().max(50).default(24)
});

const browseRoute = createRoute({
  method: "get",
  path: "/anime",
  middleware: browseLimit,
  tags: ["Anime"],
  summary: "Search and browse anime",
  description:
    "One card per title: a show appears once, not once per season. A page can hold fewer cards than `perPage` when several AniList entries belong to one title, and a first search for an unknown franchise may come back short while the rest is prepared in the background.",
  request: {
    query: BrowseQuerySchema
  },
  responses: {
    200: json(PageSchema, "A page of titles."),
    429: tooManyRequests,
    422: problem("The query is invalid."),
    503: problem("The catalog upstream is unavailable; retry after `Retry-After`.")
  }
});

const seriesRoute = createRoute({
  method: "get",
  path: "/anime/{animeId}",
  middleware: catalogLimit,
  tags: ["Anime"],
  summary: "Get an anime",
  description: "The title's page: details, artwork, seasons, the next episode, and related titles.",
  request: {
    params: z.object({
      animeId: SeriesIdParam
    })
  },
  responses: {
    429: tooManyRequests,
    200: json(SeriesSchema, "The title."),
    404: problem("No such title.")
  }
});

const episodesRoute = createRoute({
  method: "get",
  path: "/seasons/{seasonId}/episodes",
  middleware: catalogLimit,
  tags: ["Anime"],
  summary: "List a season's episodes",
  request: {
    params: z.object({
      seasonId: SeasonIdParam
    })
  },
  responses: {
    429: tooManyRequests,
    200: json(itemsOf(SeasonEpisodeSchema), "The season's episodes, numbered from 1."),
    404: problem("No such season.")
  }
});

const genresRoute = createRoute({
  method: "get",
  path: "/genres",
  middleware: catalogLimit,
  tags: ["Anime"],
  summary: "List genres",
  responses: {
    429: tooManyRequests,
    200: json(itemsOf(z.string()), "Genre names accepted by `GET /anime`.")
  }
});

const scheduleRoute = createRoute({
  method: "get",
  path: "/schedule",
  middleware: catalogLimit,
  tags: ["Anime"],
  summary: "Release schedule",
  description: "Episodes airing in a window of up to 14 days, in broadcast order. Defaults to the next 7 days.",
  request: {
    query: z.object({
      from: z.iso.datetime({
        offset: true
      }).optional(),
      until: z.iso.datetime({
        offset: true
      }).optional()
    })
  },
  responses: {
    429: tooManyRequests,
    200: json(itemsOf(ScheduledEpisodeSchema), "Scheduled episodes."),
    422: problem("The window is invalid or longer than 14 days.")
  }
});

/** The catalog: public, cacheable, and free of any user data. */
export const animeRoutes = createRouter()
  .openapi(browseRoute, async (c) => {
    const query = c.req.valid("query");
    const page = await browseSeries(query);
    c.header("Cache-Control", publicCache(query.search ? 60 : 300));
    return c.json(page, 200);
  })
  .openapi(seriesRoute, async (c) => {
    const series = await getSeries(c.req.valid("param").animeId);
    c.header("Cache-Control", publicCache(300));
    return c.json(series, 200);
  })
  .openapi(episodesRoute, async (c) => {
    const items = await getSeasonEpisodes(c.req.valid("param").seasonId);
    c.header("Cache-Control", publicCache(300));
    return c.json(
      {
        items
      },
      200
    );
  })
  .openapi(genresRoute, async (c) => {
    const items = await getGenres();
    c.header("Cache-Control", publicCache(24 * 60 * 60));
    return c.json(
      {
        items
      },
      200
    );
  })
  .openapi(scheduleRoute, async (c) => {
    const query = c.req.valid("query");
    const from = query.from ? new Date(query.from) : new Date();
    const until = query.until ? new Date(query.until) : new Date(from.getTime() + 7 * day);
    const items = await getAiringSchedule(from, until);
    c.header("Cache-Control", publicCache(60));
    return c.json(
      {
        items: items.map(toScheduledEpisodeBody)
      },
      200
    );
  });
