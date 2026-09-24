import { createRoute, z } from "@hono/zod-openapi";
import {
  clearProgress,
  getContinueWatching,
  getProgress,
  getWatchlist,
  getWatchlistEntry,
  recordProgress,
  removeFromWatchlist,
  setWatchlistStatus
} from "@sora/core/library";

import { ProblemError } from "../http/problem";
import { createRouter } from "../http/router";
import { requireUser } from "../http/session";
import { EpisodeNumberParam, itemsOf, json, problem, SeasonIdParam, SeriesIdParam, signedIn } from "../schemas/common";
import {
  ContinueWatchingItemSchema,
  EpisodeProgressSchema,
  ProgressBodySchema,
  toContinueWatchingBody,
  toWatchlistEntryBody,
  toWatchlistItemBody,
  WatchlistEntrySchema,
  WatchlistItemSchema,
  WatchlistStatusSchema
} from "../schemas/library";

const UserSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    image: z.string().nullable()
  })
  .openapi("User");

const AnimeParams = z.object({
  animeId: SeriesIdParam
});

/** Shared parts of every `/me` route: signed-in only, never cached. */
const personal = {
  tags: ["Me"],
  security: signedIn,
  middleware: requireUser
};

const unauthorized = problem("Not signed in.");

function notOnWatchlist() {
  return new ProblemError(404, "WATCHLIST_ENTRY_NOT_FOUND", "The anime is not on the watchlist");
}

const meRoute = createRoute({
  ...personal,
  method: "get",
  path: "/me",
  summary: "Get the signed-in user",
  responses: {
    200: json(UserSchema, "The signed-in user."),
    401: unauthorized
  }
});

const watchlistRoute = createRoute({
  ...personal,
  method: "get",
  path: "/me/watchlist",
  summary: "List the watchlist",
  description: "Most recently changed first.",
  request: {
    query: z.object({
      status: WatchlistStatusSchema.optional()
    })
  },
  responses: {
    200: json(itemsOf(WatchlistItemSchema), "The watchlist."),
    401: unauthorized
  }
});

const watchlistEntryRoute = createRoute({
  ...personal,
  method: "get",
  path: "/me/watchlist/{animeId}",
  summary: "Get an anime's watchlist entry",
  request: {
    params: AnimeParams
  },
  responses: {
    200: json(WatchlistEntrySchema, "The entry."),
    401: unauthorized,
    404: problem("The anime is not on the watchlist.")
  }
});

const putWatchlistRoute = createRoute({
  ...personal,
  method: "put",
  path: "/me/watchlist/{animeId}",
  summary: "Add an anime to the watchlist or change its status",
  request: {
    params: AnimeParams,
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({
            status: WatchlistStatusSchema
          })
        }
      }
    }
  },
  responses: {
    200: json(WatchlistEntrySchema, "The status changed."),
    201: json(WatchlistEntrySchema, "The anime was added."),
    401: unauthorized,
    404: problem("No such anime."),
    422: problem("The body is invalid.")
  }
});

const deleteWatchlistRoute = createRoute({
  ...personal,
  method: "delete",
  path: "/me/watchlist/{animeId}",
  summary: "Remove an anime from the watchlist",
  request: {
    params: AnimeParams
  },
  responses: {
    204: {
      description: "Removed."
    },
    401: unauthorized,
    404: problem("The anime is not on the watchlist.")
  }
});

const progressRoute = createRoute({
  ...personal,
  method: "get",
  path: "/me/progress/{animeId}",
  summary: "Get progress for an anime",
  description: "Saved progress for every episode of the title, in title order.",
  request: {
    params: AnimeParams
  },
  responses: {
    200: json(itemsOf(EpisodeProgressSchema), "Progress per episode."),
    401: unauthorized,
    404: problem("No such anime.")
  }
});

const clearProgressRoute = createRoute({
  ...personal,
  method: "delete",
  path: "/me/progress/{animeId}",
  summary: "Forget progress for an anime",
  request: {
    params: AnimeParams
  },
  responses: {
    204: {
      description: "Forgotten."
    },
    401: unauthorized,
    404: problem("No such anime.")
  }
});

const putProgressRoute = createRoute({
  ...personal,
  method: "put",
  path: "/me/seasons/{seasonId}/episodes/{episode}/progress",
  summary: "Save progress for an episode",
  description:
    "Records a playback checkpoint. A checkpoint older than the saved one is ignored, so offline devices cannot overwrite newer progress. Watching moves the anime to `watching` on the watchlist; finishing a completed anime's finale moves it to `completed`.",
  request: {
    params: z.object({
      seasonId: SeasonIdParam,
      episode: EpisodeNumberParam
    }),
    body: {
      required: true,
      content: {
        "application/json": {
          schema: ProgressBodySchema
        }
      }
    }
  },
  responses: {
    204: {
      description: "Saved, or ignored as stale."
    },
    401: unauthorized,
    404: problem("No such season or playable episode."),
    422: problem("The body is invalid.")
  }
});

const continueWatchingRoute = createRoute({
  ...personal,
  method: "get",
  path: "/me/continue-watching",
  summary: "Continue watching",
  description:
    "One entry per recently played anime, most recent first, with the episode to resume. Finishing a season continues into the next one.",
  request: {
    query: z.object({
      limit: z.coerce.number().int().positive().max(50).default(20)
    })
  },
  responses: {
    200: json(itemsOf(ContinueWatchingItemSchema), "Where to resume."),
    401: unauthorized
  }
});

/** The signed-in user's own data. */
export const meRoutes = createRouter()
  .openapi(meRoute, (c) => {
    const { id, name, email, image } = c.var.user;
    return c.json(
      {
        id,
        name,
        email,
        image: image ?? null
      },
      200
    );
  })
  .openapi(watchlistRoute, async (c) => {
    const items = await getWatchlist(c.var.user.id, c.req.valid("query"));
    return c.json(
      {
        items: items.map(toWatchlistItemBody)
      },
      200
    );
  })
  .openapi(watchlistEntryRoute, async (c) => {
    const entry = await getWatchlistEntry(c.var.user.id, c.req.valid("param").animeId);
    if (!entry) {
      throw notOnWatchlist();
    }

    return c.json(toWatchlistEntryBody(entry), 200);
  })
  .openapi(putWatchlistRoute, async (c) => {
    const entry = await setWatchlistStatus(c.var.user.id, c.req.valid("param").animeId, c.req.valid("json").status);
    // A new entry has not been changed since it was added.
    return c.json(toWatchlistEntryBody(entry), entry.addedAt === entry.updatedAt ? 201 : 200);
  })
  .openapi(deleteWatchlistRoute, async (c) => {
    const removed = await removeFromWatchlist(c.var.user.id, c.req.valid("param").animeId);
    if (!removed) {
      throw notOnWatchlist();
    }

    return c.body(null, 204);
  })
  .openapi(progressRoute, async (c) => {
    const items = await getProgress(c.var.user.id, c.req.valid("param").animeId);
    return c.json(
      {
        items
      },
      200
    );
  })
  .openapi(clearProgressRoute, async (c) => {
    await clearProgress(c.var.user.id, c.req.valid("param").animeId);
    return c.body(null, 204);
  })
  .openapi(putProgressRoute, async (c) => {
    const { seasonId, episode } = c.req.valid("param");
    await recordProgress(c.var.user.id, {
      seasonId,
      episode,
      ...c.req.valid("json")
    });
    return c.body(null, 204);
  })
  .openapi(continueWatchingRoute, async (c) => {
    const items = await getContinueWatching(c.var.user.id, c.req.valid("query").limit);
    return c.json(
      {
        items: items.map(toContinueWatchingBody)
      },
      200
    );
  });
