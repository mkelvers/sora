/**
 * The API's models as clients receive them, in snake_case: what `results`
 * holds in each response, and the `meta` that comes with it.
 */
import type { z } from "@hono/zod-openapi";

import type { CountMetaSchema, PageMetaSchema, PreparingTitleSchema } from "./openapi/envelope";
import type {
	getSchedule,
	getSeason,
	listSeasons,
	getSeries,
	listSeasonEpisodes,
} from "./openapi/routes";
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
	SeasonEpisodeSchema,
	SeasonSchema,
	SeriesCardSchema,
	SeriesImageSchema,
	SeriesProgressSchema,
	SeriesSchema,
	UpcomingSeriesSchema,
	SkipSegmentSchema,
} from "./openapi/schemas";

export type SeriesCard = z.infer<typeof SeriesCardSchema>;
export type Series = z.infer<typeof SeriesSchema>;
export type UpcomingSeries = z.infer<typeof UpcomingSeriesSchema>;
export type SeriesImage = z.infer<typeof SeriesImageSchema>;
export type Season = z.infer<typeof SeasonSchema>;
export type SeasonEpisode = z.infer<typeof SeasonEpisodeSchema>;
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
export type Profile = z.infer<typeof ProfileSchema>;
export type ProfileAvatar = z.infer<typeof ProfileAvatarSchema>;
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
export type SeasonsMeta = SuccessBody<typeof listSeasons>["meta"];

/** The body of every successful JSON response. */
export interface Envelope<TResults, TMeta> {
	meta: TMeta;
	results: TResults;
}
