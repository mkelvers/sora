/**
 * The Sora SDK: a typed client for the Sora API.
 *
 * @packageDocumentation
 */
export { SoraError } from "./error";
export {
	SoraClient,
	type RequestBody,
	type RequestInput,
	type RequestOptions,
	type RequestResults,
	type Route,
	type Session,
	type SignIn,
	type SoraClientOptions,
} from "./sora";
/** The API's routes, which {@link SoraClient.request} calls. */
export * as route from "@sora/api/contract";
export type {
	AnimeSeason,
	ContinueWatching,
	Episode,
	FranchisePart,
	NextEpisode,
	Notification,
	PlaybackMedia,
	PlaybackMeta,
	PlaybackPreferences,
	PlaybackPreferencesUpdate,
	Profile,
	ProfileAvatar,
	Progress,
	Release,
	ScheduledEpisode,
	Series,
	SeriesCard,
	SeriesImage,
	SeriesProgress,
	SkipSegment,
	UpcomingSeries,
	WatchlistEntry,
	WatchlistStatus,
} from "@sora/api";
