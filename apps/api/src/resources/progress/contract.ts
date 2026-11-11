import { createRoute, z } from "@hono/zod-openapi";
import {
	ContinueWatchingSchema,
	ProgressInputSchema,
	ProgressSchema,
	SeriesProgressSchema,
} from "@sora/core/models/library";
import { RecommendationRowSchema } from "@sora/core/models/series";

import { CountMetaSchema, envelopeOf } from "../../openapi/envelope";
import {
	EpisodeNumberParam,
	json,
	problem,
	SeriesIdParam,
	EmptyMetaSchema,
	signedIn,
	ProfileParams,
} from "../../openapi/schemas";

/** An episode, addressed under its series, under the profile whose progress it is. */
const ProfileEpisodeParams = ProfileParams.extend({
	episode: EpisodeNumberParam,
	series_id: SeriesIdParam,
});

/** A profile's progress, watched marks, rewatches, Continue Watching, and recommendations. */
export const progressRoute = {
	dismissContinueWatching: createRoute({
		description:
			"Takes the title out of `listContinueWatching`. The profile's progress in it stays, and so does its place on the watchlist; playing an episode of it brings it back.",
		method: "delete",
		operationId: "dismissContinueWatching",
		path: "/profiles/{profile_id}/continue-watching/{series_id}",
		request: {
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			204: {
				description: "Taken out, or was not listed.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Take a title's card out of Continue Watching",
		tags: ["Profiles"],
	}),
	getProgress: createRoute({
		description:
			"Where the profile stopped in the episode, to resume it from there, or null when the profile never played it.",
		method: "get",
		operationId: "getProgress",
		path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/progress",
		request: {
			params: ProfileEpisodeParams,
		},
		responses: {
			200: json(envelopeOf(ProgressSchema.nullable(), EmptyMetaSchema), "The progress."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "How far the profile is into an episode",
		tags: ["Profiles"],
	}),
	getSeriesProgress: createRoute({
		description:
			"The profile's progress in every episode of the title it played, to mark them in an episode list, and the episode to play next.",
		method: "get",
		operationId: "getSeriesProgress",
		path: "/profiles/{profile_id}/series/{series_id}/progress",
		request: {
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			200: json(envelopeOf(SeriesProgressSchema, EmptyMetaSchema), "The progress."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series does not exist."),
		},
		security: signedIn,
		summary: "How far the profile is through a title",
		tags: ["Profiles"],
	}),
	listContinueWatching: createRoute({
		description:
			"The titles the profile is in the middle of, the most recently played first, each with the episode to play next. A title is judged by the episode played last: while it is unfinished it is the one to play, and once it is finished the episode after it is. A title with no episode after it is left out until one comes out; finishing it never leads on into another title, such as its next season. Only the 30 most recently played titles are looked at.",
		method: "get",
		operationId: "listContinueWatching",
		path: "/profiles/{profile_id}/continue-watching",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(z.array(ContinueWatchingSchema), CountMetaSchema), "The titles."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Titles the profile is in the middle of",
		tags: ["Profiles"],
	}),
	listRecommendations: createRoute({
		description:
			"Rows of titles for the profile's home page, each with a heading that says why it is there: `Because you watched` one of its recent titles, more of its favourite genres, and for any profile the best liked titles and films. Never a title the profile played or listed, in any status, nor another season of one, and a title appears in one row only. A row has at least 8 titles, so a profile with little history gets fewer rows rather than short ones.",
		method: "get",
		operationId: "listRecommendations",
		path: "/profiles/{profile_id}/recommendations",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(z.array(RecommendationRowSchema), CountMetaSchema), "The rows."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Rows of titles recommended to the profile",
		tags: ["Profiles"],
	}),
	markEpisodeUnwatched: createRoute({
		description:
			"Forgets the profile's progress in the episode, so it is neither watched nor started: in the rewatch the profile is in the middle of, if any, else in its first viewing.",
		method: "delete",
		operationId: "markEpisodeUnwatched",
		path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/watched",
		request: {
			params: ProfileEpisodeParams,
		},
		responses: {
			204: {
				description: "Marked.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series has no such episode."),
		},
		security: signedIn,
		summary: "Mark an episode unwatched",
		tags: ["Profiles"],
	}),
	markEpisodeWatched: createRoute({
		description:
			"Marks the episode watched without playing it, as if it had been played to its end just now, in the rewatch the profile is in the middle of, if any. The watchlist status moves on as finishing it would.",
		method: "put",
		operationId: "markEpisodeWatched",
		path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/watched",
		request: {
			params: ProfileEpisodeParams,
		},
		responses: {
			204: {
				description: "Marked.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series has no such episode."),
		},
		security: signedIn,
		summary: "Mark an episode watched",
		tags: ["Profiles"],
	}),
	markSeriesWatched: createRoute({
		description:
			"Marks every episode the title lists watched without playing them, as if each had been played to its end just now. The watchlist status moves on as finishing them would. During a rewatch it ends the rewatch instead: its progress is forgotten, and only episodes the first viewing left unfinished are marked, so the rest keep when they were watched. `removeProgress` marks the title unwatched.",
		method: "put",
		operationId: "markSeriesWatched",
		path: "/profiles/{profile_id}/series/{series_id}/watched",
		request: {
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			204: {
				description: "Marked.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series does not exist."),
		},
		security: signedIn,
		summary: "Mark a title watched",
		tags: ["Profiles"],
	}),
	removeProgress: createRoute({
		description:
			"Forgets the profile's progress in every episode of the title, in its first viewing and any rewatch, which takes it out of `listContinueWatching`.",
		method: "delete",
		operationId: "removeProgress",
		path: "/profiles/{profile_id}/series/{series_id}/progress",
		request: {
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			204: {
				description: "Forgotten.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series does not exist."),
		},
		security: signedIn,
		summary: "Forget the profile's progress in a title",
		tags: ["Profiles"],
	}),
	saveProgress: createRoute({
		description:
			"Replaces what was remembered for the episode. A player sends it every few seconds while the episode plays, and when it is paused, left, or ends, and says each time whether the episode is over at that point. Stopping at second 0 of an unfinished episode is not remembered, since opening an episode is not watching it, and a finished episode stays as it was unless it is finished again. During a rewatch (see `startRewatch`) this is the rewatch's progress.",
		method: "put",
		operationId: "saveProgress",
		path: "/profiles/{profile_id}/series/{series_id}/episodes/{episode}/progress",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ProgressInputSchema,
					},
				},
				required: true,
			},
			params: ProfileEpisodeParams,
		},
		responses: {
			200: json(
				envelopeOf(ProgressSchema.nullable(), EmptyMetaSchema),
				"The progress as it now stands; null when the episode was never played past its start.",
			),
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series has no such episode."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Remember where the profile stopped in an episode",
		tags: ["Profiles"],
	}),
	startRewatch: createRoute({
		description:
			"Starts watching the title again from its first episode. Until the profile finishes its last episode again, or marks the title watched, what it plays is remembered apart from its first viewing, which stays as it was, and the progress and episode to play next in `getSeriesProgress` follow it (see `rewatch_started_at`).",
		method: "post",
		operationId: "startRewatch",
		path: "/profiles/{profile_id}/series/{series_id}/rewatch",
		request: {
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			204: {
				description: "Started.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series does not exist."),
		},
		security: signedIn,
		summary: "Watch a title again from the start",
		tags: ["Profiles"],
	}),
};
