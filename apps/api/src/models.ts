/**
 * The API's models as clients receive them, in snake_case: what `results`
 * holds in each response. The core defines them, once, as the schemas its
 * functions return and the OpenAPI document describes.
 */
import type { z } from "@hono/zod-openapi";

import type { PlaybackMetaSchema } from "./openapi/schemas";

export type {
	AnimeSeason,
	Episode,
	FranchisePart,
	Release,
	ScheduledEpisode,
	Series,
	SeriesCard,
	SeriesImage,
	UpcomingSeries,
} from "@sora/core/models/series";
export type {
	ContinueWatching,
	NextEpisode,
	Notification,
	PlaybackPreferences,
	PlaybackPreferencesUpdate,
	Progress,
	SeriesProgress,
	WatchlistEntry,
	WatchlistStatus,
	WatchlistStatusEntry,
} from "@sora/core/models/library";
export type { PlaybackMedia, SkipSegment } from "@sora/core/models/playback";
export type { Profile, ProfileAvatar } from "@sora/core/models/profile";

export type PlaybackMeta = z.infer<typeof PlaybackMetaSchema>;
