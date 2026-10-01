/**
 * The Sora SDK: a typed client for the Sora API.
 *
 * @packageDocumentation
 */
export { SoraError } from "./error";
export {
	SoraClient,
	type ArtworkChanges,
	type BrowseParams,
	type EpisodeRef,
	type ImagesParams,
	type PlaybackPreferencesUpdate,
	type ProfileInput,
	type ReleasesParams,
	type RequestOptions,
	type Returned,
	type ScheduleParams,
	type SeasonRef,
	type SeriesOf,
	type SeriesParams,
	type Session,
	type SignIn,
	type SoraClientOptions,
} from "./sora";
export type {
	AnimeSeason,
	CountMeta,
	Envelope,
	PageMeta,
	PlaybackMedia,
	PlaybackMeta,
	PlaybackPreferences,
	PreparingTitle,
	Profile,
	ProfileAvatar,
	Release,
	ScheduledEpisode,
	ScheduleMeta,
	Season,
	SeasonEpisode,
	SeasonEpisodesMeta,
	SeasonMeta,
	SeasonsMeta,
	SeasonWithEpisodes,
	Series,
	SeriesCard,
	SeriesImage,
	SeriesMeta,
	SeriesWithEpisodes,
	UpcomingSeries,
	SkipSegment,
} from "@sora/api";
