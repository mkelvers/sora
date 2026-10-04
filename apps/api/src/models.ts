/**
 * The API's models as clients receive them, in snake_case: what `results`
 * holds in each response, and the `meta` that comes with it.
 */
import type { z } from "@hono/zod-openapi";

import type { CountMetaSchema, PageMetaSchema, PreparingTitleSchema } from "./openapi/envelope";
import type { getSchedule, getSeries, listEpisodes, listSeasons } from "./openapi/routes";
import type {
	ContinueWatchingSchema,
	NextEpisodeSchema,
	PlaybackMediaSchema,
	PlaybackMetaSchema,
	PlaybackPreferencesSchema,
	ProfileAvatarSchema,
	ProfileSchema,
	ProgressSchema,
	AnimeSeasonSchema,
	ReleaseSchema,
	ScheduledEpisodeSchema,
	EpisodeSchema,
	SeriesCardSchema,
	SeriesImageSchema,
	SeriesProgressSchema,
	SeriesSchema,
	UpcomingSeriesSchema,
	SkipSegmentSchema,
	WatchlistEntrySchema,
	WatchlistStatusSchema,
} from "./openapi/schemas";

export type SeriesCard = z.infer<typeof SeriesCardSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type UpcomingSeries = z.infer<typeof UpcomingSeriesSchema>;
export type SeriesImage = z.infer<typeof SeriesImageSchema>;
export type Episode = z.infer<typeof EpisodeSchema>;
export type ScheduledEpisode = z.infer<typeof ScheduledEpisodeSchema>;
export type Release = z.infer<typeof ReleaseSchema>;
export type AnimeSeason = z.infer<typeof AnimeSeasonSchema>;
export type PlaybackMedia = z.infer<typeof PlaybackMediaSchema>;
export type PlaybackMeta = z.infer<typeof PlaybackMetaSchema>;
export type PlaybackPreferences = z.infer<typeof PlaybackPreferencesSchema>;
export type Progress = z.infer<typeof ProgressSchema>;
export type NextEpisode = z.infer<typeof NextEpisodeSchema>;
export type ContinueWatching = z.infer<typeof ContinueWatchingSchema>;
export type SeriesProgress = z.infer<typeof SeriesProgressSchema>;
export type SkipSegment = z.infer<typeof SkipSegmentSchema>;
export type WatchlistEntry = z.infer<typeof WatchlistEntrySchema>;
export type WatchlistStatus = z.infer<typeof WatchlistStatusSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileAvatar = z.infer<typeof ProfileAvatarSchema>;
export type PageMeta = z.infer<typeof PageMetaSchema>;
export type PreparingTitle = z.infer<typeof PreparingTitleSchema>;
export type CountMeta = z.infer<typeof CountMetaSchema>;

/** A title as `getSeries` returns it with `episodes=true`: it carries its episodes. */
export type SeriesWithEpisodes = Series & {
	episodes: Episode[];
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
export type EpisodesMeta = SuccessBody<typeof listEpisodes>["meta"];
export type ScheduleMeta = SuccessBody<typeof getSchedule>["meta"];
export type SeasonsMeta = SuccessBody<typeof listSeasons>["meta"];

/** The body of every successful JSON response. */
export interface Envelope<TResults, TMeta> {
	meta: TMeta;
	results: TResults;
}
