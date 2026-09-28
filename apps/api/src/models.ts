/**
 * The API's models as clients receive them, in snake_case: what `results`
 * holds in each response, and the `meta` that comes with it.
 */
import type { z } from "@hono/zod-openapi";

import type { CountMetaSchema, PageMetaSchema, PreparingTitleSchema } from "./openapi/envelope";
import type {
	getHistory,
	getSchedule,
	getSeason,
	getSeries,
	getSeriesProgress,
	getWatchlist,
	listSeasonEpisodes,
} from "./openapi/routes";
import type {
	ContinueWatchingItemSchema,
	CurrentSeasonSchema,
	HistoryItemSchema,
	ImportSummarySchema,
	LibraryTitleSchema,
	NamedSeasonSchema,
	WatchlistItemSchema,
	WatchStatusSchema,
	EpisodeProgressSchema,
	SeasonCompletionSchema,
	PlaybackMediaSchema,
	PlaybackMetaSchema,
	ProfileSchema,
	ScheduledEpisodeSchema,
	SeasonEpisodeSchema,
	SeasonSchema,
	SeriesCardSchema,
	SeriesImageSchema,
	SeriesSchema,
	SkipSegmentSchema,
	TitleProgressSchema,
} from "./openapi/schemas";

export type SeriesCard = z.infer<typeof SeriesCardSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type SeriesImage = z.infer<typeof SeriesImageSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type SeasonEpisode = z.infer<typeof SeasonEpisodeSchema>;
export type ScheduledEpisode = z.infer<typeof ScheduledEpisodeSchema>;
export type PlaybackMedia = z.infer<typeof PlaybackMediaSchema>;
export type PlaybackMeta = z.infer<typeof PlaybackMetaSchema>;
export type SkipSegment = z.infer<typeof SkipSegmentSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type EpisodeProgress = z.infer<typeof EpisodeProgressSchema>;
export type SeasonCompletion = z.infer<typeof SeasonCompletionSchema>;
export type TitleProgress = z.infer<typeof TitleProgressSchema>;
export type ContinueWatchingItem = z.infer<typeof ContinueWatchingItemSchema>;
export type WatchStatus = z.infer<typeof WatchStatusSchema>;
export type NamedSeason = z.infer<typeof NamedSeasonSchema>;
export type CurrentSeason = z.infer<typeof CurrentSeasonSchema>;
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>;
export type LibraryTitle = z.infer<typeof LibraryTitleSchema>;
export type HistoryItem = z.infer<typeof HistoryItemSchema>;
export type ImportSummary = z.infer<typeof ImportSummarySchema>;
export type PageMeta = z.infer<typeof PageMetaSchema>;
export type PreparingTitle = z.infer<typeof PreparingTitleSchema>;
export type CountMeta = z.infer<typeof CountMetaSchema>;

/** A season as `getSeries` returns it with `episodes=true`. */
export type SeasonWithEpisodes = Season & {
	episodes: SeasonEpisode[];
};

/** A title as `getSeries` returns it with `episodes=true`: every season carries its episodes. */
export type SeriesWithEpisodes = Omit<Series, "seasons"> & {
	seasons: SeasonWithEpisodes[];
};

/** The body a route answers with on success. */
type SuccessBody<
	TRoute extends {
		responses: {
			200: {
				content: {
					"application/json": {
						schema: z.ZodType;
					};
				};
			};
		};
	},
> = z.infer<TRoute["responses"][200]["content"]["application/json"]["schema"]>;

export type SeriesMeta = SuccessBody<typeof getSeries>["meta"];
export type SeasonMeta = SuccessBody<typeof getSeason>["meta"];
export type SeasonEpisodesMeta = SuccessBody<typeof listSeasonEpisodes>["meta"];
export type ScheduleMeta = SuccessBody<typeof getSchedule>["meta"];
export type TitleProgressMeta = SuccessBody<typeof getSeriesProgress>["meta"];
export type WatchlistMeta = SuccessBody<typeof getWatchlist>["meta"];
export type HistoryMeta = SuccessBody<typeof getHistory>["meta"];

/** The body of every successful JSON response. */
export interface Envelope<TResults, TMeta> {
	meta: TMeta;
	results: TResults;
}
