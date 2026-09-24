import { z } from "@hono/zod-openapi";
import type { ContinueWatchingItem, EpisodeProgress, WatchlistEntry, WatchlistItem } from "@sora/core/library";

import { SeriesCardSchema } from "./series";

export const WatchlistStatusSchema = z.enum([
  "watching",
  "planning",
  "completed",
  "paused",
  "dropped"
]);

export const WatchlistEntrySchema = z
  .object({
    animeId: z.string(),
    status: WatchlistStatusSchema,
    addedAt: z.string(),
    updatedAt: z.string()
  })
  .openapi("WatchlistEntry");

export const WatchlistItemSchema = z
  .object({
    anime: SeriesCardSchema,
    status: WatchlistStatusSchema,
    addedAt: z.string(),
    updatedAt: z.string()
  })
  .openapi("WatchlistItem");

export const EpisodeProgressSchema = z
  .object({
    seasonId: z.string(),
    episode: z.number().int(),
    positionSeconds: z.number(),
    durationSeconds: z.number(),
    completed: z.boolean(),
    eventAt: z.string()
  })
  .openapi("EpisodeProgress") satisfies z.ZodType<EpisodeProgress>;

export const ContinueWatchingItemSchema = z
  .object({
    anime: SeriesCardSchema,
    seasonId: z.string(),
    episode: z.number().int(),
    positionSeconds: z.number(),
    durationSeconds: z.number().nullable(),
    lastWatchedAt: z.string()
  })
  .openapi("ContinueWatchingItem");

export const ProgressBodySchema = z
  .object({
    positionSeconds: z.number().nonnegative(),
    durationSeconds: z
      .number()
      .positive()
      .max(24 * 60 * 60),
    completed: z.boolean().optional().openapi({
      description: "Explicit completion, for \"mark as watched\". Derived from position and duration when omitted."
    }),
    eventAt: z.iso
      .datetime({
        offset: true
      })
      .openapi({
        description: "When the client observed this position. Later events win across devices."
      })
  })
  .openapi("ProgressUpdate");

/*
 * The API calls a title "anime" in every path and body; the core calls it a
 * series. These rename the field at the boundary.
 */

export function toWatchlistEntryBody({ seriesId, ...rest }: WatchlistEntry): z.infer<typeof WatchlistEntrySchema> {
  return {
    animeId: seriesId,
    ...rest
  };
}

export function toWatchlistItemBody({ series, ...rest }: WatchlistItem): z.infer<typeof WatchlistItemSchema> {
  return {
    anime: series,
    ...rest
  };
}

export function toContinueWatchingBody({ series, ...rest }: ContinueWatchingItem): z.infer<typeof ContinueWatchingItemSchema> {
  return {
    anime: series,
    ...rest
  };
}
