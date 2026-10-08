/**
 * The API's models as clients receive them, in snake_case: what `results`
 * holds in each response. The core defines them, once, as the schemas its
 * functions return and the OpenAPI document describes.
 */
import type { z } from "@hono/zod-openapi";

import type { PlaybackMetaSchema } from "./openapi/schemas";

export type {
	AnimeSeason,
	ContinueWatching,
	Episode,
	FranchisePart,
	NextEpisode,
	Notification,
	PlaybackMedia,
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
} from "@sora/core/contract";

export type PlaybackMeta = z.infer<typeof PlaybackMetaSchema>;
