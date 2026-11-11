/**
 * The Sora SDK: a typed client for the Sora API.
 */
export { SoraError } from "./error";
export {
	SoraClient,
	type ChangePassword,
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
export { route } from "@sora/api/contract";
/** The rule a player picks the version and subtitles to show by. */
export { choosePlayback } from "@sora/core/playback/choice";
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
	ProfilePreferences,
	ImportConnection,
	ImportOptions,
	ImportUndo,
	LibraryExport,
	LibraryImport,
	LibraryImportReport,
	SignedInDevice,
	PlaybackPreferencesUpdate,
	Profile,
	ProfileAvatar,
	Progress,
	Release,
	ScheduledEpisode,
	Series,
	FeaturedCard,
	SeriesCard,
	SeriesImage,
	SeriesProgress,
	SkipSegment,
	Tag,
	UpcomingSeries,
	WatchlistEntry,
	WatchlistStatus,
	WatchlistStatusEntry,
} from "@sora/api/models";
