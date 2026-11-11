import { createRoute, z } from "@hono/zod-openapi";
import {
	RatingSchema,
	WatchlistEntrySchema,
	WatchlistStatusEntrySchema,
	WatchlistStatusSchema,
} from "@sora/core/models/library";

import { CountMetaSchema, envelopeOf } from "../../openapi/envelope";
import {
	json,
	problem,
	SeriesIdParam,
	EmptyMetaSchema,
	signedIn,
	ProfileParams,
} from "../../openapi/schemas";

/** A profile's watchlist and ratings. */
export const watchlistRoute = {
	getRating: createRoute({
		description: "The stars the profile gave the title, or null when it has not rated it.",
		method: "get",
		operationId: "getRating",
		path: "/profiles/{profile_id}/series/{series_id}/rating",
		request: {
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			200: json(envelopeOf(RatingSchema, EmptyMetaSchema), "The rating."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Get the profile's rating of a title",
		tags: ["Profiles"],
	}),
	listWatchlist: createRoute({
		description:
			"Every title on the profile's watchlist with its status, the one whose status changed last first.",
		method: "get",
		operationId: "listWatchlist",
		path: "/profiles/{profile_id}/watchlist",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(z.array(WatchlistEntrySchema), CountMetaSchema), "The watchlist."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "The profile's watchlist",
		tags: ["Profiles"],
	}),
	listWatchlistStatuses: createRoute({
		description:
			"The ID and status of every title on the profile's watchlist, without the titles' cards. For knowing what is listed; `listWatchlist` has the cards.",
		method: "get",
		operationId: "listWatchlistStatuses",
		path: "/profiles/{profile_id}/watchlist/statuses",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelopeOf(z.array(WatchlistStatusEntrySchema), CountMetaSchema), "The statuses."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "The status of every title on the profile's watchlist",
		tags: ["Profiles"],
	}),
	removeFromWatchlist: createRoute({
		description: "Takes the title off the profile's watchlist. The profile's progress in it stays.",
		method: "delete",
		operationId: "removeFromWatchlist",
		path: "/profiles/{profile_id}/watchlist/{series_id}",
		request: {
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			204: {
				description: "Removed.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Take a title off the watchlist",
		tags: ["Profiles"],
	}),
	removeRating: createRoute({
		description: "Takes back the profile's rating of the title.",
		method: "delete",
		operationId: "removeRating",
		path: "/profiles/{profile_id}/series/{series_id}/rating",
		request: {
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			204: {
				description: "Removed.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Take back a rating",
		tags: ["Profiles"],
	}),
	setRating: createRoute({
		description:
			"Rates the title from 1 to 5 stars for the profile, or changes an earlier rating. How many stars say whether the profile liked it, which shapes what `listRecommendations` offers.",
		method: "put",
		operationId: "setRating",
		path: "/profiles/{profile_id}/series/{series_id}/rating",
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							rating: z.number().int().min(1).max(5),
						}),
					},
				},
				required: true,
			},
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			204: {
				description: "Set.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series does not exist."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Rate a title",
		tags: ["Profiles"],
	}),
	setWatchlistStatus: createRoute({
		description:
			"Puts the title on the profile's watchlist with the status given, or changes the status of one already there.",
		method: "put",
		operationId: "setWatchlistStatus",
		path: "/profiles/{profile_id}/watchlist/{series_id}",
		request: {
			body: {
				content: {
					"application/json": {
						schema: z.object({
							status: WatchlistStatusSchema,
						}),
					},
				},
				required: true,
			},
			params: ProfileParams.extend({
				series_id: SeriesIdParam,
			}),
		},
		responses: {
			204: {
				description: "Set.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile, or the series does not exist."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Put a title on the watchlist with a status",
		tags: ["Profiles"],
	}),
};
